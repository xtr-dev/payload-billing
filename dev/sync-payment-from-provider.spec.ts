// syncPaymentFromProvider against a real Payload + throwaway sqlite: it loads the payment,
// hands it to its provider's syncPayment (the webhook's code path) and returns the stored
// payment afterwards; it refuses providers that cannot sync. The Mollie side of syncPayment
// is covered with a mocked client in mollie-refunds.spec.ts.
import type { Payload } from 'payload'

import { rm } from 'fs/promises'

import config, { vitestSqlitePath } from '@payload-config'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import type { Payment } from '../src/index'

import { syncPaymentFromProvider } from '../src/index'
import { useBillingPlugin } from '../src/plugin/index'

let payload: Payload

beforeAll(async () => {
  payload = await getPayload({ config })
})

afterAll(async () => {
  await payload.db.destroy?.()
  await rm(`${vitestSqlitePath()}`, { force: true })
  await rm(`${vitestSqlitePath()}-wal`, { force: true })
  await rm(`${vitestSqlitePath()}-shm`, { force: true })
})

const newPayment = async () =>
  (await payload.create({
    collection: 'payments',
    data: { amount: 1000, currency: 'EUR', provider: 'test' } as any,
  })) as unknown as Payment

describe('syncPaymentFromProvider', () => {
  test('refuses a provider without syncPayment', async () => {
    const payment = await newPayment()
    await expect(syncPaymentFromProvider(payload, payment.id)).rejects.toThrow('does not support syncing')
  })

  test('refuses a payment without a provider payment id', async () => {
    const payment = await newPayment()
    await payload.db.updateOne({ collection: 'payments', data: { ...payment, providerId: null }, id: payment.id } as any)
    await expect(syncPaymentFromProvider(payload, payment.id)).rejects.toThrow('no provider payment id')
  })

  test('returns the payment unchanged when the provider could not update it', async () => {
    const payment = await newPayment()
    const testProvider = useBillingPlugin(payload)!.config.providers!.find((p) => p?.key === 'test')!
    testProvider.syncPayment = vi.fn(async () => false)
    try {
      const synced = await syncPaymentFromProvider(payload, payment.id)
      expect(synced.status).toBe(payment.status)
    } finally {
      delete testProvider.syncPayment
    }
  })

  test("runs the provider's syncPayment and returns the stored payment", async () => {
    const payment = await newPayment()
    const testProvider = useBillingPlugin(payload)!.config.providers!.find((p) => p?.key === 'test')!
    const syncPayment = vi.fn(async (p: Payload, _config: unknown, doc: Payment) => {
      await p.update({ id: doc.id, collection: 'payments', data: { status: 'succeeded' } as any })
      return true
    })
    testProvider.syncPayment = syncPayment
    try {
      const synced = await syncPaymentFromProvider(payload, payment.id)
      expect(syncPayment).toHaveBeenCalledWith(payload, expect.anything(), expect.objectContaining({ id: payment.id }))
      expect(synced.status).toBe('succeeded')
    } finally {
      delete testProvider.syncPayment
    }
  })
})
