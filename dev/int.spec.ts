import type { Payload } from 'payload'

import config from '@payload-config'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Payment } from '../src/index'

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
    expect(fields.some((field) => 'name' in field && field.name === 'customMessage')).toBe(true)
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
})
