import type { Payload } from 'payload'
import type { Payment } from '@/plugin/types/payments'
import type { BillingPluginConfig } from '@/plugin/config'
import { defaults } from '@/plugin/config'
import { extractSlug } from '@/plugin/utils'

/**
 * Common webhook response utilities
 */
export const webhookResponses = {
  success: () => Response.json({ received: true }, { status: 200 }),
  error: (message: string, status = 400) => Response.json({ error: message }, { status }),
  missingBody: () => Response.json({ error: 'Missing request body' }, { status: 400 }),
  paymentNotFound: () => Response.json({ error: 'Payment not found' }, { status: 404 }),
  invalidPayload: () => Response.json({ error: 'Invalid webhook payload' }, { status: 400 }),
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
 * Update payment status and provider data
 */
export async function updatePaymentStatus(
  payload: Payload,
  paymentId: string | number,
  status: Payment['status'],
  providerData: any,
  pluginConfig: BillingPluginConfig
): Promise<void> {
  const paymentsCollection = extractSlug(pluginConfig.collections?.payments || defaults.paymentsCollection)

  await payload.update({
    collection: paymentsCollection,
    id: paymentId,
    data: {
      status,
      providerData
    }
  })
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
    id: invoiceId,
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

  console.error(`${fullContext} Error:`, error)

  return Response.json({
    error: 'Webhook processing failed',
    details: message
  }, { status: 500 })
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