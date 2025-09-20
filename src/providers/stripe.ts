import type { Payment } from '../plugin/types/payments'
import type { PaymentProvider, ProviderData } from '../plugin/types/index'
import type { Payload } from 'payload'
import { createSingleton } from '../plugin/singleton'
import type Stripe from 'stripe'
import {
  webhookResponses,
  findPaymentByProviderId,
  updatePaymentStatus,
  updateInvoiceOnPaymentSuccess,
  handleWebhookError,
  logWebhookEvent
} from './utils'
import { isValidAmount, isValidCurrencyCode } from './currency'
import { createContextLogger } from '../utils/logger'

const symbol = Symbol('stripe')

export interface StripeProviderConfig {
  secretKey: string
  webhookSecret?: string
  apiVersion?: Stripe.StripeConfig['apiVersion']
  returnUrl?: string
  webhookUrl?: string
}

// Default API version for consistency
const DEFAULT_API_VERSION: Stripe.StripeConfig['apiVersion'] = '2025-08-27.basil'

export const stripeProvider = (stripeConfig: StripeProviderConfig) => {
  // Validate required configuration at initialization
  if (!stripeConfig.secretKey) {
    throw new Error('Stripe secret key is required')
  }

  const singleton = createSingleton<Stripe>(symbol)

  return {
    key: 'stripe',
    onConfig: (config, pluginConfig) => {
      // Only register webhook endpoint if webhook secret is configured
      if (stripeConfig.webhookSecret) {
        config.endpoints = [
          ...(config.endpoints || []),
          {
            path: '/payload-billing/stripe/webhook',
            method: 'post',
            handler: async (req) => {
            try {
              const payload = req.payload
              const stripe = singleton.get(payload)

              // Get the raw body for signature verification
              let body: string
              try {
                if (!req.text) {
                  return webhookResponses.missingBody()
                }
                body = await req.text()
                if (!body) {
                  return webhookResponses.missingBody()
                }
              } catch (error) {
                return handleWebhookError('Stripe', error, 'Failed to read request body', req.payload)
              }

              const signature = req.headers.get('stripe-signature')

              if (!signature) {
                return webhookResponses.error('Missing webhook signature', 400, req.payload)
              }

              // webhookSecret is guaranteed to exist since we only register this endpoint when it's configured

              // Verify webhook signature and construct event
              let event: Stripe.Event
              try {
                event = stripe.webhooks.constructEvent(body, signature, stripeConfig.webhookSecret!)
              } catch (err) {
                return handleWebhookError('Stripe', err, 'Signature verification failed', req.payload)
              }

              // Handle different event types
              switch (event.type) {
                case 'payment_intent.succeeded':
                case 'payment_intent.payment_failed':
                case 'payment_intent.canceled': {
                  const paymentIntent = event.data.object

                  // Find the corresponding payment in our database
                  const payment = await findPaymentByProviderId(payload, paymentIntent.id, pluginConfig)

                  if (!payment) {
                    logWebhookEvent('Stripe', `Payment not found for intent: ${paymentIntent.id}`, undefined, req.payload)
                    return webhookResponses.success() // Still return 200 to acknowledge receipt
                  }

                  // Map Stripe status to our status
                  let status: Payment['status'] = 'pending'

                  if (paymentIntent.status === 'succeeded') {
                    status = 'succeeded'
                  } else if (paymentIntent.status === 'canceled') {
                    status = 'canceled'
                  } else if (paymentIntent.status === 'requires_payment_method' ||
                             paymentIntent.status === 'requires_confirmation' ||
                             paymentIntent.status === 'requires_action') {
                    status = 'pending'
                  } else if (paymentIntent.status === 'processing') {
                    status = 'processing'
                  } else {
                    status = 'failed'
                  }

                  // Update the payment status and provider data
                  const providerData: ProviderData<Stripe.PaymentIntent> = {
                    raw: paymentIntent,
                    timestamp: new Date().toISOString(),
                    provider: 'stripe'
                  }
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
                    const logger = createContextLogger(payload, 'Stripe Webhook')
                    logger.warn(`Failed to update payment ${payment.id}, skipping invoice update`)
                  }
                  break
                }

                case 'charge.refunded': {
                  const charge = event.data.object

                  // Find the payment by charge ID or payment intent
                  let payment: Payment | null = null

                  // First try to find by payment intent ID
                  if (charge.payment_intent) {
                    payment = await findPaymentByProviderId(
                      payload,
                      charge.payment_intent as string,
                      pluginConfig
                    )
                  }

                  // If not found, try charge ID
                  if (!payment) {
                    payment = await findPaymentByProviderId(payload, charge.id, pluginConfig)
                  }

                  if (payment) {
                    // Determine if fully or partially refunded
                    const isFullyRefunded = charge.amount_refunded === charge.amount

                    const providerData: ProviderData<Stripe.Charge> = {
                      raw: charge,
                      timestamp: new Date().toISOString(),
                      provider: 'stripe'
                    }
                    const updateSuccess = await updatePaymentStatus(
                      payload,
                      payment.id,
                      isFullyRefunded ? 'refunded' : 'partially_refunded',
                      providerData,
                      pluginConfig
                    )

                    if (!updateSuccess) {
                      const logger = createContextLogger(payload, 'Stripe Webhook')
                      logger.warn(`Failed to update refund status for payment ${payment.id}`)
                    }
                  }
                  break
                }

                default:
                  // Unhandled event type
                  logWebhookEvent('Stripe', `Unhandled event type: ${event.type}`, undefined, req.payload)
              }

              return webhookResponses.success()
            } catch (error) {
              return handleWebhookError('Stripe', error, undefined, req.payload)
            }
            }
          }
        ]
      }
    },
    onInit: async (payload: Payload) => {
      const { default: Stripe } = await import('stripe')
      const stripe = new Stripe(stripeConfig.secretKey, {
        apiVersion: stripeConfig.apiVersion || DEFAULT_API_VERSION,
      })
      singleton.set(payload, stripe)

      // Log webhook registration status
      if (!stripeConfig.webhookSecret) {
        const logger = createContextLogger(payload, 'Stripe Provider')
        logger.warn('Webhook endpoint not registered - webhookSecret not configured')
      }
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

      // Validate description length if provided
      if (payment.description && payment.description.length > 1000) {
        throw new Error('Description must be 1000 characters or less')
      }

      const stripe = singleton.get(payload)

      // Create a payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: payment.amount, // Stripe handles currency conversion internally
        currency: payment.currency.toLowerCase(),
        description: payment.description || undefined,
        metadata: {
          payloadPaymentId: payment.id?.toString() || '',
          ...(typeof payment.metadata === 'object' &&
              payment.metadata !== null &&
              !Array.isArray(payment.metadata)
              ? payment.metadata
              : {})
        } as Stripe.MetadataParam,
        automatic_payment_methods: {
          enabled: true,
        },
      })

      payment.providerId = paymentIntent.id
      const providerData: ProviderData<Stripe.PaymentIntent> = {
        raw: { ...paymentIntent, client_secret: paymentIntent.client_secret },
        timestamp: new Date().toISOString(),
        provider: 'stripe'
      }
      payment.providerData = providerData

      return payment
    },
  } satisfies PaymentProvider
}
