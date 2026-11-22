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
