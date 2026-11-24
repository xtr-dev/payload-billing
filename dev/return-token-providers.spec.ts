// The Stripe and Mollie providers fill {returnToken} in the return URL from their own config when
// the payment has no redirectUrl. Both clients are mocked; only the URL sent to them is checked.
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mollieClient = { payments: { create: vi.fn() } }
vi.mock('@mollie/api-client', () => ({ default: () => mollieClient }))

const stripePaymentIntentsCreate = vi.fn()
vi.mock('stripe', () => ({
  default: class {
    paymentIntents = { create: stripePaymentIntentsCreate }
  },
}))

import { mollieProvider } from '../src/providers/mollie'
import { stripeProvider } from '../src/providers/stripe'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('{returnToken} in provider config URLs', () => {
  test('Mollie fills it in the configured redirectUrl', async () => {
    mollieClient.payments.create.mockResolvedValue({ id: 'tr_1', _links: { checkout: { href: 'https://mollie.example/c' } } })
    const provider = mollieProvider({
      apiKey: 'test_key',
      redirectUrl: 'https://shop.example/thanks/{returnToken}',
      webhookUrl: 'https://shop.example/api/payload-billing/mollie/webhook',
    })
    const payload: any = {}
    await provider.onInit(payload)

    await provider.initPayment(payload, { amount: 1000, currency: 'EUR', returnToken: 'tok123' } as any)

    expect(mollieClient.payments.create.mock.calls[0]?.[0].redirectUrl).toBe('https://shop.example/thanks/tok123')
  })

  test('Stripe fills it in the configured returnUrl', async () => {
    stripePaymentIntentsCreate.mockResolvedValue({ id: 'pi_1', client_secret: 'secret' })
    const provider = stripeProvider({
      secretKey: 'sk_test_x',
      returnUrl: 'https://shop.example/thanks?t={returnToken}',
    })
    // A logger is needed because onInit warns when no webhookSecret is configured
    const payload: any = { logger: { child: () => ({ debug() {}, error() {}, info() {}, warn() {} }) } }
    await provider.onInit(payload)

    await provider.initPayment(payload, { amount: 1000, currency: 'EUR', returnToken: 'tok123' } as any)

    expect(stripePaymentIntentsCreate.mock.calls[0]?.[0].return_url).toBe('https://shop.example/thanks?t=tok123')
  })
})
