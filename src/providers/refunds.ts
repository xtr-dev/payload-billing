import type { Payload, Where } from 'payload'
import type { BillingPluginConfig } from '../plugin/config'
import type { Payment } from '../plugin/types/payments'
import type { Refund } from '../plugin/types/refunds'
import type { PaymentProvider, ProviderRefund } from './types'
import { defaults } from '../plugin/config'
import { extractSlug, toPayloadId } from '../plugin/utils'
import { createContextLogger } from '../utils/logger'

type RefundStatus = Refund['status']

/** Statuses a refund can still move on from. */
const OPEN_STATUSES: RefundStatus[] = ['pending', 'processing']
/**
 * Statuses the provider can still move a refund on from. A refund the provider has accepted
 * is `processing` or terminal; `pending` with a providerId is only a hand-made record.
 */
const PROVIDER_OPEN_STATUSES: RefundStatus[] = ['processing']

/**
 * Matches refunds that are not marked `manual`. Rows written before the field existed have
 * no value (NULL / missing), so those count as not manual too.
 */
const NOT_MANUAL: Where = {
  or: [{ manual: { equals: false } }, { manual: { exists: false } }],
}

/** Statuses that count against what can still be refunded. */
const RESERVING_STATUSES: RefundStatus[] = ['pending', 'processing', 'succeeded']
/** Payment statuses a refund can be issued against. */
const REFUNDABLE_PAYMENT_STATUSES: Payment['status'][] = ['succeeded', 'partially_refunded']

/**
 * Every refund matching `where`, oldest first, with only the fields a sweep needs. Reads all
 * matches up front (not a page of them), so rows that stay open cannot crowd out newer ones,
 * and rows that change while the sweep runs cannot shift an offset.
 */
async function findAllRefunds(
  payload: Payload,
  pluginConfig: BillingPluginConfig,
  where: Where,
): Promise<Pick<Refund, 'id' | 'payment'>[]> {
  const refundsSlug = extractSlug(pluginConfig.collections?.refunds, defaults.refundsCollection)
  const result = await payload.find({
    collection: refundsSlug,
    depth: 0,
    pagination: false,
    select: { payment: true },
    sort: 'createdAt',
    where,
  })
  return result.docs as Pick<Refund, 'id' | 'payment'>[]
}

const rank = (status: RefundStatus) => (status === 'pending' ? 0 : status === 'processing' ? 1 : 2)

/**
 * Refund statuses only move forward: pending -> processing -> a terminal state. A late or
 * duplicated webhook/poll that reports an earlier state must not undo a later one.
 */
export function canTransitionRefund(from: RefundStatus, to: RefundStatus): boolean {
  if (from === to) {return false}
  if (!OPEN_STATUSES.includes(from)) {return false}
  return rank(to) >= rank(from)
}

const paymentId = (value: Refund['payment']): Payment['id'] =>
  typeof value === 'object' && value !== null ? value.id : value

export function getProvider(pluginConfig: BillingPluginConfig, key: string): PaymentProvider | undefined {
  return (pluginConfig.providers || []).find((provider) => provider?.key === key) || undefined
}

/**
 * Sum refunds of a payment by status group (in cents).
 */
export async function sumRefunds(
  payload: Payload,
  pluginConfig: BillingPluginConfig,
  id: Payment['id'],
  statuses: RefundStatus[],
  excludeRefundId?: Refund['id'],
): Promise<number> {
  const refundsSlug = extractSlug(pluginConfig.collections?.refunds, defaults.refundsCollection)
  // Reads at most 1000 refunds of one payment. A payment with more than that would be under-counted
  // (and could be over-refunded), which is far beyond any realistic number of refunds per payment.
  const result = await payload.find({
    collection: refundsSlug,
    depth: 0,
    limit: 1000,
    pagination: false,
    where: {
      and: [
        { payment: { equals: id } },
        { status: { in: statuses } },
        ...(excludeRefundId === undefined ? [] : [{ id: { not_equals: excludeRefundId } }]),
      ],
    },
  })
  return (result.docs as Refund[]).reduce((sum, refund) => sum + (refund.amount || 0), 0)
}

/**
 * Early rejection when the refund cannot be issued: payment not refundable, wrong currency, or
 * more than what is left after the refunds already pending, processing or succeeded.
 *
 * This is only a fast, friendly check and is check-then-create, so it cannot stop two concurrent
 * refunds. That is processRefund's reserve, verify, send step, which runs before any provider call.
 */
export async function validateRefundRequest(
  payload: Payload,
  pluginConfig: BillingPluginConfig,
  payment: Payment,
  data: { amount?: number | null; currency?: string | null },
): Promise<{ amount: number; currency: string }> {
  if (payment.status === 'refunded') {
    throw new Error(`Payment ${payment.id} is already fully refunded`)
  }
  if (!REFUNDABLE_PAYMENT_STATUSES.includes(payment.status)) {
    throw new Error(`Payment ${payment.id} is ${payment.status}; only a succeeded payment can be refunded`)
  }
  const currency = (data.currency || payment.currency).toUpperCase()
  if (currency !== payment.currency.toUpperCase()) {
    throw new Error(`Refund currency ${currency} does not match payment currency ${payment.currency}`)
  }
  const remaining = payment.amount - (await sumRefunds(payload, pluginConfig, payment.id, RESERVING_STATUSES))
  const amount = data.amount ?? remaining
  if (!Number.isInteger(amount) || amount < 1) {
    throw new Error(remaining < 1 ? `Payment ${payment.id} is already fully refunded` : 'Refund amount must be a positive integer (in cents)')
  }
  if (amount > remaining) {
    throw new Error(`Refund amount ${amount} exceeds the ${remaining} still refundable on payment ${payment.id}`)
  }
  return { amount, currency }
}

/**
 * Errors worth retrying later (network, 5xx, rate limit) leave the refund `pending`;
 * a 4xx answer means the provider rejected it, which retrying cannot fix.
 */
function isRejection(error: unknown): boolean {
  const status = (error as { statusCode?: number; status?: number })?.statusCode ?? (error as { status?: number })?.status
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429
}

/**
 * Ask the provider to carry out a refund. Never throws for provider trouble: a rejection
 * becomes `failed` (with the reason), a transient error leaves it `pending` with the reason
 * so a sweep can retry. The idempotency key makes that retry safe.
 */
export async function submitRefundToProvider(
  payload: Payload,
  pluginConfig: BillingPluginConfig,
  payment: Payment,
  refund: Pick<Refund, 'amount' | 'currency' | 'description' | 'reason' | 'metadata' | 'idempotencyKey'>,
): Promise<Pick<Refund, 'providerId' | 'status' | 'failureReason' | 'providerData'>> {
  const logger = createContextLogger(payload, 'Refunds')
  const provider = getProvider(pluginConfig, payment.provider)
  if (!provider?.refundPayment) {
    throw new Error(
      `Provider "${payment.provider}" cannot issue refunds; create the refund with the provider's refund id (providerId) to record one made elsewhere`,
    )
  }
  try {
    const result = await provider.refundPayment(payload, {
      amount: refund.amount,
      currency: refund.currency,
      description: refund.description,
      idempotencyKey: refund.idempotencyKey as string,
      metadata: refund.metadata,
      payment,
      reason: refund.reason,
    })
    return {
      failureReason: result.failureReason ?? null,
      providerData: result.providerData as Refund['providerData'],
      providerId: result.providerId,
      status: result.status,
    }
  } catch (error) {
    // failureReason is readable by anyone who can read refunds: keep it short
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 300)
    if (isRejection(error)) {
      logger.error(`Provider rejected refund for payment ${payment.id}: ${message}`)
      return { failureReason: message, status: 'failed' }
    }
    logger.warn(`Refund for payment ${payment.id} not sent (will stay pending for a retry): ${message}`)
    return { failureReason: message, status: 'pending' }
  }
}

/**
 * Carry out a reserved refund: verify it against the other reservations, then send it.
 *
 * Over-refund protection is reserve, verify, send. The refund document (the reservation) is
 * already committed when this runs. It counts every other pending, processing or succeeded refund
 * of the payment; if those plus this one exceed the payment, this refund is marked `failed` and
 * the provider is never called. Whichever of two concurrent refunds verifies later sees the
 * other's committed reservation, so at least one always fails; if both verify after both
 * committed, both fail (safe, retry one). Needs no transactions or row locks, but does need that a
 * committed write is visible to the next read: true for a single primary at read-committed or
 * stronger, NOT for lagging read replicas or Mongo reads from secondaries, where two refunds can
 * both pass verification and the over-refund race is back.
 *
 * Also the sweep for refunds left `pending` by a transient error. Safe to call repeatedly and
 * concurrently: the provider dedupes on the refund's idempotency key.
 */
export async function processRefund(
  payload: Payload,
  pluginConfig: BillingPluginConfig,
  refundId: Refund['id'],
): Promise<Refund> {
  const refundsSlug = extractSlug(pluginConfig.collections?.refunds, defaults.refundsCollection)
  const paymentsSlug = extractSlug(pluginConfig.collections?.payments, defaults.paymentsCollection)
  const refund = (await payload.findByID({ id: toPayloadId(refundId), collection: refundsSlug, depth: 0 })) as Refund
  if (refund.providerId || refund.status !== 'pending' || refund.manual) {
    return refund
  }
  const payment = (await payload.findByID({
    id: toPayloadId(paymentId(refund.payment)),
    collection: paymentsSlug,
    depth: 0,
  })) as Payment

  const reservedByOthers = (
    await sumRefunds(payload, pluginConfig, payment.id, RESERVING_STATUSES, refund.id)
  )
  if (reservedByOthers + refund.amount > payment.amount) {
    return (await payload.update({
      collection: refundsSlug,
      data: {
        failureReason: `Exceeds the refundable amount of payment ${payment.id} (other refunds reserve ${reservedByOthers} of ${payment.amount})`,
        status: 'failed',
      } as any,
      id: toPayloadId(refund.id),
    })) as Refund
  }

  const result = await submitRefundToProvider(payload, pluginConfig, payment, refund)
  return (await payload.update({
    collection: refundsSlug,
    data: result,
    id: toPayloadId(refund.id),
  })) as Refund
}

/**
 * Retry every refund still `pending` without a provider refund, except `manual` ones. Meant
 * for a cron / job queue.
 */
export async function processPendingRefunds(payload: Payload, pluginConfig: BillingPluginConfig): Promise<Refund[]> {
  const pending = await findAllRefunds(payload, pluginConfig, {
    and: [{ status: { equals: 'pending' } }, { providerId: { exists: false } }, NOT_MANUAL],
  })
  const done: Refund[] = []
  for (const refund of pending) {
    done.push(await processRefund(payload, pluginConfig, refund.id))
  }
  return done
}

/**
 * Create or advance the refund document for a refund the provider reports. Matches on the
 * provider refund id, then on the idempotency key (a document whose submit succeeded at the
 * provider but whose providerId was never stored). Unknown refunds, e.g. made by staff in
 * the provider dashboard, are recorded.
 */
export async function applyProviderRefund(
  payload: Payload,
  pluginConfig: BillingPluginConfig,
  payment: Payment,
  reported: ProviderRefund,
): Promise<Refund | null> {
  const refundsSlug = extractSlug(pluginConfig.collections?.refunds, defaults.refundsCollection)
  const find = async (where: Where) =>
    ((await payload.find({ collection: refundsSlug, depth: 0, limit: 1, where })).docs[0] as Refund | undefined) ?? null

  let existing = await find({ providerId: { equals: reported.providerId } })
  if (!existing && reported.idempotencyKey) {
    existing = await find({ idempotencyKey: { equals: reported.idempotencyKey } })
  }

  if (!existing) {
    return (await payload.create({
      collection: refundsSlug,
      data: {
        amount: reported.amount,
        currency: reported.currency,
        failureReason: reported.failureReason ?? null,
        payment: toPayloadId(payment.id),
        providerData: reported.providerData,
        providerId: reported.providerId,
        status: reported.status,
      } as any,
    })) as Refund
  }

  const data: Partial<Refund> = {}
  if (!existing.providerId) {data.providerId = reported.providerId}
  if (canTransitionRefund(existing.status, reported.status)) {
    data.status = reported.status
    data.failureReason = reported.failureReason ?? existing.failureReason ?? null
  }
  if (reported.providerData && Object.keys(data).length > 0) {
    data.providerData = reported.providerData as Refund['providerData']
  }
  if (Object.keys(data).length === 0) {
    return existing
  }
  return (await payload.update({ collection: refundsSlug, data, id: toPayloadId(existing.id) })) as Refund
}

/**
 * Pull the provider's refunds for a payment into our refund documents (webhook handler and
 * polling entry point). No-op for providers without `fetchRefunds`.
 */
export async function syncPaymentRefunds(
  payload: Payload,
  pluginConfig: BillingPluginConfig,
  payment: Payment,
): Promise<Refund[]> {
  const provider = getProvider(pluginConfig, payment.provider)
  if (!provider?.fetchRefunds) {return []}
  const reported = await provider.fetchRefunds(payload, payment)
  const synced: Refund[] = []
  for (const item of reported) {
    const refund = await applyProviderRefund(payload, pluginConfig, payment, item)
    if (refund) {synced.push(refund)}
  }
  return synced
}

/**
 * Poll every refund the provider is still working on (`processing` with a provider refund
 * id, not `manual`), once per payment. Meant for a cron / job queue, alongside webhooks.
 */
export async function syncOpenRefunds(payload: Payload, pluginConfig: BillingPluginConfig): Promise<void> {
  const paymentsSlug = extractSlug(pluginConfig.collections?.payments, defaults.paymentsCollection)
  const open = await findAllRefunds(payload, pluginConfig, {
    and: [{ status: { in: PROVIDER_OPEN_STATUSES } }, { providerId: { exists: true } }, NOT_MANUAL],
  })
  const seen = new Set<string>()
  for (const refund of open) {
    const id = paymentId(refund.payment)
    if (seen.has(String(id))) {continue}
    seen.add(String(id))
    const payment = (await payload.findByID({ collection: paymentsSlug, depth: 0, id: toPayloadId(id) })) as Payment
    await syncPaymentRefunds(payload, pluginConfig, payment)
  }
}

/**
 * Derive the payment's refunded / partially_refunded status from its succeeded refunds.
 * Only touches payments that are paid or already (partially) refunded.
 */
export async function updatePaymentRefundStatus(
  payload: Payload,
  pluginConfig: BillingPluginConfig,
  id: Payment['id'],
): Promise<void> {
  const paymentsSlug = extractSlug(pluginConfig.collections?.payments, defaults.paymentsCollection)
  const payment = (await payload.findByID({ collection: paymentsSlug, depth: 0, id: toPayloadId(id) })) as Payment
  if (payment.status !== 'succeeded' && payment.status !== 'partially_refunded' && payment.status !== 'refunded') {
    return
  }
  const refunded = await sumRefunds(payload, pluginConfig, payment.id, ['succeeded'])
  const next: Payment['status'] =
    refunded >= payment.amount ? 'refunded' : refunded > 0 ? 'partially_refunded' : 'succeeded'
  if (next !== payment.status) {
    await payload.update({ collection: paymentsSlug, data: { status: next }, id: toPayloadId(payment.id) })
  }
}
