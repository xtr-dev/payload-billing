import type { Payment } from '@/plugin/types/payments'
import type { InitPayment, PaymentProvider } from '@/plugin/types'
import type { Config, Payload } from 'payload'
import { createSingleton } from '@/plugin/singleton'
import type { createMollieClient, MollieClient } from '@mollie/api-client'
import { defaults } from '@/plugin/config'
import { extractSlug } from '@/plugin/utils'

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
                return Response.json({ error: 'Missing request body' }, { status: 400 })
              }
              const body = await req.text()
              if (!body || !body.startsWith('id=')) {
                return Response.json({ error: 'Invalid webhook payload' }, { status: 400 })
              }

              const molliePaymentId = body.slice(3) // Remove 'id=' prefix

              // Fetch the payment details from Mollie
              const molliePayment = await mollieClient.payments.get(molliePaymentId)

              // Find the corresponding payment in our database
              const paymentsCollection = extractSlug(pluginConfig.collections?.payments || defaults.paymentsCollection)
              const payments = await payload.find({
                collection: paymentsCollection,
                where: {
                  providerId: {
                    equals: molliePaymentId
                  }
                }
              })

              if (payments.docs.length === 0) {
                return Response.json({ error: 'Payment not found' }, { status: 404 })
              }

              const paymentDoc = payments.docs[0]

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
              await payload.update({
                collection: paymentsCollection,
                id: paymentDoc.id,
                data: {
                  status,
                  providerData: molliePayment.toPlainObject()
                }
              })

              // If payment is successful and linked to an invoice, update the invoice
              const invoicesCollection = extractSlug(pluginConfig.collections?.invoices || defaults.invoicesCollection)
              const payment = paymentDoc as Payment

              if (status === 'succeeded' && payment.invoice) {
                const invoiceId = typeof payment.invoice === 'object'
                  ? payment.invoice.id
                  : payment.invoice

                await payload.update({
                  collection: invoicesCollection,
                  id: invoiceId,
                  data: {
                    status: 'paid',
                    payment: paymentDoc.id
                  }
                })
              }

              return Response.json({ received: true }, { status: 200 })
            } catch (error) {
              console.error('[Mollie Webhook] Error processing webhook:', error)
              return Response.json({
                error: 'Webhook processing failed',
                details: error instanceof Error ? error.message : 'Unknown error'
              }, { status: 500 })
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
      if (!payment.amount) {
        throw new Error('Amount is required')
      }
      if (!payment.currency) {
        throw new Error('Currency is required')
      }
      const molliePayment = await singleton.get(payload).payments.create({
        amount: {
          value: (payment.amount / 100).toFixed(2),
          currency: payment.currency
        },
        description: payment.description || '',
        redirectUrl: mollieConfig.redirectUrl || 'https://localhost:3000/payment/success',
        webhookUrl: mollieConfig.webhookUrl || `${process.env.PAYLOAD_PUBLIC_SERVER_URL || 'https://localhost:3000'}/api/payload-billing/mollie/webhook`,
      });
      payment.providerId = molliePayment.id
      payment.providerData = molliePayment.toPlainObject()
      return payment
    },
  } satisfies PaymentProvider
}
