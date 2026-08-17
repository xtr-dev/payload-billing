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

describe('Stripe webhook body read failure', () => {
  test('a request body read exception answers non-200, not an acknowledgment', async () => {
    const handler = getWebhookHandler('whsec_test')
    const payload = makeFakePayload(() => {
      throw new Error('constructEvent should not be called when the body could not be read')
    })

    const request = {
      payload,
      text: async () => {
        throw new Error('stream aborted')
      },
      headers: { get: (key: string) => (key === 'stripe-signature' ? 'some-signature' : null) },
    } as any

    const response = await handler(request)

    expect(response.status).not.toBe(200)
    const data = await response.json()
    expect(data.received).not.toBe(true)
  })
})
