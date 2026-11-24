import type { Payment } from '../plugin/types/payments'
import type { PaymentProvider, ProviderRefund } from '../plugin/types/index'
import type { Refund } from '../plugin/types/refunds'
import type { Payload } from 'payload'
import { createSingleton } from '../plugin/singleton'
import type { createMollieClient, MollieClient } from '@mollie/api-client'
import {
  webhookResponses,
  findPaymentByProviderId,
  updatePaymentStatus,
  updateInvoiceOnPaymentSuccess,
  handleWebhookError,
  validateProductionUrl
} from './utils'
import { formatAmountForProvider, isValidAmount, isValidCurrencyCode, parseAmountFromProvider } from './currency'
import { syncPaymentRefunds } from './refunds'
import { createContextLogger } from '../utils/logger'
import { fillReturnToken } from '../utils/returnToken'

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
 * Mollie refund status -> our refund status. Mollie's queued/pending/processing all mean
 * "accepted, money not back yet"; `refunded` is the only success.
 */
function mapMollieRefundStatus(mollieStatus: string): Refund['status'] {
  switch (mollieStatus) {
    case 'refunded':
      return 'succeeded'
    case 'failed':
      return 'failed'
    case 'canceled':
      return 'canceled'
    default:
      return 'processing'
  }
}

function toProviderRefund(refund: any): ProviderRefund {
  const raw = typeof refund.toPlainObject === 'function' ? refund.toPlainObject() : { ...refund }
  const status = mapMollieRefundStatus(refund.status)
  return {
    amount: parseAmountFromProvider(refund.amount.value, refund.amount.currency),
    currency: refund.amount.currency.toUpperCase(),
    failureReason: status === 'failed' || status === 'canceled' ? `Mollie refund ${refund.status}` : null,
    idempotencyKey: refund.metadata?.idempotencyKey ?? null,
    providerData: { provider: 'mollie', raw, timestamp: new Date().toISOString() },
    providerId: refund.id,
    status,
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
              const status = mapMollieStatusToPaymentStatus(molliePayment.status)

              // Mollie keeps reporting a refunded payment as `paid`; that must not undo the
              // refunded / partially_refunded status our refunds put on it.
              const keepRefundStatus =
                status === 'succeeded' && (payment.status === 'refunded' || payment.status === 'partially_refunded')

              // Update the payment status and provider data
              // Use toPlainObject if available, otherwise spread the object
              const providerData = typeof molliePayment.toPlainObject === 'function'
                ? molliePayment.toPlainObject()
                : { ...molliePayment }
              const updateSuccess = await updatePaymentStatus(
                payload,
                payment.id,
                keepRefundStatus ? payment.status : status,
                providerData,
                pluginConfig
              )

              // If payment is successful and update succeeded, update the invoice
              if (status === 'succeeded' && !keepRefundStatus && updateSuccess) {
                await updateInvoiceOnPaymentSuccess(payload, payment, pluginConfig)
              } else if (!updateSuccess) {
                const logger = createContextLogger(payload, 'Mollie Webhook')
                logger.warn(`Failed to update payment ${payment.id}, skipping invoice update`)
              }

              // (Only `paid` payments are synced: Mollie refunds only paid payments, and a
              // later canceled/expired status would not carry refunds.)
              // Mollie calls the payment's webhook again whenever one of its refunds changes
              // state, so refunds are synced here: provider refund id, status, and the
              // payment's (partially) refunded status all follow from the refund documents.
              if (status === 'succeeded' && updateSuccess) {
                await syncPaymentRefunds(payload, pluginConfig, payment)
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
    refundPayment: async (payload, request) => {
      const client = singleton.get(payload)
      const paymentId = request.payment.providerId as string

      // The Idempotency-Key header only protects for a limited time, so also look for a refund
      // already created for this key (kept in the refund's metadata) before creating one.
      const existing = (await client.paymentRefunds.page({ limit: 250, paymentId })) as unknown as any[]
      const duplicate = existing.find((refund) => refund.metadata?.idempotencyKey === request.idempotencyKey)
      if (duplicate) {
        return toProviderRefund(duplicate)
      }

      const extraMetadata =
        request.metadata && typeof request.metadata === 'object' && !Array.isArray(request.metadata)
          ? request.metadata
          : {}
      const refund = await client.paymentRefunds.create({
        amount: {
          currency: request.currency.toUpperCase(),
          value: formatAmountForProvider(request.amount, request.currency),
        },
        description: request.description || 'Refund',
        idempotencyKey: request.idempotencyKey,
        metadata: { ...extraMetadata, idempotencyKey: request.idempotencyKey },
        paymentId,
      })
      return toProviderRefund(refund)
    },
    fetchRefunds: async (payload, payment) => {
      const refunds = (await singleton.get(payload).paymentRefunds.page({
        limit: 250, // Mollie's maximum page size
        paymentId: payment.providerId as string,
      })) as unknown as any[]
      return refunds.map(toProviderRefund)
    },
    initPayment: async (payload, payment) => {
      // Validate required fields
      if (payment.amount == null) {
        throw new Error('Amount is required')
      }
      if (!payment.currency) {
        throw new Error('Currency is required')
      }

      // Validate amount
      if (!isValidAmount(payment.amount)) {
        throw new Error('Invalid amount: must be a non-negative integer within reasonable limits')
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
      let redirectUrl = fillReturnToken(payment.redirectUrl || mollieConfig.redirectUrl, payment)
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
