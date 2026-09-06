import type { Config } from 'payload'
import { describe, expect, test, vi } from 'vitest'

import { stripeProvider } from '../src/providers/stripe'

const stripeSymbol = Symbol.for('@xtr-dev/payload-billing/stripe')

const buildHandler = () => {
  const provider = stripeProvider({
    secretKey: 'sk_test_fake',
    webhookSecret: 'whsec_test',
  })
  const config = { collections: [] } as unknown as Config
  provider.onConfig(config, {})

  const handler = config.endpoints?.find(
    (endpoint) => endpoint.path === '/payload-billing/stripe/webhook',
  )?.handler
  if (!handler) throw new Error('Stripe webhook handler was not registered')

  return handler
}

const buildRequest = (signature?: string, body: string = '{}') => {
  const payment = { id: 1, providerId: 'pi_test', status: 'pending' }
  const find = vi.fn(async () => ({ docs: [payment] }))
  const findByID = vi.fn(async () => payment)
  const update = vi.fn()
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    child: vi.fn(),
  }
  logger.child.mockReturnValue(logger)
  const payload = {
    find,
    findByID,
    logger,
    update,
    [stripeSymbol]: {
      webhooks: {
        constructEvent: vi.fn(() => {
          throw new Error('Signature verification failed')
        }),
      },
    },
  }

  return {
    payment,
    storageCalls: { find, findByID, update },
    request: {
      headers: new Headers(signature ? { 'stripe-signature': signature } : {}),
      payload,
      text: async () => body,
    },
  }
}

describe('Stripe webhook signature verification', () => {
  test('rejects an absent signature without changing a payment', async () => {
    const handler = buildHandler()
    const { payment, request, storageCalls } = buildRequest()
    const originalPayment = structuredClone(payment)

    const response = await handler(request as any)

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
    expect(payment).toEqual(originalPayment)
    expect(storageCalls.find).not.toHaveBeenCalled()
    expect(storageCalls.findByID).not.toHaveBeenCalled()
    expect(storageCalls.update).not.toHaveBeenCalled()
  })

  test('rejects an invalid signature without changing a payment', async () => {
    const handler = buildHandler()
    const { payment, request, storageCalls } = buildRequest('forged-signature')
    const originalPayment = structuredClone(payment)

    const response = await handler(request as any)

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
    expect(payment).toEqual(originalPayment)
    expect(storageCalls.find).not.toHaveBeenCalled()
    expect(storageCalls.findByID).not.toHaveBeenCalled()
    expect(storageCalls.update).not.toHaveBeenCalled()
  })

  test('rejects an absent signature with an empty body without changing a payment', async () => {
    const handler = buildHandler()
    const { payment, request, storageCalls } = buildRequest(undefined, '')
    const originalPayment = structuredClone(payment)

    const response = await handler(request as any)

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
    expect(payment).toEqual(originalPayment)
    expect(storageCalls.find).not.toHaveBeenCalled()
    expect(storageCalls.findByID).not.toHaveBeenCalled()
    expect(storageCalls.update).not.toHaveBeenCalled()
  })

  test('rejects a present signature with an empty body without changing a payment', async () => {
    const handler = buildHandler()
    const { payment, request, storageCalls } = buildRequest('forged-signature', '')
    const originalPayment = structuredClone(payment)

    const response = await handler(request as any)

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
    expect(payment).toEqual(originalPayment)
    expect(storageCalls.find).not.toHaveBeenCalled()
    expect(storageCalls.findByID).not.toHaveBeenCalled()
    expect(storageCalls.update).not.toHaveBeenCalled()
  })
})
