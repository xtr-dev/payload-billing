import type { Payload } from 'payload'

import config from '@payload-config'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Payment } from '../src/index'

let payload: Payload

beforeAll(async () => {
  payload = await getPayload({ config })
})

afterAll(async () => {
  // payload@3.37 has no payload.destroy(); closing the db adapter is what releases the process
  await payload.db.destroy?.()
})

describe('billing plugin integration', () => {
  test('registers the payments, invoices and refunds collections', () => {
    expect(payload.collections['payments']).toBeDefined()
    expect(payload.collections['invoices']).toBeDefined()
    expect(payload.collections['refunds']).toBeDefined()
  })

  test('honours the extend option on the invoices collection', () => {
    // dev/payload.config.ts passes collections.invoices.extend adding a customMessage field
    const fields = payload.collections['invoices'].config.fields
    expect(fields.some((field) => 'name' in field && field.name === 'customMessage')).toBe(true)
  })

  test('creating a payment runs the test provider and stores its session data', async () => {
    // dev/payload-types.ts is stale (generated before checkoutUrl existed and with a required
    // status), so creates cast data like dev/seed.ts does and results assert against the
    // plugin's own published Payment type
    const payment = (await payload.create({
      collection: 'payments',
      data: {
        provider: 'test',
        amount: 1999,
        currency: 'EUR',
        description: 'Integration test payment',
      } as any,
    })) as unknown as Payment

    expect(payment.status).toBe('pending')
    expect(payment.providerId).toMatch(/^test_pay_/)
    // The dev config sets customUiRoute: '/test-payment', so checkout must point there
    expect(payment.checkoutUrl).toContain(`/test-payment/${payment.providerId}`)
    expect(payment.providerData).toMatchObject({ provider: 'test' })
  })

  test('uppercases the currency code before storing it', async () => {
    const payment = (await payload.create({
      collection: 'payments',
      data: {
        provider: 'test',
        amount: 500,
        currency: 'usd',
      } as any,
    })) as unknown as Payment
    expect(payment.currency).toBe('USD')
  })

  test('refuses a fractional amount', async () => {
    await expect(
      payload.create({
        collection: 'payments',
        data: {
          provider: 'test',
          amount: 10.5,
          currency: 'EUR',
        } as any,
      }),
    ).rejects.toThrow(/integer/i)
  })

  test('refuses a provider that is not registered', async () => {
    // stripe is a valid select option but no stripe provider is configured in dev/payload.config.ts
    await expect(
      payload.create({
        collection: 'payments',
        data: {
          provider: 'stripe',
          amount: 500,
          currency: 'EUR',
        } as any,
      }),
    ).rejects.toThrow(/not found/i)
  })

  test.each(['pending', 'failed'] as const)('marking an invoice paid is rejected when linked payment is %s', async (status) => {
    const payment = await payload.create({
      collection: 'payments',
      data: {
        provider: 'test',
        amount: 500,
        currency: 'EUR',
      } as any,
    })

    if (status === 'failed') {
      await payload.update({
        collection: 'payments',
        id: payment.id,
        data: { status },
      })
    }

    const invoice = await payload.create({
      collection: 'invoices',
      data: {
        customerInfo: {
          name: 'Invoice status test',
          email: 'invoice-status@example.com',
        },
        billingAddress: {
          line1: '1 Example Street',
          city: 'Example City',
          postalCode: '1234AB',
          country: 'NL',
        },
        items: [{
          description: 'Test item',
          quantity: 1,
          unitAmount: 500,
        }],
        payment: payment.id,
      } as any,
    })

    await expect(
      payload.update({
        collection: 'invoices',
        id: invoice.id,
        data: { status: 'paid' },
      })
    ).rejects.toThrow(/Cannot mark invoice as paid when linked payment status/)

    const linkedPayment = await payload.findByID({
      collection: 'payments',
      id: payment.id,
    })

    expect(linkedPayment.status).toBe(status)
  })

  test('updating an already-paid invoice is allowed when payment is refunded', async () => {
    const payment = await payload.create({
      collection: 'payments',
      data: {
        provider: 'test',
        amount: 500,
        currency: 'EUR',
        status: 'succeeded',
      } as any,
    })

    const invoice = await payload.create({
      collection: 'invoices',
      data: {
        status: 'paid',
        customerInfo: {
          name: 'Invoice refund test',
          email: 'invoice-refund@example.com',
        },
        billingAddress: {
          line1: '1 Example Street',
          city: 'Example City',
          postalCode: '1234AB',
          country: 'NL',
        },
        items: [{
          description: 'Test item',
          quantity: 1,
          unitAmount: 500,
        }],
        payment: payment.id,
      } as any,
    })

    await payload.update({
      collection: 'payments',
      id: payment.id,
      data: { status: 'refunded' },
    })

    // Should allow updating other fields on a paid invoice even when payment is refunded
    const updated = await payload.update({
      collection: 'invoices',
      id: invoice.id,
      data: {
        customerInfo: {
          name: 'Updated name',
          email: 'updated@example.com',
        },
      } as any,
    })

    expect(updated.customerInfo.name).toBe('Updated name')
    expect(updated.status).toBe('paid')
  })

  test('attaching a pending payment to an already-paid invoice is rejected', async () => {
    const settledPayment = await payload.create({
      collection: 'payments',
      data: {
        provider: 'test',
        amount: 500,
        currency: 'EUR',
        status: 'succeeded',
      } as any,
    })

    const pendingPayment = await payload.create({
      collection: 'payments',
      data: {
        provider: 'test',
        amount: 300,
        currency: 'EUR',
      } as any,
    })

    const invoice = await payload.create({
      collection: 'invoices',
      data: {
        status: 'paid',
        customerInfo: {
          name: 'Invoice attach test',
          email: 'invoice-attach@example.com',
        },
        billingAddress: {
          line1: '1 Example Street',
          city: 'Example City',
          postalCode: '1234AB',
          country: 'NL',
        },
        items: [{
          description: 'Test item',
          quantity: 1,
          unitAmount: 500,
        }],
        payment: settledPayment.id,
      } as any,
    })

    await expect(
      payload.update({
        collection: 'invoices',
        id: invoice.id,
        data: { payment: pendingPayment.id },
      })
    ).rejects.toThrow(/Cannot attach payment with status 'pending' to a paid invoice/)
  })

  test.each(['refunded', 'partially_refunded'] as const)('attaching a %s payment to a paid invoice is allowed', async (status) => {
    const settledPayment = await payload.create({
      collection: 'payments',
      data: {
        provider: 'test',
        amount: 500,
        currency: 'EUR',
        status: 'succeeded',
      } as any,
    })

    const refundedPayment = await payload.create({
      collection: 'payments',
      data: {
        provider: 'test',
        amount: 500,
        currency: 'EUR',
        status: 'succeeded',
      } as any,
    })

    await payload.update({
      collection: 'payments',
      id: refundedPayment.id,
      data: { status },
    })

    const invoice = await payload.create({
      collection: 'invoices',
      data: {
        status: 'paid',
        customerInfo: {
          name: 'Invoice refund update test',
          email: 'invoice-refund-update@example.com',
        },
        billingAddress: {
          line1: '1 Example Street',
          city: 'Example City',
          postalCode: '1234AB',
          country: 'NL',
        },
        items: [{
          description: 'Test item',
          quantity: 1,
          unitAmount: 500,
        }],
        payment: settledPayment.id,
      } as any,
    })

    const updated = await payload.update({
      collection: 'invoices',
      id: invoice.id,
      data: { payment: refundedPayment.id },
    })

    // Payment relationship is returned as full object; check the id property
    expect(typeof updated.payment === 'object' ? updated.payment.id : updated.payment).toBe(refundedPayment.id)
  })
})
