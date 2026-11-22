// Refunds issued through the provider: the refunds collection hands a `pending` refund to the
// provider (test provider here, real Payload + throwaway sqlite), stores the provider's refund
// id, follows its status, keeps the payment's refunded/partially_refunded status in step, makes
// retries idempotent and fires the onRefund* hooks once per transition.
import type { Payload } from 'payload'

import { randomUUID } from 'node:crypto'
import { rm } from 'fs/promises'

import config, { vitestSqlitePath } from '@payload-config'
import { getPayload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import type { Payment, Refund } from '../src/index'

import { processPendingRefunds, processRefund, refundPayment } from '../src/index'
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
  test('creating a pending refund only reserves it; processRefund sends it and stores the provider id', async () => {
    const payment = await paidPayment()
    const reserved = (await payload.create({
      collection: 'refunds',
      data: { amount: 5000, currency: 'EUR', payment: payment.id, status: 'pending' } as any,
    })) as unknown as Refund
    expect(reserved.status).toBe('pending')
    expect(reserved.providerId).toBeFalsy()
    expect(reserved.idempotencyKey).toBeTruthy()
    expect((await reload(payment.id)).status).toBe('succeeded')

    const refund = await processRefund(payload, reserved.id)
    expect(refund.providerId).toMatch(/^test_re_/)
    expect(refund.status).toBe('succeeded')
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
    expect(events).toEqual(['change:null>pending', 'change:pending>failed', `failed:${refund.id}`])

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
    expect(events).toEqual(['change:null>pending', 'change:pending>processing'])

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
    expect(events).toEqual([
      'change:null>pending',
      'change:pending>processing',
      'change:processing>succeeded',
      `succeeded:${refund.id}`,
    ])
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

  test('the sweep sends reserved refunds, and a second sweep does not pay them again', async () => {
    const payment = await paidPayment()
    const reserved = (await payload.create({
      collection: 'refunds',
      data: { amount: 5000, currency: 'EUR', payment: payment.id, status: 'pending' } as any,
    })) as unknown as Refund
    expect(reserved.providerId).toBeFalsy()

    const first = await processPendingRefunds(payload)
    const second = await processPendingRefunds(payload)
    expect(first.find((r) => r.id === reserved.id)!.status).toBe('succeeded')
    expect(second.map((r) => r.id)).not.toContain(reserved.id)
  })

  describe('over-refund protection (reserve, verify, send)', () => {
    // A reservation inserted at the adapter level, skipping the collection's early check: what a
    // concurrent request looks like, which passed that check before the other refund was written.
    const forceReservation = async (paymentId: Payment['id'], amount: number) =>
      (await payload.db.create({
        collection: 'refunds',
        data: { amount, currency: 'EUR', idempotencyKey: randomUUID(), payment: paymentId, status: 'pending' },
      })) as unknown as Refund

    test('a refund that exceeds what other refunds took is failed without calling the provider', async () => {
      const payment = await paidPayment(5000)
      const winner = await refundPayment(payload, { amount: 4000, paymentId: payment.id })
      expect(winner.status).toBe('succeeded')

      const loser = await forceReservation(payment.id, 4000)
      const result = await processRefund(payload, loser.id)

      expect(result.status).toBe('failed')
      expect(result.providerId).toBeFalsy()
      expect(result.failureReason).toMatch(/Exceeds the refundable amount/)
      expect(events).toContain(`failed:${loser.id}`)
      expect((await reload(payment.id)).status).toBe('partially_refunded')
    })

    test('two reservations that together exceed the payment never both reach the provider', async () => {
      const payment = await paidPayment(5000)
      const a = await forceReservation(payment.id, 4000)
      const b = await forceReservation(payment.id, 4000)

      const results = await Promise.all([processRefund(payload, a.id), processRefund(payload, b.id)])

      const sent = results.filter((r) => r.providerId)
      expect(sent.length).toBeLessThanOrEqual(1)
      // at most one can pay out; failing both is the safe outcome of a true tie
      const refunded = await payload.find({
        collection: 'refunds',
        where: { and: [{ payment: { equals: payment.id } }, { status: { equals: 'succeeded' } }] },
      })
      const total = (refunded.docs as unknown as Refund[]).reduce((sum, r) => sum + r.amount, 0)
      expect(total).toBeLessThanOrEqual(5000)
    })

    test('concurrent refundPayment calls with different keys never refund more than the payment', async () => {
      const payment = await paidPayment(5000)
      const settled = await Promise.allSettled(
        Array.from({ length: 6 }, (_, i) =>
          refundPayment(payload, { amount: 2000, idempotencyKey: `race-${payment.id}-${i}`, paymentId: payment.id }),
        ),
      )
      const all = await payload.find({
        collection: 'refunds',
        pagination: false,
        where: { payment: { equals: payment.id } },
      })
      const reserved = (all.docs as unknown as Refund[])
        .filter((r) => r.status !== 'failed' && r.status !== 'canceled')
        .reduce((sum, r) => sum + r.amount, 0)
      expect(reserved).toBeLessThanOrEqual(5000)
      expect(settled.some((r) => r.status === 'fulfilled')).toBe(true)
    })
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
