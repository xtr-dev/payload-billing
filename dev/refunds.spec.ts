// Refunds issued through the provider: the refunds collection hands a `pending` refund to the
// provider (test provider here, real Payload + throwaway sqlite), stores the provider's refund
// id, follows its status, keeps the payment's refunded/partially_refunded status in step, makes
// retries idempotent and fires the onRefund* hooks once per transition.
import type { Payload } from 'payload'

import { rm } from 'fs/promises'

import config, { vitestSqlitePath } from '@payload-config'
import { getPayload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import type { Payment, Refund } from '../src/index'

import { processPendingRefunds, refundPayment } from '../src/index'
import { useBillingPlugin } from '../src/plugin/index'
import { testProvider } from '../src/providers/test'

let payload: Payload
let events: string[]

beforeAll(async () => {
  payload = await getPayload({ config })
})

afterAll(async () => {
  await payload.db.destroy?.()
  await rm(`${vitestSqlitePath()}`, { force: true })
  await rm(`${vitestSqlitePath()}-wal`, { force: true })
  await rm(`${vitestSqlitePath()}-shm`, { force: true })
})

beforeEach(() => {
  events = []
  const pluginConfig = useBillingPlugin(payload)!.config
  pluginConfig.hooks = {
    onRefundFailed: ({ refund }) => void events.push(`failed:${refund.id}`),
    onRefundStatusChange: ({ previousStatus, refund }) =>
      void events.push(`change:${previousStatus}>${refund.status}`),
    onRefundSucceeded: ({ refund }) => void events.push(`succeeded:${refund.id}`),
  }
})

const paidPayment = async (amount = 5000) => {
  const created = (await payload.create({
    collection: 'payments',
    data: { amount, currency: 'EUR', provider: 'test' } as any,
  })) as unknown as Payment
  return (await payload.update({
    id: created.id,
    collection: 'payments',
    data: { status: 'succeeded' } as any,
  })) as unknown as Payment
}

const reload = async (id: Payment['id']) =>
  (await payload.findByID({ id, collection: 'payments', depth: 0 })) as unknown as Payment

describe('refunding through the provider', () => {
  test('creating a pending refund sends it to the provider and stores its id', async () => {
    const payment = await paidPayment()
    const refund = (await payload.create({
      collection: 'refunds',
      data: { amount: 5000, currency: 'EUR', payment: payment.id, status: 'pending' } as any,
    })) as unknown as Refund

    expect(refund.providerId).toMatch(/^test_re_/)
    expect(refund.status).toBe('succeeded')
    expect(refund.idempotencyKey).toBeTruthy()
    expect((await reload(payment.id)).status).toBe('refunded')
  })

  test('a partial refund makes the payment partially_refunded, the rest makes it refunded', async () => {
    const payment = await paidPayment(5000)
    await refundPayment(payload, { amount: 2000, paymentId: payment.id })
    expect((await reload(payment.id)).status).toBe('partially_refunded')

    // amount omitted = whatever is left
    const rest = await refundPayment(payload, { paymentId: payment.id })
    expect(rest.amount).toBe(3000)
    expect((await reload(payment.id)).status).toBe('refunded')
  })

  test('refuses refunds the payment cannot cover or that are not refundable', async () => {
    const payment = await paidPayment(1000)
    await expect(refundPayment(payload, { amount: 1001, paymentId: payment.id })).rejects.toThrow(/exceeds/)

    const pending = (await payload.create({
      collection: 'payments',
      data: { amount: 1000, currency: 'EUR', provider: 'test' } as any,
    })) as unknown as Payment
    await expect(refundPayment(payload, { paymentId: pending.id })).rejects.toThrow(/only a succeeded payment/)

    await refundPayment(payload, { paymentId: payment.id })
    await expect(refundPayment(payload, { paymentId: payment.id })).rejects.toThrow(/already fully refunded/)
  })

  test('the failing-refund scenario ends failed, keeps the payment paid and fires onRefundFailed', async () => {
    const payment = await paidPayment()
    const refund = await refundPayment(payload, {
      metadata: { testScenario: 'refund-failed' },
      paymentId: payment.id,
    })

    expect(refund.status).toBe('failed')
    expect(refund.failureReason).toMatch(/failed/)
    expect((await reload(payment.id)).status).toBe('succeeded')
    expect(events).toEqual(['change:null>failed', `failed:${refund.id}`])

    // a failed refund no longer reserves the amount: the money can be refunded again
    const again = await refundPayment(payload, { paymentId: payment.id })
    expect(again.status).toBe('succeeded')
  })

  test('a provider rejection is recorded as a failed refund instead of throwing', async () => {
    const payment = await paidPayment()
    const refund = await refundPayment(payload, {
      metadata: { testScenario: 'refund-rejected' },
      paymentId: payment.id,
    })
    expect(refund.status).toBe('failed')
    expect(refund.providerId).toBeFalsy()
    expect(refund.failureReason).toMatch(/rejected/)
  })

  test('a processing refund is settled later through the provider endpoint, firing the hooks once', async () => {
    const payment = await paidPayment()
    const refund = await refundPayment(payload, {
      metadata: { testScenario: 'refund-processing' },
      paymentId: payment.id,
    })
    expect(refund.status).toBe('processing')
    expect((await reload(payment.id)).status).toBe('succeeded')
    expect(events).toEqual(['change:null>processing'])

    const pluginConfig = useBillingPlugin(payload)!.config
    const endpoints: any = { endpoints: [] }
    testProvider({ enabled: true })!.onConfig!(endpoints, pluginConfig)
    const settle = endpoints.endpoints.find((e: any) => e.path === '/payload-billing/test/refund').handler
    const call = (outcome: string) =>
      settle({ json: () => Promise.resolve({ outcome, refundId: refund.providerId }), payload })

    expect((await call('succeeded')).status).toBe(200)
    expect((await reload(payment.id)).status).toBe('refunded')
    // The same webhook delivered again (or a later conflicting one) changes nothing and fires nothing
    await call('succeeded')
    await call('failed')
    const settled = (await payload.findByID({ id: refund.id, collection: 'refunds' })) as unknown as Refund
    expect(settled.status).toBe('succeeded')
    expect(events).toEqual(['change:null>processing', 'change:processing>succeeded', `succeeded:${refund.id}`])
  })

  test('retrying with the same idempotency key returns the first refund and pays out once', async () => {
    const payment = await paidPayment(5000)
    const [a, b] = await Promise.all([
      refundPayment(payload, { amount: 5000, idempotencyKey: 'order-42', paymentId: payment.id }),
      refundPayment(payload, { amount: 5000, idempotencyKey: 'order-42', paymentId: payment.id }),
    ])
    const later = await refundPayment(payload, { amount: 5000, idempotencyKey: 'order-42', paymentId: payment.id })

    expect(a.id).toBe(b.id)
    expect(later.id).toBe(a.id)
    const all = await payload.find({ collection: 'refunds', where: { payment: { equals: payment.id } } })
    expect(all.totalDocs).toBe(1)
  })

  test('reusing an idempotency key for a different payment or amount is an error, not a silent reuse', async () => {
    const payment = await paidPayment(5000)
    const other = await paidPayment(5000)
    await refundPayment(payload, { amount: 1000, idempotencyKey: 'order-77', paymentId: payment.id })
    await expect(
      refundPayment(payload, { amount: 2000, idempotencyKey: 'order-77', paymentId: payment.id }),
    ).rejects.toThrow(/different refund/)
    await expect(
      refundPayment(payload, { amount: 1000, idempotencyKey: 'order-77', paymentId: other.id }),
    ).rejects.toThrow(/different refund/)
  })

  test('the sweep retries a refund left pending by a transient error without double paying', async () => {
    const payment = await paidPayment()
    // A pending refund with no provider refund, as left behind when the provider was unreachable.
    // Created with a providerId-less, non-pending-status trick is not possible, so simulate by
    // creating it as `canceled` (recorded, not sent) and flipping it back to pending.
    const stuck = (await payload.create({
      collection: 'refunds',
      data: { amount: 5000, currency: 'EUR', payment: payment.id, status: 'canceled' } as any,
    })) as unknown as Refund
    expect(stuck.providerId).toBeFalsy()
    await payload.update({ id: stuck.id, collection: 'refunds', data: { status: 'pending' } as any })

    const first = await processPendingRefunds(payload)
    const second = await processPendingRefunds(payload)
    expect(first.map((r) => r.id)).toContain(stuck.id)
    expect(first.find((r) => r.id === stuck.id)!.status).toBe('succeeded')
    expect(second.map((r) => r.id)).not.toContain(stuck.id)
  })

  test('a refund recorded with its own providerId is not sent to the provider again', async () => {
    const payment = await paidPayment()
    const refund = (await payload.create({
      collection: 'refunds',
      data: { amount: 1000, currency: 'EUR', payment: payment.id, providerId: 're_external', status: 'succeeded' } as any,
    })) as unknown as Refund
    expect(refund.providerId).toBe('re_external')
    expect((await reload(payment.id)).status).toBe('partially_refunded')
  })
})
