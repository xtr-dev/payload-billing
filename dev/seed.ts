import type { Payload } from 'payload'

import { devUser } from './helpers/credentials.js'

export const seed = async (payload: Payload) => {
  // Seed default user first
  const { totalDocs } = await payload.count({
    collection: 'users',
    where: {
      email: {
        equals: devUser.email,
      },
    },
  })

  if (!totalDocs) {
    await payload.create({
      collection: 'users',
      data: devUser,
    })
  }

  // Seed billing sample data
  await seedBillingData(payload)
}

async function seedBillingData(payload: Payload): Promise<void> {
  payload.logger.info('Seeding billing sample data...')

  try {
    // Check if we already have sample data
    const existingCustomers = await payload.count({
      collection: 'customers',
      where: {
        email: {
          equals: 'john.doe@example.com',
        },
      },
    })

    if (existingCustomers.totalDocs > 0) {
      payload.logger.info('Sample billing data already exists, skipping seed')
      return
    }

    // Create a sample customer
    const customer = await payload.create({
      collection: 'customers',
      data: {
        email: 'john.doe@example.com',
        name: 'John Doe',
        phone: '+1-555-0123',
        address: {
          line1: '123 Main St',
          city: 'New York',
          state: 'NY',
          postal_code: '10001',
          country: 'US'
        },
        metadata: {
          source: 'seed',
          created_by: 'system'
        }
      }
    })

    payload.logger.info(`Created sample customer: ${customer.id}`)

    // Create a sample invoice
    const invoice = await payload.create({
      collection: 'invoices',
      data: {
        number: 'INV-001-SAMPLE',
        customer: customer.id,
        currency: 'USD',
        items: [
          {
            description: 'Web Development Services',
            quantity: 10,
            unitAmount: 5000, // $50.00 per hour
            totalAmount: 50000 // $500.00 total
          },
          {
            description: 'Design Consultation',
            quantity: 2,
            unitAmount: 7500, // $75.00 per hour
            totalAmount: 15000 // $150.00 total
          }
        ],
        subtotal: 65000, // $650.00
        taxAmount: 5200, // $52.00 (8% tax)
        amount: 70200, // $702.00 total
        status: 'open',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        notes: 'Payment terms: Net 30 days. This is sample data for development.',
        metadata: {
          project: 'website-redesign',
          billable_hours: 12,
          sample: true
        }
      }
    })

    payload.logger.info(`Created sample invoice: ${invoice.number}`)

    // Create a sample payment using test provider
    const payment = await payload.create({
      collection: 'payments',
      data: {
        provider: 'test',
        providerId: `test_pay_sample_${Date.now()}`,
        status: 'succeeded',
        amount: 70200, // $702.00
        currency: 'USD',
        description: `Sample payment for invoice ${invoice.number}`,
        customer: customer.id,
        invoice: invoice.id,
        metadata: {
          invoice_number: invoice.number,
          payment_method: 'test_card',
          sample: true
        },
        providerData: {
          testMode: true,
          simulatedPayment: true,
          autoCompleted: true
        }
      }
    })

    payload.logger.info(`Created sample payment: ${payment.id}`)

    // Update invoice status to paid
    await payload.update({
      collection: 'invoices',
      id: invoice.id,
      data: {
        status: 'paid',
        payment: payment.id,
        paidAt: new Date().toISOString()
      }
    })

    payload.logger.info('Billing sample data seeded successfully!')

  } catch (error) {
    payload.logger.error('Error seeding billing data:', error)
  }
}
