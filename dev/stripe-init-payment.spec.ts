// Stripe rejects `return_url` on PaymentIntent create unless `confirm: true` is sent too. The
// plugin creates the intent unconfirmed (the frontend confirms it with Stripe.js), so the create
// call must not carry a return URL; the resolved URL is stored on the payment instead.
import { beforeEach, describe, expect, test, vi } from 'vitest'

const stripePaymentIntentsCreate = vi.fn()
vi.mock('stripe', () => ({
  default: class {
    paymentIntents = { create: stripePaymentIntentsCreate }
  },
}))

import { stripeProvider } from '../src/providers/stripe'

// A logger is needed because onInit warns when no webhookSecret is configured
const makePayload = (): any => ({ logger: { child: () => ({ debug() {}, error() {}, info() {}, warn() {} }) } })

const init = async (config: { returnUrl?: string }, payment: Record<string, unknown>) => {
  const provider = stripeProvider({ secretKey: 'sk_test_x', ...config })
  const payload = makePayload()
  await provider.onInit(payload)
  return provider.initPayment(payload, { amount: 1000, currency: 'EUR', ...payment } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
  stripePaymentIntentsCreate.mockResolvedValue({ id: 'pi_1', client_secret: 'secret' })
})

describe('Stripe initPayment', () => {
  test('creates the PaymentIntent without return_url (it is only valid with confirm: true)', async () => {
    await init({ returnUrl: 'https://shop.example/thanks' }, { redirectUrl: 'https://shop.example/order/1' })

    const params = stripePaymentIntentsCreate.mock.calls[0]?.[0]
    expect(params).not.toHaveProperty('return_url')
    expect(params).not.toHaveProperty('confirm')
    expect(params).toMatchObject({ amount: 1000, automatic_payment_methods: { enabled: true }, currency: 'eur' })
  })

  test('keeps the payment\'s own redirectUrl for the frontend confirm step', async () => {
    const payment = await init({ returnUrl: 'https://shop.example/thanks' }, { redirectUrl: 'https://shop.example/order/1' })

    expect(payment.redirectUrl).toBe('https://shop.example/order/1')
  })

  test('stores the configured returnUrl, token filled in, when the payment has no redirectUrl', async () => {
    const payment = await init({ returnUrl: 'https://shop.example/thanks?t={returnToken}' }, { returnToken: 'tok123' })

    expect(payment.redirectUrl).toBe('https://shop.example/thanks?t=tok123')
  })

  test('leaves redirectUrl unset when neither the payment nor the config has one', async () => {
    const payment = await init({}, {})

    expect(payment.redirectUrl).toBeUndefined()
    expect(payment.providerId).toBe('pi_1')
  })
})
