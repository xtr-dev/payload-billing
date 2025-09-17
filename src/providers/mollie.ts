import type { Payment } from '@/plugin/types/payments'
import type { PaymentProvider } from '@/plugin/types'
import type { Payload } from 'payload'
import { createSingleton } from '@/plugin/singleton'
import type { createMollieClient, MollieClient } from '@mollie/api-client'
import {
  webhookResponses,
  findPaymentByProviderId,
  updatePaymentStatus,
  updateInvoiceOnPaymentSuccess,
  handleWebhookError
} from './utils'
import { formatAmountForProvider, isValidAmount, isValidCurrencyCode } from './currency'

const symbol = Symbol('mollie')
export type MollieProviderConfig = Parameters<typeof createMollieClient>[0]

export const mollieProvider = (mollieConfig: MollieProviderConfig & {
  webhookUrl?: string
  redirectUrl?: string
}) => {
  const singleton = createSingleton<MollieClient>(symbol)
  return {
    key: 'mollie',
    onConfig: (config, pluginConfig) => {
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

              // Map Mollie status to our status
              let status: Payment['status'] = 'pending'
              // Cast to string to avoid ESLint enum comparison warning
              const mollieStatus = molliePayment.status as string
              switch (mollieStatus) {
                case 'paid':
                  status = 'succeeded'
                  break
                case 'failed':
                  status = 'failed'
                  break
                case 'canceled':
                case 'expired':
                  status = 'canceled'
                  break
                case 'pending':
                case 'open':
                case 'authorized':
                  status = 'pending'
                  break
                default:
                  status = 'processing'
              }

              // Update the payment status and provider data
              await updatePaymentStatus(
                payload,
                payment.id,
                status,
                molliePayment.toPlainObject(),
                pluginConfig
              )

              // If payment is successful and linked to an invoice, update the invoice
              if (status === 'succeeded') {
                await updateInvoiceOnPaymentSuccess(payload, payment, pluginConfig)
              }

              return webhookResponses.success()
            } catch (error) {
              return handleWebhookError('Mollie', error)
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

      // Validate URLs in production
      const isProduction = process.env.NODE_ENV === 'production'
      const redirectUrl = mollieConfig.redirectUrl ||
        (!isProduction ? 'https://localhost:3000/payment/success' : undefined)
      const webhookUrl = mollieConfig.webhookUrl ||
        `${process.env.PAYLOAD_PUBLIC_SERVER_URL || (!isProduction ? 'https://localhost:3000' : '')}/api/payload-billing/mollie/webhook`

      if (isProduction) {
        if (!redirectUrl || redirectUrl.includes('localhost')) {
          throw new Error('Valid redirect URL is required for production')
        }
        if (!webhookUrl || webhookUrl.includes('localhost')) {
          throw new Error('Valid webhook URL is required for production')
        }
      }

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
      payment.providerData = molliePayment.toPlainObject()
      return payment
    },
  } satisfies PaymentProvider
}
