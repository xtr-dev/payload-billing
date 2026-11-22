import type { Payload } from 'payload'

import { rm } from 'fs/promises'

import { generateInvoiceNumber } from '../src/utils/invoiceNumber'
import config, { vitestSqlitePath } from '@payload-config'
import { getPayload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../src/utils/invoiceNumber', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/invoiceNumber')>()

  return {
    ...actual,
    generateInvoiceNumber: vi.fn(actual.generateInvoiceNumber),
  }
})

let payload: Payload

afterAll(async () => {
  await payload.db.destroy?.()
  // The config gives every vitest process its own throwaway sqlite (@see vitestSqlitePath);
  // remove it (plus any wal/shm a crashed worker left) so runs do not accumulate temp files
  await rm(`${vitestSqlitePath()}`, { force: true })
  await rm(`${vitestSqlitePath()}-wal`, { force: true })
  await rm(`${vitestSqlitePath()}-shm`, { force: true })
})

beforeAll(async () => {
  payload = await getPayload({ config })
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Invoice number generation', () => {
  test('auto-generates a number in the INV-<unix-ms-timestamp> form when none is provided', async () => {
    const before = Date.now()

    // number, status and currency are omitted on purpose: this test asserts that the
    // beforeValidate hook fills `number` in, so the generated `Invoice` type (which marks
    // them required) doesn't match what a caller actually has to pass.
    const invoice = await payload.create({
      collection: 'invoices',
      data: {
        customerInfo: {
          name: 'Jane Doe',
          email: 'jane@example.com',
        },
        billingAddress: {
          line1: '1 Example Street',
          city: 'Example City',
          postalCode: '1234AB',
          country: 'NL',
        },
        items: [
          {
            description: 'Test item',
            quantity: 1,
            unitAmount: 1000,
          },
        ],
      } as any,
    })

    const after = Date.now()

    expect(generateInvoiceNumber).toHaveBeenCalledTimes(1)
    expect(invoice.number).toBe(vi.mocked(generateInvoiceNumber).mock.results[0]?.value)
    expect(invoice.number).toMatch(/^INV-\d+$/)

    const timestamp = Number(invoice.number.slice('INV-'.length))
    expect(timestamp).toBeGreaterThanOrEqual(before)
    expect(timestamp).toBeLessThanOrEqual(after)
  })
})
