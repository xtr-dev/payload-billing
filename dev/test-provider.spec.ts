import type { Payment } from '../src/plugin/types/payments.js'
import type { ProviderData } from '../src/providers/types.js'
import type { Payload } from 'payload'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { testProvider } from '../src/providers/test.js'

const payloadStub = {} as Payload
const serverUrlEnvironmentVariables = [
  'NEXT_PUBLIC_SERVER_URL',
  'PAYLOAD_PUBLIC_SERVER_URL',
  'SERVER_URL',
] as const
const originalServerUrls = Object.fromEntries(
  serverUrlEnvironmentVariables.map((name) => [name, process.env[name]]),
)

const enabledProvider = (config: Parameters<typeof testProvider>[0] = { enabled: true }) => {
  const provider = testProvider(config)
  if (!provider) throw new Error('Expected the test provider to be enabled')
  return provider
}

const payment = (values: Partial<Payment> = {}): Partial<Payment> => ({
  amount: 1000,
  currency: 'EUR',
  description: 'Order 1',
  ...values,
})

beforeEach(() => {
  for (const name of serverUrlEnvironmentVariables) delete process.env[name]
})

afterEach(() => {
  for (const name of serverUrlEnvironmentVariables) {
    const originalValue = originalServerUrls[name]
    if (originalValue === undefined) delete process.env[name]
    else process.env[name] = originalValue
  }
})

describe('testProvider initPayment', () => {
  test('returns undefined when the provider is disabled', () => {
    expect(testProvider({ enabled: false })).toBeUndefined()
  })

  test('requires an amount', () => {
    expect(() => enabledProvider().initPayment(payloadStub, { currency: 'EUR' })).toThrow(
      'Amount is required',
    )
  })

  test('requires a currency', () => {
    expect(() => enabledProvider().initPayment(payloadStub, { amount: 1000 })).toThrow(
      'Currency is required',
    )
  })

  test.each([-1, 10.5, 100000000000])('rejects invalid amount %s', (amount) => {
    expect(() => enabledProvider().initPayment(payloadStub, payment({ amount }))).toThrow(
      'Invalid amount: must be a non-negative integer within reasonable limits',
    )
  })

  test('accepts zero even though the payments collection declares min: 1', () => {
    expect(() => enabledProvider().initPayment(payloadStub, payment({ amount: 0 }))).not.toThrow()
  })

  test.each(['EURO', 'E1R'])('rejects invalid currency %s', (currency) => {
    expect(() => enabledProvider().initPayment(payloadStub, payment({ currency }))).toThrow(
      'Invalid currency: must be a 3-letter ISO code',
    )
  })

  test('accepts a lowercase currency code', () => {
    expect(() =>
      enabledProvider().initPayment(payloadStub, payment({ currency: 'eur' })),
    ).not.toThrow()
  })

  test('mutates and returns the payment with the complete provider contract', () => {
    const input = payment()
    const result = enabledProvider().initPayment(payloadStub, input)
    const providerData = input.providerData as ProviderData<{
      paymentUrl: string
      scenarios: Array<{ id: string }>
      testMode: boolean
    }>

    expect(result).toBe(input)
    expect(input.providerId).toMatch(/^test_pay_\d+_[a-z0-9]+$/)
    expect(input.providerId).toMatch(/^test_pay_/)
    expect(input.checkoutUrl).toBe(providerData.raw.paymentUrl)
    expect(providerData.provider).toBe('test')
    expect(providerData.raw.testMode).toBe(true)
    expect(providerData.raw.scenarios.map(({ id }) => id)).toEqual([
      'instant-success',
      'delayed-success',
      'cancelled-payment',
      'declined-payment',
      'expired-payment',
      'pending-payment',
    ])
  })

  test('uses configured baseUrl before server URL environment variables', () => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://next.test'
    process.env.PAYLOAD_PUBLIC_SERVER_URL = 'https://payload.test'
    process.env.SERVER_URL = 'https://server.test'
    const input = payment()

    enabledProvider({ enabled: true, baseUrl: 'https://x.test' }).initPayment(payloadStub, input)

    expect(input.checkoutUrl).toBe(
      `https://x.test/api/payload-billing/test/payment/${input.providerId}`,
    )
  })

  test('prefers NEXT_PUBLIC_SERVER_URL over the other server URL variables', () => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://next.test'
    process.env.PAYLOAD_PUBLIC_SERVER_URL = 'https://payload.test'
    process.env.SERVER_URL = 'https://server.test'
    const input = payment()

    enabledProvider().initPayment(payloadStub, input)

    expect(input.checkoutUrl).toBe(
      `https://next.test/api/payload-billing/test/payment/${input.providerId}`,
    )

    delete process.env.NEXT_PUBLIC_SERVER_URL
    const payloadInput = payment()
    enabledProvider().initPayment(payloadStub, payloadInput)

    expect(payloadInput.checkoutUrl).toBe(
      `https://payload.test/api/payload-billing/test/payment/${payloadInput.providerId}`,
    )
  })

  test('falls back to localhost and the built-in API route', () => {
    const input = payment()

    enabledProvider().initPayment(payloadStub, input)

    expect(input.checkoutUrl).toBe(
      `http://localhost:3000/api/payload-billing/test/payment/${input.providerId}`,
    )
  })

  test('uses a custom UI route without the API prefix', () => {
    const input = payment()

    enabledProvider({
      enabled: true,
      baseUrl: 'https://x.test',
      customUiRoute: '/pay',
    }).initPayment(payloadStub, input)

    expect(input.checkoutUrl).toBe(`https://x.test/pay/${input.providerId}`)
  })
})
