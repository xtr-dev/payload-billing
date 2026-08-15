import { describe, expect, test } from 'vitest'

import { stripeProvider } from '../src/providers/stripe'

// The provider stores its Stripe client on the payload container under this
// well-known global symbol (src/providers/stripe.ts) - setting it directly
// lets the handler be exercised without running onInit or a real Stripe client.
const stripeSingletonSymbol = Symbol.for('@xtr-dev/payload-billing/stripe')

function getWebhookHandler(webhookSecret: string) {
  const provider = stripeProvider({ secretKey: 'sk_test_dummy', webhookSecret })
  const config: { endpoints: any[] } = { endpoints: [] }
  provider.onConfig(config as any, {} as any)
  return config.endpoints[0].handler
}

function makeFakePayload(constructEvent: (body: string, signature: string) => any) {
  const fakePayload: any = {}
  fakePayload[stripeSingletonSymbol] = {
    webhooks: { constructEvent },
  }
  return fakePayload
}

function makeRequest(payload: any, body: string, headers: Record<string, string>) {
  return {
    payload,
    text: async () => body,
    headers: { get: (key: string) => headers[key] ?? null },
  } as any
}

describe('Stripe webhook signature verification', () => {
  test('missing signature header answers 400', async () => {
    const handler = getWebhookHandler('whsec_test')
    const payload = makeFakePayload(() => {
      throw new Error('constructEvent should not be called without a signature')
    })

    const response = await handler(makeRequest(payload, '{}', {}))

    expect(response.status).toBe(400)
  })

  test('present but invalid signature answers 4xx, not 200', async () => {
    const handler = getWebhookHandler('whsec_test')
    const payload = makeFakePayload(() => {
      throw new Error('No signatures found matching the expected signature for payload')
    })

    const response = await handler(
      makeRequest(payload, '{}', { 'stripe-signature': 'invalid-signature' })
    )

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)

    const data = await response.json()
    expect(data.received).not.toBe(true)
  })

  test('valid signature is processed normally and answers 200', async () => {
    const handler = getWebhookHandler('whsec_test')
    const payload = makeFakePayload((_body, signature) => {
      if (signature !== 'valid-signature') {
        throw new Error('unexpected signature')
      }
      return { type: 'unhandled.test.event', data: { object: {} } }
    })

    const response = await handler(
      makeRequest(payload, '{}', { 'stripe-signature': 'valid-signature' })
    )

    expect(response.status).toBe(200)
  })
})
