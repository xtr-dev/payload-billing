// Mollie refund support with a mocked Mollie client: the refund request carries the amount and
// idempotency key, a refund already created for that key is reused, and Mollie's refund
// statuses map onto ours.
import { beforeEach, describe, expect, test, vi } from 'vitest'

const client = {
  paymentRefunds: { create: vi.fn(), page: vi.fn() },
  payments: {} as { get?: ReturnType<typeof vi.fn> },
}
vi.mock('@mollie/api-client', () => ({ default: () => client }))

import { mollieProvider } from '../src/providers/mollie'

const payment: any = { amount: 2500, currency: 'EUR', id: 1, provider: 'mollie', providerId: 'tr_abc', status: 'succeeded' }
const mollieRefund = (over: Record<string, unknown> = {}) => ({
  amount: { currency: 'EUR', value: '25.00' },
  id: 're_1',
  metadata: { idempotencyKey: 'key-1' },
  paymentId: 'tr_abc',
  status: 'queued',
  ...over,
})

let payload: any
let provider: ReturnType<typeof mollieProvider>

beforeEach(async () => {
  vi.clearAllMocks()
  payload = {}
  provider = mollieProvider({ apiKey: 'test_key' })
  await provider.onInit(payload)
})

describe('mollie refundPayment', () => {
  test('creates the refund with the amount, idempotency key and metadata', async () => {
    client.paymentRefunds.page.mockResolvedValue([])
    client.paymentRefunds.create.mockResolvedValue(mollieRefund())

    const result = await provider.refundPayment(payload, {
      amount: 2500,
      currency: 'eur',
      description: 'Sold out',
      idempotencyKey: 'key-1',
      metadata: { orderId: 9 },
      payment,
    })

    expect(client.paymentRefunds.create).toHaveBeenCalledWith({
      amount: { currency: 'EUR', value: '25.00' },
      description: 'Sold out',
      idempotencyKey: 'key-1',
      metadata: { idempotencyKey: 'key-1', orderId: 9 },
      paymentId: 'tr_abc',
    })
    expect(result).toMatchObject({ amount: 2500, currency: 'EUR', providerId: 're_1', status: 'processing' })
  })

  test('does not create a second refund when one already exists for the key', async () => {
    client.paymentRefunds.page.mockResolvedValue([mollieRefund({ status: 'refunded' })])

    const result = await provider.refundPayment(payload, {
      amount: 2500,
      currency: 'EUR',
      idempotencyKey: 'key-1',
      payment,
    })

    expect(client.paymentRefunds.create).not.toHaveBeenCalled()
    expect(result).toMatchObject({ providerId: 're_1', status: 'succeeded' })
  })

  test.each([
    ['queued', 'processing'],
    ['pending', 'processing'],
    ['processing', 'processing'],
    ['refunded', 'succeeded'],
    ['failed', 'failed'],
    ['canceled', 'canceled'],
  ])('maps Mollie %s to %s', async (mollie, ours) => {
    client.paymentRefunds.page.mockResolvedValue([mollieRefund({ status: mollie })])
    const [refund] = await provider.fetchRefunds(payload, payment)
    expect(refund.status).toBe(ours)
    expect(refund.idempotencyKey).toBe('key-1')
  })
})

describe('mollie webhook with refunds', () => {
  const runWebhook = async (paymentStatus: string) => {
    const stored = { ...payment, status: paymentStatus, version: 1 }
    const updates: any[] = []
    const logger = { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
    const wh: any = {
      db: {},
      find: vi.fn(async ({ collection }: any) => ({
        docs: collection === 'payments' ? [stored] : [],
      })),
      findByID: vi.fn(async () => stored),
      logger: { child: () => logger },
      update: vi.fn(async (args: any) => {
        updates.push(args)
        return stored
      }),
    }
    wh.create = vi.fn(async ({ data }: any) => ({ id: 77, ...data }))
    await provider.onInit(wh)
    client.payments.get = vi.fn().mockResolvedValue({ id: 'tr_abc', status: 'paid' })
    client.paymentRefunds.page.mockResolvedValue([mollieRefund({ status: 'refunded' })])

    const config: any = {}
    const pluginConfig: any = { providers: [provider] }
    provider.onConfig!(config, pluginConfig)
    await config.endpoints[0].handler({ payload: wh, text: () => Promise.resolve('id=tr_abc') })
    return { updates, wh }
  }

  test('keeps a refunded payment refunded when Mollie still reports it paid, and records the refund', async () => {
    const { updates, wh } = await runWebhook('refunded')
    const paymentUpdate = updates.find((u) => u.collection === 'payments')
    expect(paymentUpdate.data.status).toBe('refunded')
    expect(wh.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'refunds',
        data: expect.objectContaining({ amount: 2500, providerId: 're_1', status: 'succeeded' }),
      }),
    )
  })

  test('a paid payment without refunds is still marked succeeded', async () => {
    const { updates } = await runWebhook('pending')
    expect(updates.find((u) => u.collection === 'payments').data.status).toBe('succeeded')
  })
})

describe('mollie syncPayment (the path syncPaymentFromProvider takes)', () => {
  const runSync = async (paymentStatus: string, mollieStatus: string) => {
    const stored: any = { ...payment, invoice: 55, status: paymentStatus, version: 1 }
    const updates: any[] = []
    const logger = { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
    const sp: any = {
      db: {},
      find: vi.fn(async () => ({ docs: [] })),
      findByID: vi.fn(async () => stored),
      logger: { child: () => logger },
      update: vi.fn(async (args: any) => {
        updates.push(args)
        if (args.collection === 'payments') {Object.assign(stored, args.data)}
        return stored
      }),
    }
    sp.create = vi.fn(async ({ data }: any) => ({ id: 77, ...data }))
    await provider.onInit(sp)
    client.payments.get = vi.fn().mockResolvedValue({ id: 'tr_abc', status: mollieStatus })
    client.paymentRefunds.page.mockResolvedValue([])

    const updated = await provider.syncPayment(sp, { providers: [provider] } as any, stored)
    return { stored, updated, updates }
  }

  test('fetches the payment from Mollie, records it paid and marks the invoice paid', async () => {
    const { stored, updated, updates } = await runSync('pending', 'paid')
    expect(client.payments.get).toHaveBeenCalledWith('tr_abc')
    expect(updated).toBe(true)
    expect(stored.status).toBe('succeeded')
    expect(updates.find((u) => u.collection === 'invoices')?.data.status).toBe('paid')
    // Refunds are synced too, as in the webhook
    expect(client.paymentRefunds.page).toHaveBeenCalledWith({ limit: 250, paymentId: 'tr_abc' })
  })

  test('keeps a refunded payment refunded, as the webhook does', async () => {
    const { stored, updates } = await runSync('refunded', 'paid')
    expect(stored.status).toBe('refunded')
    expect(updates.some((u) => u.collection === 'invoices')).toBe(false)
  })

  test('records an expired payment as canceled without touching the invoice', async () => {
    const { stored, updates } = await runSync('pending', 'expired')
    expect(stored.status).toBe('canceled')
    expect(updates.some((u) => u.collection === 'invoices')).toBe(false)
  })
})

describe('mollie syncPayment edge cases', () => {
  test('refuses a payment without a Mollie payment id', async () => {
    await expect(
      provider.syncPayment({} as any, { providers: [provider] } as any, { ...payment, providerId: null }),
    ).rejects.toThrow('no Mollie payment id')
  })

  test('the webhook does not call Mollie for a payment we do not know', async () => {
    const logger = { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
    const wh: any = {
      db: {},
      find: vi.fn(async () => ({ docs: [] })),
      logger: { child: () => logger },
    }
    await provider.onInit(wh)
    client.payments.get = vi.fn()
    const config: any = {}
    provider.onConfig!(config, { providers: [provider] } as any)
    const res = await config.endpoints[0].handler({ payload: wh, text: () => Promise.resolve('id=tr_unknown') })
    expect(res.status).toBe(200)
    expect(client.payments.get).not.toHaveBeenCalled()
  })
})
