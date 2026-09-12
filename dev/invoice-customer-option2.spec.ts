// README Option 2 (customerRelationSlug set, no customerInfoExtractor) says either a
// customer relationship or customer info is enough. The collection used to mark
// customerInfo.name/email and billingAddress line1/city/postalCode/country required
// whenever the extractor was missing (`!customerRelationSlug || !customerInfoExtractor`),
// so Payload field validation rejected a customer-only create after beforeValidate had
// accepted it. Field.required is boolean, so the either/or lives in beforeValidate and
// these snapshot fields are required only when there is no customer relationship (Option 3).
// Factory tests pin the flags; the sqlite tests pin the Local API create that used to fail.
// Own sqlite so a parallel getPayload spec cannot SQLITE_BUSY this file.
import type { Field, Payload } from 'payload'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig, getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createInvoicesCollection } from '../src/collections/invoices'
import billingPlugin from '../src/plugin'
import { testProvider } from '../src/providers'
import { testEmailAdapter } from './helpers/testEmailAdapter'

const SNAPSHOT_FIELDS = ['name', 'email'] as const
const ADDRESS_FIELDS = ['line1', 'city', 'postalCode', 'country'] as const

function groupFields(fields: Field[], name: string): Field[] {
  const field = fields.find((candidate) => 'name' in candidate && candidate.name === name)
  if (!field || field.type !== 'group') {
    throw new Error(`expected group field ${name}`)
  }
  return field.fields
}

function requiredFlag(fields: Field[], name: string): boolean {
  const field = fields.find((candidate) => 'name' in candidate && candidate.name === name)
  if (!field || !('required' in field)) {
    throw new Error(`expected field ${name}`)
  }
  return field.required === true
}

function expectSnapshotRequired(fields: Field[], required: boolean) {
  const customerInfo = groupFields(fields, 'customerInfo')
  const billingAddress = groupFields(fields, 'billingAddress')
  for (const name of SNAPSHOT_FIELDS) {
    expect(requiredFlag(customerInfo, name), `customerInfo.${name}`).toBe(required)
  }
  for (const name of ADDRESS_FIELDS) {
    expect(requiredFlag(billingAddress, name), `billingAddress.${name}`).toBe(required)
  }
}

const lineItem = {
  description: 'Option 2 line',
  quantity: 1,
  unitAmount: 1000,
}

describe('invoice customer snapshot required flags', () => {
  test('Option 3 (no relationship) still requires name, email, and address', () => {
    const collection = createInvoicesCollection({})
    expectSnapshotRequired(collection.fields, true)
  })

  test('Option 1 (relationship + extractor) leaves the snapshot optional', () => {
    const collection = createInvoicesCollection({
      customerRelationSlug: 'customers',
      customerInfoExtractor: (customer) => ({
        name: customer.name,
        email: customer.email,
      }),
    })
    expectSnapshotRequired(collection.fields, false)
  })

  test('Option 2 (relationship, no extractor) leaves the snapshot optional', () => {
    const collection = createInvoicesCollection({
      customerRelationSlug: 'customers',
    })
    expectSnapshotRequired(collection.fields, false)
  })
})

const dirname = path.dirname(fileURLToPath(import.meta.url))
const sqlitePath = path.join(
  os.tmpdir(),
  `payload-billing-invoice-customer-option2-${process.pid}.sqlite`,
)

if (!process.env.ROOT_DIR) {
  process.env.ROOT_DIR = dirname
}

describe('README Option 2 invoice create', () => {
  let payload: Payload
  let invoiceSeq = 0

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

  function nextNumber() {
    invoiceSeq += 1
    return `INV-O2-${process.pid}-${invoiceSeq}`
  }

  test('creates an invoice with only a customer relationship', async () => {
    const customer = await payload.create({
      collection: 'customers',
      data: {
        name: 'Acme',
        email: 'acme@example.com',
      },
    })

    const invoice = await payload.create({
      collection: 'invoices',
      data: {
        number: nextNumber(),
        customer: customer.id,
        currency: 'EUR',
        items: [lineItem],
      } as any,
    })

    expect(typeof invoice.id === 'string' || typeof invoice.id === 'number').toBe(true)
    const linkedId = typeof invoice.customer === 'object' && invoice.customer !== null
      ? invoice.customer.id
      : invoice.customer
    expect(linkedId).toBe(customer.id)
  })

  test('creates an invoice with only name and email, no billing address', async () => {
    const invoice = await payload.create({
      collection: 'invoices',
      data: {
        number: nextNumber(),
        customerInfo: {
          name: 'Jane Doe',
          email: 'jane@example.com',
        },
        currency: 'EUR',
        items: [lineItem],
      } as any,
    })

    expect(invoice.customerInfo?.name).toBe('Jane Doe')
    expect(invoice.customerInfo?.email).toBe('jane@example.com')
  })

  test('refuses an invoice that has neither a customer nor name and email', async () => {
    await expect(
      payload.create({
        collection: 'invoices',
        data: {
          number: nextNumber(),
          currency: 'EUR',
          items: [lineItem],
        } as any,
      }),
    ).rejects.toThrow(/Either select a customer or provide customer information/)
  })
})
