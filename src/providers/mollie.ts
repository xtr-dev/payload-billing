import type { Payment } from '../plugin/types/payments'
import type { Refund } from '../plugin/types/refunds'
import type { PaymentProvider } from '../plugin/types/index'
import type { BillingPluginConfig } from '../plugin/config'
import type { Payload } from 'payload'
import { createSingleton } from '../plugin/singleton'
import type { createMollieClient, MollieClient } from '@mollie/api-client'
import {
  webhookResponses,
  findPaymentByProviderId,
  updatePaymentStatus,
  updateInvoiceOnPaymentSuccess,
  handleWebhookError,
  upsertRefund,
  validateProductionUrl
} from './utils'
import { formatAmountForProvider, isValidAmount, isValidCurrencyCode, parseAmountFromProvider } from './currency'
import { createContextLogger } from '../utils/logger'

const symbol = Symbol.for('@xtr-dev/payload-billing/mollie')
export type MollieProviderConfig = Parameters<typeof createMollieClient>[0]

/**
 * Type-safe mapping of Mollie payment status to internal status
 */
function mapMollieStatusToPaymentStatus(mollieStatus: string): Payment['status'] {
  // Define known Mollie statuses for type safety
  const mollieStatusMap: Record<string, Payment['status']> = {
    'paid': 'succeeded',
    'failed': 'failed',
    'canceled': 'canceled',
    'expired': 'canceled',
    'pending': 'pending',
    'open': 'pending',
    'authorized': 'pending',
  }

  return mollieStatusMap[mollieStatus] || 'processing'
}

/**
 * Map Mollie refund status to internal refund status
 * @see https://docs.mollie.com/reference/refunds-api#refund-statuses
 */
function mapMollieRefundStatus(mollieStatus: string): Refund['status'] {
  const mollieRefundStatusMap: Record<string, Refund['status']> = {
    'queued': 'pending',
    'pending': 'pending',
    'processing': 'processing',
    'refunded': 'succeeded',
    'failed': 'failed',
    'canceled': 'canceled',
  }

  return mollieRefundStatusMap[mollieStatus] || 'processing'
}

/**
 * Mirror every refund Mollie holds for a payment into the refunds collection.
 * Each refund is synced independently so one failing write does not block the others
 * or the payment status update that follows.
 */
async function syncMollieRefunds(
  payload: Payload,
  mollieClient: MollieClient,
  molliePaymentId: string,
  payment: Payment,
  pluginConfig: BillingPluginConfig
): Promise<void> {
  const logger = createContextLogger(payload, 'Mollie Webhook')

  for await (const mollieRefund of mollieClient.paymentRefunds.iterate({ paymentId: molliePaymentId })) {
    try {
      await upsertRefund(payload, payment.id, {
        providerId: mollieRefund.id,
        status: mapMollieRefundStatus(mollieRefund.status),
        amount: parseAmountFromProvider(mollieRefund.amount.value, mollieRefund.amount.currency),
        currency: mollieRefund.amount.currency,
        description: mollieRefund.description || null,
        metadata: mollieRefund.metadata ?? null,
        providerData: typeof mollieRefund.toPlainObject === 'function'
          ? mollieRefund.toPlainObject()
          : { ...mollieRefund },
      }, pluginConfig)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`Failed to sync Mollie refund ${mollieRefund.id} for payment ${payment.id}: ${message}`)
    }
  }
}

export const mollieProvider = (mollieConfig: MollieProviderConfig & {
  webhookUrl?: string
  redirectUrl?: string
}) => {
  // Validate required configuration at initialization
  if (!mollieConfig.apiKey) {
    throw new Error('Mollie API key is required')
  }

  const singleton = createSingleton<MollieClient>(symbol)
  return {
    key: 'mollie',
    onConfig: (config, pluginConfig) => {
      // Always register Mollie webhook since it doesn't require a separate webhook secret
      // Mollie validates webhooks through payment ID verification
      config.endpoints = [
        ...(config.endpoints || []),
        {
          path: '/payload-billing/mollie/webhook',
          method: 'post',
          handler: async (req) => {
            try {
              const payload = req.payload
              const mollieClient = singleton.get(payload)

              // Parse the webhook body to get the Mollie payment ID
              if (!req.text) {
                return webhookResponses.missingBody()
              }
              const body = await req.text()
              if (!body || !body.startsWith('id=')) {
                return webhookResponses.invalidPayload()
              }

              const molliePaymentId = body.slice(3) // Remove 'id=' prefix

              // Fetch the payment details from Mollie
              const molliePayment = await mollieClient.payments.get(molliePaymentId)

              // Find the corresponding payment in our database
              const payment = await findPaymentByProviderId(payload, molliePaymentId, pluginConfig)

              if (!payment) {
                return webhookResponses.paymentNotFound()
              }

              // Map Mollie status to our status using proper type-safe mapping
              let status = mapMollieStatusToPaymentStatus(molliePayment.status)

              // Mollie keeps a refunded payment's status at 'paid' and calls this same webhook
              // when a refund is created or changes status, so refunds are derived from
              // amountRefunded and the payment's refund list rather than from the status.
              if (status === 'succeeded') {
                const refundedAmount = molliePayment.amountRefunded
                  ? parseAmountFromProvider(molliePayment.amountRefunded.value, molliePayment.amountRefunded.currency)
                  : 0

                // A refund list link also exists when all refunds failed or were canceled
                // (amountRefunded back to 0); syncing then records the final refund status.
                if (refundedAmount > 0 || molliePayment._links?.refunds) {
                  await syncMollieRefunds(payload, mollieClient, molliePaymentId, payment, pluginConfig)
                }

                if (refundedAmount > 0) {
                  const paidAmount = parseAmountFromProvider(molliePayment.amount.value, molliePayment.amount.currency)
                  status = refundedAmount >= paidAmount ? 'refunded' : 'partially_refunded'
                }
              }

              // Update the payment status and provider data
              // Use toPlainObject if available, otherwise spread the object
              const providerData = typeof molliePayment.toPlainObject === 'function'
                ? molliePayment.toPlainObject()
                : { ...molliePayment }
              const updateSuccess = await updatePaymentStatus(
                payload,
                payment.id,
                status,
                providerData,
                pluginConfig
              )

              // If payment is successful and update succeeded, update the invoice
              if (status === 'succeeded' && updateSuccess) {
                await updateInvoiceOnPaymentSuccess(payload, payment, pluginConfig)
              } else if (!updateSuccess) {
                const logger = createContextLogger(payload, 'Mollie Webhook')
                logger.warn(`Failed to update payment ${payment.id}, skipping invoice update`)
              }

              return webhookResponses.success()
            } catch (error) {
              return handleWebhookError('Mollie', error, undefined, req.payload)
            }
          }
        }
      ]
    },
    onInit: async (payload: Payload) => {
      const createMollieClient = (await import('@mollie/api-client')).default
      const mollieClient = createMollieClient(mollieConfig)
      singleton.set(payload, mollieClient)
    },
    initPayment: async (payload, payment) => {
      // Validate required fields
      if (!payment.amount) {
        throw new Error('Amount is required')
      }
      if (!payment.currency) {
        throw new Error('Currency is required')
      }

      // Validate amount
      if (!isValidAmount(payment.amount)) {
        throw new Error('Invalid amount: must be a positive integer within reasonable limits')
      }

      // Validate currency code
      if (!isValidCurrencyCode(payment.currency)) {
        throw new Error('Invalid currency: must be a 3-letter ISO code')
      }

      // Setup URLs with development defaults
      // Only use localhost fallbacks in non-production environments
      const isProduction = process.env.NODE_ENV === 'production'
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || process.env.PAYLOAD_PUBLIC_SERVER_URL || process.env.SERVER_URL

      // Priority: payment.redirectUrl > config.redirectUrl > dev fallback
      let redirectUrl = payment.redirectUrl || mollieConfig.redirectUrl
      if (!redirectUrl && !isProduction) {
        redirectUrl = 'https://localhost:3000/payment/success'
      }

      let webhookUrl = mollieConfig.webhookUrl
      if (!webhookUrl) {
        if (serverUrl) {
          webhookUrl = `${serverUrl}/api/payload-billing/mollie/webhook`
        } else if (!isProduction) {
          webhookUrl = 'https://localhost:3000/api/payload-billing/mollie/webhook'
        }
      }

      // Validate URLs for production
      validateProductionUrl(redirectUrl, 'Redirect')
      validateProductionUrl(webhookUrl, 'Webhook')

      const molliePayment = await singleton.get(payload).payments.create({
        amount: {
          value: formatAmountForProvider(payment.amount, payment.currency),
          currency: payment.currency.toUpperCase()
        },
        description: payment.description || '',
        redirectUrl,
        webhookUrl,
      });
      payment.providerId = molliePayment.id
      // Use toPlainObject if available, otherwise spread the object (for compatibility with different Mollie client versions)
      payment.providerData = typeof molliePayment.toPlainObject === 'function'
        ? molliePayment.toPlainObject()
        : { ...molliePayment }
      payment.checkoutUrl = molliePayment._links?.checkout?.href || null
      return payment
    },
  } satisfies PaymentProvider
}
