import type { Payload } from 'payload'

import config from '@payload-config'
import { getPayload } from 'payload'
import type { Config } from 'payload'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import type { Payment } from '../src/index'
import { stripeProvider } from '../src/providers/stripe'

let payload: Payload

beforeAll(async () => {
  payload = await getPayload({ config })
})

afterAll(async () => {
  // payload@3.37 has no payload.destroy(); closing the db adapter is what releases the process
  await payload.db.destroy?.()
})

describe('billing plugin integration', () => {
  test('registers the payments, invoices and refunds collections', () => {
    expect(payload.collections['payments']).toBeDefined()
    expect(payload.collections['invoices']).toBeDefined()
    expect(payload.collections['refunds']).toBeDefined()
  })

  test('honours the extend option on the invoices collection', () => {
    // dev/payload.config.ts passes collections.invoices.extend adding a customMessage field
    const fields = payload.collections['invoices'].config.fields
    expect(
      fields.some((field) => 'name' in field && field.name === 'customMessage'),
    ).toBe(true)
  })

  test('creating a payment runs the test provider and stores its session data', async () => {
    // dev/payload-types.ts is stale (generated before checkoutUrl existed and with a required
    // status), so creates cast data like dev/seed.ts does and results assert against the
    // plugin's own published Payment type
    const payment = (await payload.create({
      collection: 'payments',
      data: {
        provider: 'test',
        amount: 1999,
        currency: 'EUR',
        description: 'Integration test payment',
      } as any,
    })) as unknown as Payment

    expect(payment.status).toBe('pending')
    expect(payment.providerId).toMatch(/^test_pay_/)
    // The dev config sets customUiRoute: '/test-payment', so checkout must point there
    expect(payment.checkoutUrl).toContain(`/test-payment/${payment.providerId}`)
    expect(payment.providerData).toMatchObject({ provider: 'test' })
  })

  test('uppercases the currency code before storing it', async () => {
    const payment = (await payload.create({
      collection: 'payments',
      data: {
        provider: 'test',
        amount: 500,
        currency: 'usd',
      } as any,
    })) as unknown as Payment
    expect(payment.currency).toBe('USD')
  })

  test('refuses a fractional amount', async () => {
    await expect(
      payload.create({
        collection: 'payments',
        data: {
          provider: 'test',
          amount: 10.5,
          currency: 'EUR',
        } as any,
      }),
    ).rejects.toThrow(/integer/i)
  })

  test('refuses a provider that is not registered', async () => {
    // stripe is a valid select option but no stripe provider is configured in dev/payload.config.ts
    await expect(
      payload.create({
        collection: 'payments',
        data: {
          provider: 'stripe',
          amount: 500,
          currency: 'EUR',
        } as any,
      }),
    ).rejects.toThrow(/not found/i)
  })

  test('caps refunds at the captured amount', async () => {
    const payment = await payload.create({
      collection: 'payments',
      data: {
        provider: 'test',
        amount: 1000,
        currency: 'EUR',
        status: 'succeeded',
      } as any,
    })

    await payload.create({
      collection: 'refunds',
      data: {
        providerId: `refund_${payment.id}_1`,
        payment: payment.id,
        amount: 600,
        currency: 'EUR',
        status: 'succeeded',
      } as any,
    })

    await expect(
      payload.create({
        collection: 'refunds',
        data: {
          providerId: `refund_${payment.id}_2`,
          payment: payment.id,
          amount: 401,
          currency: 'EUR',
          status: 'pending',
        } as any,
      }),
    ).rejects.toThrow(/cannot exceed/i)
  })
})

describe('Stripe webhook contract', () => {
  const buildHandler = () => {
    const provider = stripeProvider({
      secretKey: 'sk_test_fake',
      webhookSecret: 'whsec_test',
    })
    const config = { collections: [] } as unknown as Config
    provider.onConfig(config, {})
    return config.endpoints?.find(
      (endpoint) => endpoint.path === '/payload-billing/stripe/webhook',
    )?.handler
  }

  test('rejects a missing or invalid signature before touching storage', async () => {
    const handler = buildHandler()
    expect(handler).toBeDefined()

    const update = vi.fn()
    const fakePayload = {
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
      update,
      [Symbol.for('@xtr-dev/payload-billing/stripe')]: {
        webhooks: {
          constructEvent: vi.fn(() => {
            throw new Error('bad signature')
          }),
        },
      },
    }
    const request = (signature?: string) => ({
      headers: new Headers(signature ? { 'stripe-signature': signature } : {}),
      payload: fakePayload,
      text: async () => '{}',
    })

    expect((await handler!(request() as any)).status).toBe(400)
    expect((await handler!(request('wrong') as any)).status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })

  test('deduplicates a replayed verified event', async () => {
    const handler = buildHandler()
    const payment: Record<string, any> = {
      id: 42,
      providerId: 'pi_test',
      status: 'pending',
      version: 1,
    }
    const update = vi.fn(async ({ data }: any) => Object.assign(payment, data))
    const fakePayload = {
      db: { beginTransaction: vi.fn(async () => null) },
      find: vi.fn(async () => ({ docs: [payment] })),
      findByID: vi.fn(async () => payment),
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
      update,
      [Symbol.for('@xtr-dev/payload-billing/stripe')]: {
        webhooks: {
          constructEvent: vi.fn(() => ({
            id: 'evt_replayed',
            type: 'payment_intent.succeeded',
            data: { object: { id: 'pi_test', status: 'succeeded' } },
          })),
        },
      },
    }
    const request = () => ({
      headers: new Headers({ 'stripe-signature': 'valid' }),
      payload: fakePayload,
      text: async () => '{}',
    })

    expect((await handler!(request() as any)).status).toBe(200)
    expect((await handler!(request() as any)).status).toBe(200)
    expect(update).toHaveBeenCalledTimes(1)
    expect(payment.providerData.eventId).toBe('evt_replayed')
  })

  test('does not forget a stale event after 25 later handled events', async () => {
    // Regression: dedup used to compare against only the most recent
    // eventId, so an older event redelivered after a newer one had already
    // been applied (succeeded -> refunded -> succeeded replayed) would
    // revert the payment status. See fcwzoku.
    const handler = buildHandler()
    const payment: Record<string, any> = {
      id: 42,
      providerId: 'pi_test',
      status: 'pending',
      version: 1,
    }
    const update = vi.fn(async ({ data }: any) => Object.assign(payment, data))
    const laterSucceededEvents = Array.from({ length: 24 }, (_, index) => ({
      id: `evt_later_${index + 1}`,
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test', status: 'succeeded' } },
    }))
    const events = [
      {
        id: 'evt_succeeded',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test', status: 'succeeded' } },
      },
      ...laterSucceededEvents,
      {
        id: 'evt_refunded',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_test',
            payment_intent: 'pi_test',
            amount: 1000,
            amount_refunded: 1000,
          },
        },
      },
      {
        id: 'evt_succeeded', // stale redelivery of the first event
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test', status: 'succeeded' } },
      },
    ]
    let call = 0
    const fakePayload = {
      db: { beginTransaction: vi.fn(async () => null) },
      find: vi.fn(async () => ({ docs: [payment] })),
      findByID: vi.fn(async () => payment),
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
      update,
      [Symbol.for('@xtr-dev/payload-billing/stripe')]: {
        webhooks: {
          constructEvent: vi.fn(() => events[call++]),
        },
      },
    }
    const request = () => ({
      headers: new Headers({ 'stripe-signature': 'valid' }),
      payload: fakePayload,
      text: async () => '{}',
    })

    for (let index = 0; index < 25; index++) {
      await handler!(request() as any)
      expect(payment.status).toBe('succeeded')
    }

    await handler!(request() as any)
    expect(payment.status).toBe('refunded')

    await handler!(request() as any)
    expect(payment.status).toBe('refunded')
    expect(update).toHaveBeenCalledTimes(26)
    expect(payment.providerData.processedEventIds).toHaveLength(26)
  })
})
