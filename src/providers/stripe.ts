import type { Payment } from '@/plugin/types/payments'
import type { PaymentProvider } from '@/plugin/types'
import type { Config, Payload } from 'payload'
import { createSingleton } from '@/plugin/singleton'
import type Stripe from 'stripe'
import { defaults } from '@/plugin/config'
import { extractSlug } from '@/plugin/utils'

const symbol = Symbol('stripe')

export interface StripeProviderConfig {
  secretKey: string
  webhookSecret?: string
  apiVersion?: Stripe.StripeConfig['apiVersion']
  returnUrl?: string
  webhookUrl?: string
}

export const stripeProvider = (stripeConfig: StripeProviderConfig) => {
  const singleton = createSingleton<Stripe>(symbol)

  return {
    key: 'stripe',
    onConfig: (config, pluginConfig) => {
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
              if (!req.text) {
                return Response.json({ error: 'Missing request body' }, { status: 400 })
              }

              const body = await req.text()
              const signature = req.headers.get('stripe-signature')

              if (!signature || !stripeConfig.webhookSecret) {
                return Response.json({ error: 'Missing webhook signature or secret' }, { status: 400 })
              }

              // Verify webhook signature and construct event
              let event: Stripe.Event
              try {
                event = stripe.webhooks.constructEvent(body, signature, stripeConfig.webhookSecret)
              } catch (err) {
                console.error('[Stripe Webhook] Signature verification failed:', err)
                return Response.json({ error: 'Invalid signature' }, { status: 400 })
              }

              // Handle different event types
              const paymentsCollection = extractSlug(pluginConfig.collections?.payments || defaults.paymentsCollection)

              switch (event.type) {
                case 'payment_intent.succeeded':
                case 'payment_intent.payment_failed':
                case 'payment_intent.canceled': {
                  const paymentIntent = event.data.object as Stripe.PaymentIntent

                  // Find the corresponding payment in our database
                  const payments = await payload.find({
                    collection: paymentsCollection,
                    where: {
                      providerId: {
                        equals: paymentIntent.id
                      }
                    }
                  })

                  if (payments.docs.length === 0) {
                    console.error(`[Stripe Webhook] Payment not found for intent: ${paymentIntent.id}`)
                    return Response.json({ received: true }, { status: 200 }) // Still return 200 to acknowledge receipt
                  }

                  const paymentDoc = payments.docs[0]

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
                  await payload.update({
                    collection: paymentsCollection,
                    id: paymentDoc.id,
                    data: {
                      status,
                      providerData: paymentIntent as any
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
                  break
                }

                case 'charge.refunded': {
                  const charge = event.data.object as Stripe.Charge

                  // Find the payment by charge ID (which might be stored in providerData)
                  const payments = await payload.find({
                    collection: paymentsCollection,
                    where: {
                      or: [
                        {
                          providerId: {
                            equals: charge.payment_intent as string
                          }
                        },
                        {
                          providerId: {
                            equals: charge.id
                          }
                        }
                      ]
                    }
                  })

                  if (payments.docs.length > 0) {
                    const paymentDoc = payments.docs[0]

                    // Determine if fully or partially refunded
                    const isFullyRefunded = charge.amount_refunded === charge.amount

                    await payload.update({
                      collection: paymentsCollection,
                      id: paymentDoc.id,
                      data: {
                        status: isFullyRefunded ? 'refunded' : 'partially_refunded',
                        providerData: charge as any
                      }
                    })
                  }
                  break
                }

                default:
                  // Unhandled event type
                  console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`)
              }

              return Response.json({ received: true }, { status: 200 })
            } catch (error) {
              console.error('[Stripe Webhook] Error processing webhook:', error)
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
      const { default: Stripe } = await import('stripe')
      const stripe = new Stripe(stripeConfig.secretKey, {
        apiVersion: stripeConfig.apiVersion || '2024-11-20.acacia',
      })
      singleton.set(payload, stripe)
    },
    initPayment: async (payload, payment) => {
      if (!payment.amount) {
        throw new Error('Amount is required')
      }
      if (!payment.currency) {
        throw new Error('Currency is required')
      }

      const stripe = singleton.get(payload)

      // Create a payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: payment.amount,
        currency: payment.currency.toLowerCase(),
        description: payment.description || undefined,
        metadata: {
          payloadPaymentId: payment.id?.toString() || '',
          ...(typeof payment.metadata === 'object' && payment.metadata !== null ? payment.metadata : {})
        },
        automatic_payment_methods: {
          enabled: true,
        },
      })

      payment.providerId = paymentIntent.id
      payment.providerData = {
        ...paymentIntent,
        clientSecret: paymentIntent.client_secret,
      }

      return payment
    },
  } satisfies PaymentProvider
}