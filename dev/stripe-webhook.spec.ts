// Pins the Stripe webhook's failure contract (rr0th8y: a payment record says what
// actually happened at the provider). Stripe has no 'failed' PaymentIntent status:
// payment_intent.payment_failed is delivered with the intent back in
// requires_payment_method, which the status mapper alone records as 'pending'. The
// webhook must therefore map that event to 'failed' regardless of paymentIntent.status,
// while payment_intent.succeeded keeps recording 'succeeded' and marking the invoice
// paid. Drives the real /payload-billing/stripe/webhook handler with a real Stripe SDK
// instance (valid HMAC signature, so constructEvent verifies) and a fake payload that
// records every find/update. Run directly (`vitest run dev/stripe-webhook.spec.ts`) —
// it needs no database.
import crypto from 'node:crypto'
import { expect, it } from 'vitest'
import Stripe from 'stripe'
import { stripeProvider } from '../src/providers/stripe'

const WEBHOOK_SECRET = 'whsec_test_signing_secret'

// The provider stores its SDK instance on the payload under this symbol during onInit;
// injecting it the same way lets the handler run without importing the singleton module.
const STRIPE_SYMBOL = Symbol.for('@xtr-dev/payload-billing/stripe')

function signBody(body: string): string {
  const timestamp = Math.floor(Date.now() / 1000)
  const mac = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${body}`)
    .digest('hex')
  return `t=${timestamp},v1=${mac}`
}

function webhookEvent(type: string, paymentIntent: Record<string, unknown>): string {
  return JSON.stringify({ id: `evt_${type}`, type, data: { object: paymentIntent } })
}

async function makeFakePayload(eventBody: string) {
  const updates: Array<{ collection: string; data: any }> = []
  const paymentDoc: any = {
    id: 1,
    providerId: 'pi_test_1',
    status: 'pending',
    version: 1,
    invoice: 55,
  }
  const payload: any = {
    find: async () => ({ docs: [paymentDoc] }),
    findByID: async () => paymentDoc,
    update: async ({ collection, data }: any) => {
      updates.push({ collection, data })
      // Only payments-collection writes land on the payment doc; invoice updates
      // target a different collection and must not bleed into it
      if (collection === 'payments') {
        Object.assign(paymentDoc, data)
      }
      return paymentDoc
    },
    // No transaction support: updatePaymentStatus falls back to a direct update
    db: { beginTransaction: async () => { throw new Error('transactions unsupported') } },
    logger: { child: () => ({ debug() {}, info() {}, warn() {}, error() {} }) },
  }
  payload[STRIPE_SYMBOL] = new Stripe('sk_test_provider_key')

  const provider = stripeProvider({ secretKey: 'sk_test_provider_key', webhookSecret: WEBHOOK_SECRET })
  const config: any = { endpoints: [] }
  provider.onConfig!(config, {})
  const endpoint = config.endpoints.find((e: any) => e.path === '/payload-billing/stripe/webhook')
  expect(endpoint).toBeDefined()

  const res = await endpoint.handler({
    payload,
    headers: new Headers({ 'stripe-signature': signBody(eventBody) }),
    text: async () => eventBody,
  })
  return { res, paymentDoc, updates }
}

it('payment_intent.payment_failed records the payment as failed, not pending', async () => {
  const body = webhookEvent('payment_intent.payment_failed', {
    id: 'pi_test_1',
    status: 'requires_payment_method',
    amount: 1999,
    currency: 'eur',
  })

  const { res, paymentDoc, updates } = await makeFakePayload(body)

  expect(res.status).toBe(200)
  expect(paymentDoc.status).toBe('failed')
  // The stored record still carries exactly what the provider reported
  expect(paymentDoc.providerData.provider).toBe('stripe')
  expect(paymentDoc.providerData.raw).toMatchObject({
    id: 'pi_test_1',
    status: 'requires_payment_method',
  })
  // A failed payment must never mark its invoice paid
  expect(updates.some((u) => u.collection === 'invoices')).toBe(false)
})

it('payment_intent.succeeded still records succeeded and marks the invoice paid', async () => {
  const body = webhookEvent('payment_intent.succeeded', {
    id: 'pi_test_1',
    status: 'succeeded',
    amount: 1999,
    currency: 'eur',
  })

  const { res, paymentDoc, updates } = await makeFakePayload(body)

  expect(res.status).toBe(200)
  expect(paymentDoc.status).toBe('succeeded')
  const invoiceUpdate = updates.find((u) => u.collection === 'invoices')
  expect(invoiceUpdate?.data.status).toBe('paid')
})
