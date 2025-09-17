import type { Payload } from 'payload'
import type { Payment } from '@/plugin/types/payments'
import type { BillingPluginConfig } from '@/plugin/config'
import type { ProviderData } from './types'
import { defaults } from '@/plugin/config'
import { extractSlug, toPayloadId } from '@/plugin/utils'
import { markRequestAsWebhook } from './context'

/**
 * Common webhook response utilities
 * Note: Always return 200 for webhook acknowledgment to prevent information disclosure
 */
export const webhookResponses = {
  success: () => Response.json({ received: true }, { status: 200 }),
  error: (message: string, status = 400) => {
    // Log error internally but don't expose details
    console.error('[Webhook] Error:', message)
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
  const paymentsCollection = extractSlug(pluginConfig.collections?.payments || defaults.paymentsCollection)

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
 * Update payment status from webhook with proper context tracking
 */
export async function updatePaymentFromWebhook(
  payload: Payload,
  paymentId: string | number,
  status: Payment['status'],
  providerData: ProviderData<any>,
  pluginConfig: BillingPluginConfig,
  provider: string,
  eventType?: string
): Promise<boolean> {
  // Mark the request context as webhook before updating with metadata
  markRequestAsWebhook((payload as any).req, provider, 'payment_status_update', {
    paymentId: paymentId.toString(),
    newStatus: status,
    eventType,
    timestamp: new Date().toISOString()
  })

  return updatePaymentStatus(payload, paymentId, status, providerData, pluginConfig)
}

/**
 * Update payment status and provider data with atomic optimistic locking
 */
export async function updatePaymentStatus(
  payload: Payload,
  paymentId: string | number,
  status: Payment['status'],
  providerData: ProviderData<any>,
  pluginConfig: BillingPluginConfig
): Promise<boolean> {
  const paymentsCollection = extractSlug(pluginConfig.collections?.payments || defaults.paymentsCollection)

  // Get current payment to check version for atomic locking
  const currentPayment = await payload.findByID({
    collection: paymentsCollection,
    id: toPayloadId(paymentId)
  }) as Payment

  const now = new Date().toISOString()
  const nextVersion = (currentPayment.version || 1) + 1

  try {
    // Use update with version check for atomic optimistic locking
    const updatedPayment = await payload.update({
      collection: paymentsCollection,
      id: toPayloadId(paymentId),
      data: {
        status,
        version: nextVersion,
        providerData: {
          ...providerData,
          webhookProcessedAt: now,
          previousStatus: currentPayment.status
        }
      },
      where: {
        version: { equals: currentPayment.version || 1 }
      }
    })

    // If we get here without error, the update succeeded
    return true
  } catch (error: any) {
    // Check if this is a version mismatch (no documents found to update)
    if (error?.message?.includes('No documents found') ||
        error?.name === 'ValidationError' ||
        error?.status === 404) {
      console.warn(`[Payment Update] Optimistic lock failed for payment ${paymentId} - version mismatch (expected: ${currentPayment.version}, may have been updated by another process)`)
      return false
    }

    console.error(`[Payment Update] Failed to update payment ${paymentId}:`, error)
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
  if (!payment.invoice) return

  const invoicesCollection = extractSlug(pluginConfig.collections?.invoices || defaults.invoicesCollection)
  const invoiceId = typeof payment.invoice === 'object'
    ? payment.invoice.id
    : payment.invoice

  await payload.update({
    collection: invoicesCollection,
    id: toPayloadId(invoiceId),
    data: {
      status: 'paid',
      payment: payment.id
    }
  })
}

/**
 * Handle webhook errors with consistent logging
 */
export function handleWebhookError(
  provider: string,
  error: unknown,
  context?: string
): Response {
  const message = error instanceof Error ? error.message : 'Unknown error'
  const fullContext = context ? `[${provider} Webhook - ${context}]` : `[${provider} Webhook]`

  // Log detailed error internally for debugging
  console.error(`${fullContext} Error:`, error)

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
  details?: any
): void {
  console.log(`[${provider} Webhook] ${event}`, details ? JSON.stringify(details) : '')
}

/**
 * Validate URL for production use
 */
export function validateProductionUrl(url: string | undefined, urlType: string): void {
  const isProduction = process.env.NODE_ENV === 'production'

  if (!isProduction) return

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