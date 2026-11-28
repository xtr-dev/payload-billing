// A host that sells to signed-in customers and to guests configures both customerRelationSlug
// and customerInfoExtractor. The extractor fills the snapshot from the selected customer; a guest
// invoice has no customer and carries its own name and email. These tests pin both paths through
// the Local API, the refusal when neither is given, and that later partial updates of a guest
// invoice (as the payment hooks do when marking it paid) keep working.
// Own sqlite so a parallel getPayload spec cannot SQLITE_BUSY this file.
import type { CollectionSlug, Payload } from 'payload'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig, getPayload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

import type { CustomerInfoExtractor } from '../src/plugin/config'

import billingPlugin from '../src/plugin'
import { testProvider } from '../src/providers'
import { testEmailAdapter } from './helpers/testEmailAdapter'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const sqlitePath = path.join(
  os.tmpdir(),
  `payload-billing-invoice-guest-with-extractor-${process.pid}.sqlite`,
)

if (!process.env.ROOT_DIR) {
  process.env.ROOT_DIR = dirname
}

const lineItem = {
  description: 'Guest checkout line',
  quantity: 1,
  unitAmount: 1000,
}

describe('invoices with a customerInfoExtractor', () => {
  let payload: Payload
  let invoiceSeq = 0

  const extractor = vi.fn<CustomerInfoExtractor>((customer) => ({
    name: customer.name,
    email: customer.email,
  }))

  beforeAll(async () => {
    const config = await buildConfig({
      collections: [
        {
          slug: 'customers',
          fields: [
            { name: 'name', type: 'text' },
            { name: 'email', type: 'email' },
          ],
        },
      ],
      db: sqliteAdapter({
        client: {
          url: `file:${sqlitePath}`,
        },
      }),
      email: testEmailAdapter,
      graphQL: {
        disable: true,
      },
      plugins: [
        billingPlugin({
          customerInfoExtractor: extractor,
          customerRelationSlug: 'customers',
          providers: [testProvider({ enabled: true })],
        }),
      ],
      secret: 'test-secret_key',
      typescript: {
        autoGenerate: false,
      },
    })

    payload = await getPayload({ config })
  })

  afterAll(async () => {
    try {
      await payload.db.destroy?.()
    } finally {
      await Promise.all([
        rm(sqlitePath, { force: true }),
        rm(`${sqlitePath}-wal`, { force: true }),
        rm(`${sqlitePath}-shm`, { force: true }),
      ])
    }
  })

  beforeEach(() => {
    extractor.mockClear()
  })

  function nextNumber() {
    invoiceSeq += 1
    return `INV-GX-${process.pid}-${invoiceSeq}`
  }

  // This suite builds its own config with a customers collection that the dev app's generated
  // types don't include, hence the casts on the slug and on invoice data that sets `customer`.
  async function createCustomer() {
    return payload.create({
      collection: 'customers' as CollectionSlug,
      data: {
        name: 'Acme',
        email: 'acme@example.com',
      },
    })
  }

  test('creates a guest invoice from name and email without calling the extractor', async () => {
    const invoice = await payload.create({
      collection: 'invoices',
      data: {
        number: nextNumber(),
        customerInfo: {
          name: 'Guest Buyer',
          email: 'guest@example.com',
        },
        currency: 'EUR',
        items: [lineItem],
      } as any,
    })

    expect(invoice.customerInfo?.name).toBe('Guest Buyer')
    expect(invoice.customerInfo?.email).toBe('guest@example.com')
    expect((invoice as { customer?: unknown }).customer ?? null).toBeNull()
    expect(extractor).not.toHaveBeenCalled()
  })

  test('fills the snapshot from the customer, replacing customerInfo passed alongside it', async () => {
    const customer = await createCustomer()

    const invoice = await payload.create({
      collection: 'invoices',
      data: {
        number: nextNumber(),
        customer: customer.id,
        customerInfo: {
          name: 'Ignored',
          email: 'ignored@example.com',
        },
        currency: 'EUR',
        items: [lineItem],
      } as any,
    })

    expect(extractor).toHaveBeenCalledTimes(1)
    expect(invoice.customerInfo?.name).toBe('Acme')
    expect(invoice.customerInfo?.email).toBe('acme@example.com')
  })

  test.each([
    ['no customerInfo at all', undefined],
    ['a name without an email', { name: 'Guest Buyer' }],
    ['an email without a name', { email: 'guest@example.com' }],
  ])('refuses an invoice with no customer and %s', async (_label, customerInfo) => {
    await expect(
      payload.create({
        collection: 'invoices',
        data: {
          number: nextNumber(),
          ...(customerInfo ? { customerInfo } : {}),
          currency: 'EUR',
          items: [lineItem],
        } as any,
      }),
    ).rejects.toThrow(/Either select a customer or provide customer information/)
  })

  test('a guest invoice accepts a partial update that leaves the snapshot out', async () => {
    const invoice = await payload.create({
      collection: 'invoices',
      data: {
        number: nextNumber(),
        customerInfo: {
          name: 'Guest Buyer',
          email: 'guest@example.com',
        },
        currency: 'EUR',
        items: [lineItem],
      } as any,
    })

    const updated = await payload.update({
      collection: 'invoices',
      id: invoice.id,
      data: { status: 'paid' },
    })

    expect(updated.status).toBe('paid')
    expect(updated.customerInfo?.email).toBe('guest@example.com')
    expect(extractor).not.toHaveBeenCalled()
  })

  test('linking a customer to a guest invoice replaces the snapshot with the extracted one', async () => {
    const customer = await createCustomer()
    const invoice = await payload.create({
      collection: 'invoices',
      data: {
        number: nextNumber(),
        customerInfo: {
          name: 'Guest Buyer',
          email: 'guest@example.com',
        },
        currency: 'EUR',
        items: [lineItem],
      } as any,
    })

    const updated = await payload.update({
      collection: 'invoices',
      id: invoice.id,
      data: { customer: customer.id } as any,
    })

    expect(extractor).toHaveBeenCalledTimes(1)
    expect(updated.customerInfo?.name).toBe('Acme')
    expect(updated.customerInfo?.email).toBe('acme@example.com')
  })
})
