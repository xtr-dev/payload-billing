// Default access of the billing collections: admin-collection users only, with a first-class
// per-collection `access` option. The first block drives the access functions directly; the second
// runs the issue's exploit (a customer PATCHing their own payment to `succeeded`) against a real
// Payload instance with overrideAccess: false, which is how REST and the admin panel call it.
import type { Payload } from 'payload'

import { rm } from 'fs/promises'

import config, { vitestSqlitePath } from '@payload-config'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createInvoicesCollection } from '../src/collections/invoices'
import { createPaymentsCollection } from '../src/collections/payments'
import { createRefundsCollection } from '../src/collections/refunds'
import { isAdminCollectionUser } from '../src/collections/access'

const OPERATIONS = ['create', 'read', 'update', 'delete'] as const
const FACTORIES = {
  invoices: createInvoicesCollection,
  payments: createPaymentsCollection,
  refunds: createRefundsCollection,
}

const reqFor = (user: unknown, adminUser = 'users') =>
  ({ payload: { config: { admin: { user: adminUser } } }, user }) as any

const run = (access: any, user: unknown, adminUser?: string) =>
  access({ req: reqFor(user, adminUser) })

describe('default access', () => {
  for (const [name, create] of Object.entries(FACTORIES)) {
    describe(name, () => {
      const access = create({}).access!

      test.each(OPERATIONS)('%s: a user of the admin collection is allowed', (op) => {
        expect(run(access[op], { collection: 'users', id: 1 })).toBe(true)
      })

      test.each(OPERATIONS)('%s: a customer from another auth collection is denied', (op) => {
        expect(run(access[op], { collection: 'customers', id: 1 })).toBe(false)
      })

      test.each(OPERATIONS)('%s: no user is denied', (op) => {
        expect(run(access[op], null)).toBe(false)
        expect(run(access[op], undefined)).toBe(false)
      })
    })
  }

  test('follows the collection configured as admin.user', () => {
    expect(run(isAdminCollectionUser, { collection: 'staff' }, 'staff')).toBe(true)
    expect(run(isAdminCollectionUser, { collection: 'users' }, 'staff')).toBe(false)
  })
})

describe('the access option', () => {
  const staff = { collection: 'users', id: 1 }
  const customer = { collection: 'customers', id: 2 }

  test('works without a slug, keeping the default slug', () => {
    const payments = createPaymentsCollection({
      collections: { payments: { access: { read: () => true } } },
    })
    expect(payments.slug).toBe('payments')
  })

  test('replaces only the operation it names', () => {
    const payments = createPaymentsCollection({
      collections: { payments: { access: { read: ({ req }: any) => !!req.user } } },
    })
    const access = payments.access!
    // read now allows any signed-in user, everything else is still admin-only
    expect(run(access.read, customer)).toBe(true)
    expect(run(access.create, customer)).toBe(false)
    expect(run(access.update, customer)).toBe(false)
    expect(run(access.delete, customer)).toBe(false)
    expect(run(access.update, staff)).toBe(true)
  })

  test('can deny an operation for everyone', () => {
    const refunds = createRefundsCollection({
      collections: { refunds: { access: { delete: () => false } } },
    })
    expect(run(refunds.access!.delete, staff)).toBe(false)
  })

  test('combines with a renamed slug', () => {
    const invoices = createInvoicesCollection({
      collections: { invoices: { access: { read: () => true }, slug: 'bills' } },
    })
    expect(invoices.slug).toBe('bills')
    expect(run(invoices.access!.read, null)).toBe(true)
  })

  test('extend still has the last word', () => {
    const payments = createPaymentsCollection({
      collections: {
        payments: {
          access: { read: () => true },
          extend: (c) => ({ ...c, access: { ...c.access, read: () => false } }),
        },
      },
    })
    expect(run(payments.access!.read, staff)).toBe(false)
  })

  test('string form keeps the default access and the given slug', () => {
    const payments = createPaymentsCollection({ collections: { payments: 'transactions' } })
    expect(payments.slug).toBe('transactions')
    expect(run(payments.access!.update, customer)).toBe(false)
  })
})

describe('the exploit from the issue, against a real Payload instance', () => {
  let payload: Payload
  const customer = { id: 99, collection: 'customers' } as any
  const staff = { id: 1, collection: 'users' } as any

  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    await payload.db.destroy?.()
    await rm(`${vitestSqlitePath()}`, { force: true })
    await rm(`${vitestSqlitePath()}-wal`, { force: true })
    await rm(`${vitestSqlitePath()}-shm`, { force: true })
  })

  const makePayment = async () =>
    (await payload.create({
      collection: 'payments',
      data: { amount: 1000, currency: 'EUR', provider: 'test' } as any,
    })) as any

  test('a customer cannot mark their own payment as succeeded', async () => {
    const payment = await makePayment()
    await expect(
      payload.update({
        collection: 'payments',
        data: { status: 'succeeded' } as any,
        id: payment.id,
        overrideAccess: false,
        user: customer,
      }),
    ).rejects.toThrow(/not allowed/i)
    const after = (await payload.findByID({ collection: 'payments', id: payment.id })) as any
    expect(after.status).toBe('pending')
  })

  test('a customer cannot read, create or delete payments, invoices or refunds', async () => {
    const payment = await makePayment()
    const denied = (p: Promise<unknown>) => expect(p).rejects.toThrow(/not allowed/i)
    await denied(payload.find({ collection: 'payments', overrideAccess: false, user: customer }))
    await denied(payload.find({ collection: 'invoices', overrideAccess: false, user: customer }))
    await denied(payload.find({ collection: 'refunds', overrideAccess: false, user: customer }))
    await denied(
      payload.create({
        collection: 'refunds',
        data: { amount: 100, currency: 'EUR', payment: payment.id } as any,
        overrideAccess: false,
        user: customer,
      }),
    )
    await denied(
      payload.delete({ collection: 'payments', id: payment.id, overrideAccess: false, user: customer }),
    )
  })

  test('staff in the admin users collection still can', async () => {
    const payment = await makePayment()
    const found = await payload.find({ collection: 'payments', overrideAccess: false, user: staff })
    expect(found.totalDocs).toBeGreaterThan(0)
    const updated = (await payload.update({
      collection: 'payments',
      data: { status: 'succeeded' } as any,
      id: payment.id,
      overrideAccess: false,
      user: staff,
    })) as any
    expect(updated.status).toBe('succeeded')
  })

  test('the plugin itself still works, since it bypasses access', async () => {
    // refundPayment uses the Local API without a user, so access does not apply to it
    const { refundPayment } = await import('../src/index')
    const payment = await makePayment()
    await payload.update({ collection: 'payments', data: { status: 'succeeded' } as any, id: payment.id })
    const refund = await refundPayment(payload, { paymentId: payment.id })
    expect(refund.status).toBe('succeeded')
  })
})
