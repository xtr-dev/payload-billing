// updatePaymentStatus (the write every provider webhook goes through) against a real Payload +
// throwaway sqlite: a settled payment never moves back to an earlier status, and the version
// check is a conditional write in the database, with and without a transaction.
import type { Payload } from 'payload'

import { rm } from 'fs/promises'

import config, { vitestSqlitePath } from '@payload-config'
import { getPayload } from 'payload'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'

import type { Payment } from '../src/index'

import { useBillingPlugin } from '../src/plugin/index'
import { canTransitionPayment, updatePaymentStatus } from '../src/providers/utils'

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

afterEach(() => {
  vi.restoreAllMocks()
})

const pluginConfig = () => useBillingPlugin(payload)!.config
const providerData = { provider: 'test', raw: {}, timestamp: new Date().toISOString() }

const newPayment = async (status: Payment['status'] = 'pending') => {
  const created = (await payload.create({
    collection: 'payments',
    data: { amount: 1000, currency: 'EUR', provider: 'test' } as any,
  })) as unknown as Payment
  if (status === 'pending') {return created}
  return (await payload.update({ id: created.id, collection: 'payments', data: { status } as any })) as unknown as Payment
}

const reload = async (id: Payment['id']) =>
  (await payload.findByID({ id, collection: 'payments', depth: 0 })) as unknown as Payment

const update = (id: Payment['id'], status: Payment['status']) =>
  updatePaymentStatus(payload, id, status, providerData, pluginConfig())

describe.each([
  ['with a transaction', false],
  ['without a transaction', true],
])('updatePaymentStatus %s', (_label, noTransaction) => {
  const setup = () => {
    if (noTransaction) {
      // An adapter without transaction support (e.g. MongoDB without a replica set)
      vi.spyOn(payload.db, 'beginTransaction').mockResolvedValue(null)
    }
  }

  test('moves an open payment to succeeded and bumps the version', async () => {
    const payment = await newPayment()
    setup()
    expect(await update(payment.id, 'succeeded')).toBe(true)
    const stored = await reload(payment.id)
    expect(stored.status).toBe('succeeded')
    expect(stored.version).toBe((payment.version || 1) + 1)
  })

  test('refuses to move a succeeded payment back to pending', async () => {
    const payment = await newPayment('succeeded')
    setup()
    expect(await update(payment.id, 'pending')).toBe(false)
    expect((await reload(payment.id)).status).toBe('succeeded')
  })

  test('lets a succeeded payment move on to a refund status', async () => {
    const payment = await newPayment('succeeded')
    setup()
    expect(await update(payment.id, 'partially_refunded')).toBe(true)
    expect(await update(payment.id, 'refunded')).toBe(true)
    expect(await update(payment.id, 'partially_refunded')).toBe(false)
    expect((await reload(payment.id)).status).toBe('refunded')
  })

  test('still records a success reported after a failed attempt', async () => {
    const payment = await newPayment('failed')
    setup()
    expect(await update(payment.id, 'processing')).toBe(false)
    expect(await update(payment.id, 'succeeded')).toBe(true)
    expect((await reload(payment.id)).status).toBe('succeeded')
  })

  test('refuses the write when the payment changed after it was read', async () => {
    const payment = await newPayment()
    const stale = await reload(payment.id)
    // Another writer settles the payment between our read and our write
    await payload.update({ id: payment.id, collection: 'payments', data: { status: 'succeeded' } as any })
    setup()
    vi.spyOn(payload, 'findByID').mockResolvedValueOnce(stale as any)

    expect(await update(payment.id, 'failed')).toBe(false)
    expect((await reload(payment.id)).status).toBe('succeeded')
  })
})

describe('canTransitionPayment', () => {
  test.each([
    ['pending', 'succeeded', true],
    ['processing', 'pending', true],
    ['succeeded', 'succeeded', true],
    ['succeeded', 'pending', false],
    ['succeeded', 'failed', false],
    ['succeeded', 'refunded', true],
    ['failed', 'succeeded', true],
    ['failed', 'pending', false],
    ['canceled', 'processing', false],
    ['refunded', 'succeeded', false],
    ['partially_refunded', 'refunded', true],
    // Missing or legacy statuses are not locked
    [null, 'succeeded', true],
    ['paid' as any, 'pending', true],
  ] as const)('%s -> %s is %s', (from, to, allowed) => {
    expect(canTransitionPayment(from, to)).toBe(allowed)
  })
})

describe('updatePaymentStatus on MongoDB (fake adapter)', () => {
  // The Mongo path puts the version and status conditions in the updateOne filter, so the
  // database itself refuses a stale or settled write, also without a transaction.
  const fakeMongo = (claimResult: unknown) => {
    const stored: any = { id: 'p1', status: 'pending', version: 3 }
    const logger = { debug() {}, error() {}, info() {}, warn() {} }
    const fake: any = {
      db: {
        beginTransaction: vi.fn(async () => null),
        name: 'mongoose',
        updateOne: vi.fn(async () => claimResult),
      },
      findByID: vi.fn(async () => stored),
      logger: { child: () => logger },
      update: vi.fn(async ({ data }: any) => Object.assign(stored, data)),
    }
    return { fake, stored }
  }

  test('bumps the version only where id, read version and an allowed status match', async () => {
    const { fake, stored } = fakeMongo({ id: 'p1' })
    expect(await updatePaymentStatus(fake, 'p1', 'succeeded', providerData, {} as any)).toBe(true)

    const { data, where } = fake.db.updateOne.mock.calls[0][0]
    expect(data).toEqual({ version: 4 })
    expect(where.and).toEqual([
      { id: { equals: 'p1' } },
      { version: { equals: 3 } },
      {
        or: [
          { status: { in: ['pending', 'processing', 'succeeded', 'failed', 'canceled'] } },
          { status: { not_in: ['pending', 'processing', 'succeeded', 'failed', 'canceled', 'refunded', 'partially_refunded'] } },
        ],
      },
    ])
    expect(stored).toMatchObject({ status: 'succeeded', version: 4 })
  })

  test('writes nothing when the database finds no matching payment', async () => {
    const { fake, stored } = fakeMongo(null)
    expect(await updatePaymentStatus(fake, 'p1', 'succeeded', providerData, {} as any)).toBe(false)
    expect(fake.update).not.toHaveBeenCalled()
    expect(stored.status).toBe('pending')
  })

  test('a payment without a status (older data) is not locked', async () => {
    const { fake, stored } = fakeMongo({ id: 'p1' })
    delete stored.status
    expect(await updatePaymentStatus(fake, 'p1', 'succeeded', providerData, {} as any)).toBe(true)
    expect(fake.db.updateOne).toHaveBeenCalled()
    expect(stored.status).toBe('succeeded')
  })
})
