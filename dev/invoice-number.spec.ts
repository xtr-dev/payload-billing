import type { Payload } from 'payload'

import config from '@payload-config'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

let payload: Payload

afterAll(async () => {
  await payload.db.destroy()
})

beforeAll(async () => {
  payload = await getPayload({ config })
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

    expect(invoice.number).toMatch(/^INV-\d+$/)

    const timestamp = Number(invoice.number.slice('INV-'.length))
    expect(timestamp).toBeGreaterThanOrEqual(before)
    expect(timestamp).toBeLessThanOrEqual(after)
  })
})
