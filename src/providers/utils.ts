import type { Payload } from 'payload'
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

/**
 * Update payment status and provider data with optimistic locking
 */
export async function updatePaymentStatus(
  payload: Payload,
  paymentId: string | number,
  status: Payment['status'],
  providerData: ProviderData<any>,
  pluginConfig: BillingPluginConfig
): Promise<boolean> {
  const paymentsCollection = extractSlug(pluginConfig.collections?.payments, defaults.paymentsCollection)

  try {
    // First, fetch the current payment to get the current version
    const currentPayment = await payload.findByID({
      collection: paymentsCollection,
      id: toPayloadId(paymentId),
    }) as Payment

    if (!currentPayment) {
      const logger = createContextLogger(payload, 'Payment Update')
      logger.error(`Payment ${paymentId} not found`)
      return false
    }

    const currentVersion = currentPayment.version || 1

    // Attempt to update with optimistic locking
    // We'll use a transaction to ensure atomicity
    const transactionID = await payload.db.beginTransaction()

    if (!transactionID) {
      const logger = createContextLogger(payload, 'Payment Update')
      logger.error('Failed to begin transaction')
      return false
    }

    try {
      // Re-fetch within transaction to ensure consistency
      const paymentInTransaction = await payload.findByID({
        collection: paymentsCollection,
        id: toPayloadId(paymentId),
        req: { transactionID }
      }) as Payment

      // Check if version still matches
      if ((paymentInTransaction.version || 1) !== currentVersion) {
        // Version conflict detected - payment was modified by another process
        const logger = createContextLogger(payload, 'Payment Update')
        logger.warn(`Version conflict for payment ${paymentId} (expected version: ${currentVersion}, got: ${paymentInTransaction.version})`)
        await payload.db.rollbackTransaction(transactionID)
        return false
      }

      // Update with new version
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
        req: { transactionID }
      })

      await payload.db.commitTransaction(transactionID)
      return true
    } catch (error) {
      await payload.db.rollbackTransaction(transactionID)
      throw error
    }
  } catch (error) {
    const logger = createContextLogger(payload, 'Payment Update')
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
