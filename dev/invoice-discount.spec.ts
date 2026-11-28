// An invoice can carry one invoice-level discount in `discountAmount`, so the lines keep their
// normal prices and the discount can be printed as its own row. These tests pin the total
// (subtotal − discount + tax), the bounds that keep a discount from pushing the total below zero,
// that invoices without a discount are calculated as before, and that a payment and refund for
// the discounted total work like any other.
import type { Payload } from 'payload'

import config, { vitestSqlitePath } from '@payload-config'
import { rm } from 'fs/promises'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Payment } from '../src/plugin/types/payments'

import { refundPayment } from '../src/refunds'

let payload: Payload

beforeAll(async () => {
  payload = await getPayload({ config })
})

afterAll(async () => {
  await payload.db.destroy?.()
  // The config gives every vitest process its own throwaway sqlite (@see vitestSqlitePath);
  // remove it (plus any wal/shm a crashed worker left) so runs do not accumulate temp files
  await rm(`${vitestSqlitePath()}`, { force: true })
  await rm(`${vitestSqlitePath()}-wal`, { force: true })
  await rm(`${vitestSqlitePath()}-shm`, { force: true })
})

// number and status are left to the collection's defaults; the cast covers those fields, which
// the generated `Invoice` type marks required.
const createInvoice = (overrides: Record<string, unknown> = {}) =>
  payload.create({
    collection: 'invoices',
    data: {
      billingAddress: {
        city: 'Example City',
        country: 'NL',
        line1: '1 Example Street',
        postalCode: '1234AB',
      },
      currency: 'EUR',
      customerInfo: { name: 'Jane Doe', email: 'jane@example.com' },
      items: [
        { description: 'Shirt', quantity: 2, unitAmount: 2500 },
        { description: 'Shipping', quantity: 1, unitAmount: 600 },
      ],
      ...overrides,
    } as any,
  })

describe('invoice discountAmount', () => {
  test('subtracts the discount from the subtotal before adding tax', async () => {
    const invoice = await createInvoice({ discountAmount: 560, taxAmount: 1058 })

    expect(invoice.subtotal).toBe(5600)
    expect(invoice.discountAmount).toBe(560)
    expect(invoice.amount).toBe(5600 - 560 + 1058)
    // The lines keep their undiscounted prices
    expect(invoice.items.map((item) => item.totalAmount)).toEqual([5000, 600])
  })

  test('an invoice without a discount is calculated as subtotal + tax', async () => {
    const invoice = await createInvoice({ taxAmount: 1176 })

    expect(invoice.discountAmount).toBe(0)
    expect(invoice.amount).toBe(5600 + 1176)
  })

  test('a discount equal to the subtotal gives a total of zero', async () => {
    const invoice = await createInvoice({ discountAmount: 5600 })

    expect(invoice.amount).toBe(0)
  })

  test('refuses a discount larger than the subtotal, even when tax would keep the total positive', async () => {
    await expect(createInvoice({ discountAmount: 5601, taxAmount: 1000 })).rejects.toThrow(
      /Discount cannot exceed the invoice subtotal/,
    )
  })

  test('refuses a negative discount', async () => {
    await expect(createInvoice({ discountAmount: -100 })).rejects.toThrow(/discountAmount|Discount Amount/i)
  })

  test('still refuses a negative line amount', async () => {
    await expect(
      createInvoice({
        items: [
          { description: 'Shirt', quantity: 1, unitAmount: 2500 },
          { description: 'Discount', quantity: 1, unitAmount: -500 },
        ],
      }),
    ).rejects.toThrow()
  })

  test('recalculates the total when an update changes only the discount', async () => {
    const invoice = await createInvoice({ taxAmount: 1000 })

    const updated = await payload.update({
      id: invoice.id,
      collection: 'invoices',
      data: { discountAmount: 600 } as any,
    })

    expect(updated.subtotal).toBe(5600)
    expect(updated.amount).toBe(5600 - 600 + 1000)
  })

  test('keeps the discounted total when an update leaves the amounts out', async () => {
    const invoice = await createInvoice({ discountAmount: 600 })

    const updated = await payload.update({
      id: invoice.id,
      collection: 'invoices',
      data: { notes: 'reminder sent' },
    })

    expect(updated.discountAmount).toBe(600)
    expect(updated.amount).toBe(5000)
  })

  test('refuses an update that removes lines until the discount exceeds the new subtotal', async () => {
    const invoice = await createInvoice({ discountAmount: 1000 })

    await expect(
      payload.update({
        id: invoice.id,
        collection: 'invoices',
        data: { items: [{ description: 'Shipping', quantity: 1, unitAmount: 600 }] },
      }),
    ).rejects.toThrow(/Discount cannot exceed the invoice subtotal/)
  })

  test('a payment for the discounted total marks the invoice paid and can be refunded', async () => {
    const invoice = await createInvoice({ discountAmount: 560 })
    expect(invoice.amount).toBe(5040)

    const payment = (await payload.create({
      collection: 'payments',
      data: {
        amount: invoice.amount,
        currency: invoice.currency,
        invoice: invoice.id,
        provider: 'test',
      } as any,
    })) as unknown as Payment
    expect(payment.amount).toBe(5040)

    await payload.update({
      id: payment.id,
      collection: 'payments',
      data: { status: 'succeeded' } as any,
    })

    const paid = await payload.findByID({ id: invoice.id, collection: 'invoices', depth: 0 })
    expect(paid.status).toBe('paid')
    expect(paid.amount).toBe(5040)

    // The refundable amount follows the payment, so it is the discounted total, not the subtotal
    await expect(refundPayment(payload, { amount: 5041, paymentId: payment.id })).rejects.toThrow(/exceeds/)
    const refund = await refundPayment(payload, { paymentId: payment.id })
    expect(refund.amount).toBe(5040)

    const refunded = (await payload.findByID({
      id: payment.id,
      collection: 'payments',
      depth: 0,
    })) as unknown as Payment
    expect(refunded.status).toBe('refunded')
  })
})
