import type { CollectionSlug, Payload, Where } from 'payload'
import type { Payment } from '../plugin/types/payments'
import type { BillingPluginConfig } from '../plugin/config'
import type { ProviderData } from './types'
import { defaults } from '../plugin/config'
import { extractSlug, toPayloadId } from '../plugin/utils'
import { createContextLogger } from '../utils/logger'

/**
 * Common webhook response utilities
 * Note: Always return 200 for webhook acknowledgment to prevent information disclosure
 */
export const webhookResponses = {
  success: () => Response.json({ received: true }, { status: 200 }),
  error: (message: string, status = 400, payload?: Payload) => {
    // Log error internally but don't expose details
    if (payload) {
      const logger = createContextLogger(payload, 'Webhook')
      logger.error(`Error: ${message}`)
    } else {
      console.error('[Webhook] Error:', message)
    }
    return Response.json({ error: 'Invalid request' }, { status })
  },
  missingBody: () => Response.json({ received: true }, { status: 200 }),
  paymentNotFound: () => Response.json({ received: true }, { status: 200 }),
  invalidPayload: () => Response.json({ received: true }, { status: 200 }),
}

/**
 * Find a payment by provider ID
 */
export async function findPaymentByProviderId(
  payload: Payload,
  providerId: string,
  pluginConfig: BillingPluginConfig
): Promise<Payment | null> {
  const paymentsCollection = extractSlug(pluginConfig.collections?.payments, defaults.paymentsCollection)

  const payments = await payload.find({
    collection: paymentsCollection,
    where: {
      providerId: {
        equals: providerId
      }
    }
  })

  return payments.docs.length > 0 ? payments.docs[0] as Payment : null
}

type PaymentStatus = Payment['status']

const ALL_PAYMENT_STATUSES: PaymentStatus[] = [
  'pending',
  'processing',
  'succeeded',
  'failed',
  'canceled',
  'refunded',
  'partially_refunded',
]

/**
 * Which statuses a provider update may move a payment to, per current status.
 *
 * - `pending` / `processing` are open and may move anywhere.
 * - `succeeded` may only move on to the refund statuses; a late or out-of-order
 *   webhook reporting `pending` must not undo a success.
 * - `failed` / `canceled` may still become `succeeded`: Stripe lets a customer retry a
 *   PaymentIntent after a failed attempt, and money the provider reports as received must
 *   never be dropped. `failed` may also become `canceled` (an abandoned intent).
 * - The refund statuses only move forward (`partially_refunded` -> `refunded`); the
 *   refund code derives them itself and does not go through this function.
 *
 * Writing the same status again is always allowed, so providerData can be refreshed.
 */
const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ALL_PAYMENT_STATUSES,
  processing: ALL_PAYMENT_STATUSES,
  succeeded: ['succeeded', 'partially_refunded', 'refunded'],
  failed: ['failed', 'succeeded', 'canceled'],
  canceled: ['canceled', 'succeeded'],
  partially_refunded: ['partially_refunded', 'refunded'],
  refunded: ['refunded'],
}

/**
 * Whether a provider-reported status may replace the payment's current status.
 * Unknown current statuses are treated as open, so data written by older versions
 * of the plugin is not locked.
 */
export function canTransitionPayment(from: PaymentStatus | null | undefined, to: PaymentStatus): boolean {
  if (!from || !PAYMENT_TRANSITIONS[from]) {return true}
  return PAYMENT_TRANSITIONS[from].includes(to)
}

/**
 * Claim the right to write the payment: succeeds only when the payment still has the
 * version that was read and its stored status may still move to `toStatus`. Returns false
 * when another writer changed the payment first or it has settled meanwhile.
 *
 * On MongoDB this is a real compare-and-set in the database (`updateOne` with the
 * conditions in its filter, i.e. findOneAndUpdate, which returns null when nothing
 * matched) that bumps the version, so it holds without transactions too (MongoDB without
 * a replica set). The SQL adapters cannot express that through Payload's adapter API
 * (their `updateOne` / `updateMany` write whole rows and pick the row in a separate
 * select), so there the payment is re-read, inside the transaction when there is one,
 * and compared.
 */
async function claimPaymentWrite(
  payload: Payload,
  collection: CollectionSlug,
  id: string | number,
  read: Payment,
  toStatus: PaymentStatus,
  req?: { transactionID: string | number },
): Promise<boolean> {
  const db = payload.db as Payload['db'] & { name?: string }

  if (db.name === 'mongoose') {
    const versionMatch: Where =
      typeof read.version === 'number'
        ? { version: { equals: read.version } }
        : { or: [{ version: { exists: false } }, { version: { equals: null } }] }
    const where: Where = {
      and: [
        { id: { equals: id } },
        versionMatch,
        { status: { in: ALL_PAYMENT_STATUSES.filter((from) => canTransitionPayment(from, toStatus)) } },
      ],
    }
    const claimed = await db.updateOne({
      collection,
      data: { version: (read.version || 1) + 1 },
      req,
      where,
    })
    return Boolean(claimed)
  }

  const current = await payload.findByID({ collection, id, ...(req ? { req } : {}) }) as Payment
  return (
    (current.version || 1) === (read.version || 1) &&
    canTransitionPayment(current.status, toStatus)
  )
}

/**
 * Update payment status and provider data with optimistic locking.
 *
 * Returns false (and writes nothing) when the payment has already settled into a status
 * the new one may not replace (see {@link canTransitionPayment}), or when another process
 * changed the payment between our read and our write. The write itself still goes through
 * `payload.update`, so the collection's hooks (and a host's afterChange hooks) see the real
 * status change with the correct previousDoc.
 *
 * On MongoDB two writers that read the same version can no longer both write, with or
 * without a transaction. Without a transaction a small window remains between the version
 * bump and the status write (two writes, so hooks still see the status change): a writer
 * that reads the payment inside that window can still overwrite it.
 */
export async function updatePaymentStatus(
  payload: Payload,
  paymentId: string | number,
  status: Payment['status'],
  providerData: ProviderData<any>,
  pluginConfig: BillingPluginConfig
): Promise<boolean> {
  const paymentsCollection = extractSlug(pluginConfig.collections?.payments, defaults.paymentsCollection)
  const logger = createContextLogger(payload, 'Payment Update')

  try {
    // First, fetch the current payment to get the current version
    const currentPayment = await payload.findByID({
      collection: paymentsCollection,
      id: toPayloadId(paymentId),
    }) as Payment

    if (!currentPayment) {
      logger.error(`Payment ${paymentId} not found`)
      return false
    }

    if (!canTransitionPayment(currentPayment.status, status)) {
      logger.warn(`Refusing to move payment ${paymentId} from ${currentPayment.status} to ${status}`)
      return false
    }

    const currentVersion = currentPayment.version || 1

    // Try to use transactions if supported by the database adapter
    let transactionID: string | number | null = null
    try {
      transactionID = await payload.db.beginTransaction()
    } catch (error) {
      // Transaction support may not be available in all database adapters
      logger.debug('Transactions not supported, falling back to direct update')
    }
    const req = transactionID ? { transactionID } : undefined

    try {
      const claimed = await claimPaymentWrite(
        payload,
        paymentsCollection,
        toPayloadId(paymentId),
        currentPayment,
        status,
        req,
      )
      if (!claimed) {
        // Another process changed the payment, or it settled, after we read it
        logger.warn(`Version conflict for payment ${paymentId} (expected version: ${currentVersion}), not updating to ${status}`)
        if (transactionID) {await payload.db.rollbackTransaction(transactionID)}
        return false
      }

      await payload.update({
        collection: paymentsCollection,
        id: toPayloadId(paymentId),
        data: {
          status,
          providerData: {
            ...providerData,
            webhookProcessedAt: new Date().toISOString()
          },
          version: currentVersion + 1
        },
        ...(req ? { req } : {}),
      })

      if (transactionID) {await payload.db.commitTransaction(transactionID)}
      return true
    } catch (error) {
      if (transactionID) {await payload.db.rollbackTransaction(transactionID)}
      throw error
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    logger.error(`Failed to update payment ${paymentId}: ${errorMessage}`)
    if (errorStack) {
      logger.error(`Stack trace: ${errorStack}`)
    }
    return false
  }
}

/**
 * Update invoice status when payment succeeds
 */
export async function updateInvoiceOnPaymentSuccess(
  payload: Payload,
  payment: Payment,
  pluginConfig: BillingPluginConfig
): Promise<void> {
  if (!payment.invoice) {return}

  const invoicesCollection = extractSlug(pluginConfig.collections?.invoices, defaults.invoicesCollection)
  const invoiceId = typeof payment.invoice === 'object'
    ? payment.invoice.id
    : payment.invoice

  await payload.update({
    collection: invoicesCollection,
    id: toPayloadId(invoiceId),
    data: {
      status: 'paid',
      payment: toPayloadId(payment.id)
    }
  })
}

/**
 * Handle webhook errors with consistent logging
 */
export function handleWebhookError(
  provider: string,
  error: unknown,
  context?: string,
  payload?: Payload
): Response {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined
  const fullContext = context ? `${provider} Webhook - ${context}` : `${provider} Webhook`

  // Log detailed error internally for debugging
  if (payload) {
    const logger = createContextLogger(payload, fullContext)
    logger.error(`Error: ${message}`)
    if (stack) {
      logger.error(`Stack trace: ${stack}`)
    }
  } else {
    console.error(`[${fullContext}] Error: ${message}`)
    if (stack) {
      console.error(`[${fullContext}] Stack trace:`, stack)
    }
  }

  // Return generic response to avoid information disclosure
  return Response.json({
    received: false,
    error: 'Processing error'
  }, { status: 200 })
}

/**
 * Log webhook events
 */
export function logWebhookEvent(
  provider: string,
  event: string,
  details?: any,
  payload?: Payload
): void {
  if (payload) {
    const logger = createContextLogger(payload, `${provider} Webhook`)
    logger.info(event, details ? JSON.stringify(details) : '')
  } else {
    console.log(`[${provider} Webhook] ${event}`, details ? JSON.stringify(details) : '')
  }
}

/**
 * Validate URL for production use
 */
export function validateProductionUrl(url: string | undefined, urlType: string): void {
  const isProduction = process.env.NODE_ENV === 'production'

  if (!isProduction) {return}

  if (!url) {
    throw new Error(`${urlType} URL is required for production`)
  }

  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    throw new Error(`${urlType} URL cannot use localhost in production`)
  }

  if (!url.startsWith('https://')) {
    throw new Error(`${urlType} URL must use HTTPS in production`)
  }

  // Basic URL validation
  try {
    new URL(url)
  } catch {
    throw new Error(`${urlType} URL is not a valid URL`)
  }
}
