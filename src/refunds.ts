import type { Payload } from 'payload'
import type { Payment } from './plugin/types/payments'
import type { Refund } from './plugin/types/refunds'
import { defaults } from './plugin/config'
import { useBillingPlugin } from './plugin/index'
import { extractSlug, toPayloadId } from './plugin/utils'
import * as core from './providers/refunds'

export type RefundPaymentArgs = {
  /** The payment to refund (our document id, not the provider's). */
  paymentId: Payment['id']
  /** Cents. Omit to refund whatever is still refundable on the payment. */
  amount?: number
  description?: string
  reason?: Refund['reason']
  metadata?: Refund['metadata']
  /**
   * Makes the call safe to repeat: the same key returns the refund created the first time
   * instead of refunding again. Pass something derived from your own event (an order id, a
   * job id). Generated when omitted, which then protects only the provider call itself.
   */
  idempotencyKey?: string
}

/** The running plugin's config; throws when billingPlugin has not initialized. */
export const billing = (payload: Payload) => {
  const plugin = useBillingPlugin(payload)
  if (!plugin) {
    throw new Error('Billing plugin not initialized. Make sure billingPlugin is configured and Payload has finished initializing.')
  }
  return plugin.config
}

/** A reused key must describe the same refund; returning a different one would hide a caller bug. */
function assertSameRequest(existing: Refund, args: RefundPaymentArgs): Refund {
  const existingPayment = typeof existing.payment === 'object' ? existing.payment.id : existing.payment
  if (String(existingPayment) !== String(args.paymentId) || (args.amount !== undefined && existing.amount !== args.amount)) {
    throw new Error(`Idempotency key "${args.idempotencyKey}" was already used for a different refund`)
  }
  return existing
}

/**
 * Issue a refund through the payment's provider. Reserves the refund (creates its document),
 * checks the reservation against concurrent refunds of the payment, and only then sends it to
 * the provider. Creating a `pending` refund document by hand only reserves it; send it with
 * {@link processRefund} or the sweep. The returned refund has its provider id and `processing` /
 * `succeeded` / `failed` status (or `pending` if the provider could not be reached, in which
 * case {@link processPendingRefunds} retries it). Rejects when the payment is not refundable
 * or the amount exceeds what is left.
 */
export async function refundPayment(payload: Payload, args: RefundPaymentArgs): Promise<Refund> {
  const pluginConfig = billing(payload)
  const refundsSlug = extractSlug(pluginConfig.collections?.refunds, defaults.refundsCollection)

  const findByKey = async (key: string) =>
    ((await payload.find({ collection: refundsSlug, depth: 0, limit: 1, where: { idempotencyKey: { equals: key } } }))
      .docs[0] as Refund | undefined) ?? null

  if (args.idempotencyKey) {
    const existing = await findByKey(args.idempotencyKey)
    if (existing) {return core.processRefund(payload, pluginConfig, assertSameRequest(existing, args).id)}
  }

  let reserved: Refund
  try {
    reserved = (await payload.create({
      collection: refundsSlug,
      data: {
        amount: args.amount,
        description: args.description,
        idempotencyKey: args.idempotencyKey,
        metadata: args.metadata,
        payment: toPayloadId(args.paymentId),
        reason: args.reason,
        status: 'pending',
      } as any,
    })) as Refund
  } catch (error) {
    // Two callers with the same key raced: the unique key rejected the loser, who gets the winner's refund
    const raced = args.idempotencyKey ? await findByKey(args.idempotencyKey) : null
    if (raced) {return core.processRefund(payload, pluginConfig, assertSameRequest(raced, args).id)}
    throw error
  }
  // The reservation has committed; now verify it against concurrent refunds and send it
  return core.processRefund(payload, pluginConfig, reserved.id)
}

/** Retry the provider call of one refund still `pending` (see {@link core.processRefund}). */
export const processRefund = (payload: Payload, refundId: Refund['id']) =>
  core.processRefund(payload, billing(payload), refundId)

/** Retry every refund still `pending` without a provider refund. Run it from a cron or job. */
export const processPendingRefunds = (payload: Payload) => core.processPendingRefunds(payload, billing(payload))

/** Pull a payment's refunds from its provider (poll alternative to the webhook). */
export const syncPaymentRefunds = (payload: Payload, payment: Payment) =>
  core.syncPaymentRefunds(payload, billing(payload), payment)

/** Poll the provider for every open refund. Run it from a cron or job next to the webhook. */
export const syncOpenRefunds = (payload: Payload) => core.syncOpenRefunds(payload, billing(payload))
