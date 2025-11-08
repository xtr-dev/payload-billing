import type { Payload } from 'payload'

import { devUser } from './helpers/credentials'

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

  // Check if we already have data
  const existingPayments = await payload.count({
    collection: 'payments',
  })

  if (existingPayments.totalDocs > 0) {
    payload.logger.info('Billing data already exists, skipping seed...')
    return
  }

  // Check if customers collection exists
  const hasCustomers = payload.collections['customers'] !== undefined

  let customer1Id: string | number | undefined
  let customer2Id: string | number | undefined

  if (hasCustomers) {
    // Seed customers
    payload.logger.info('Seeding customers...')
    const customer1 = await payload.create({
      collection: 'customers',
      data: {
        name: 'John Doe',
        email: 'john.doe@example.com',
        phone: '+1 (555) 123-4567',
        company: 'Acme Corporation',
        taxId: 'US-123456789',
        address: {
          line1: '123 Main Street',
          line2: 'Suite 100',
          city: 'New York',
          state: 'NY',
          postalCode: '10001',
          country: 'US',
        },
      },
    })
    customer1Id = customer1.id

    const customer2 = await payload.create({
      collection: 'customers',
      data: {
        name: 'Jane Smith',
        email: 'jane.smith@example.com',
        phone: '+1 (555) 987-6543',
        company: 'Tech Innovations Inc.',
        address: {
          line1: '456 Tech Avenue',
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94102',
          country: 'US',
        },
      },
    })
    customer2Id = customer2.id
  }

  // Seed invoices
  payload.logger.info('Seeding invoices...')

  const invoiceData1 = hasCustomers
    ? {
        customer: customer1Id,
        currency: 'USD',
        items: [
          {
            description: 'Web Development Services',
            quantity: 40,
            unitAmount: 12500, // $125/hour
          },
          {
            description: 'Hosting & Deployment',
            quantity: 1,
            unitAmount: 5000, // $50
          },
        ],
        taxAmount: 52500, // $525 tax (10%)
        status: 'paid',
        notes: 'Thank you for your business!',
      }
    : {
        customerInfo: {
          name: 'John Doe',
          email: 'john.doe@example.com',
          phone: '+1 (555) 123-4567',
          company: 'Acme Corporation',
          taxId: 'US-123456789',
        },
        billingAddress: {
          line1: '123 Main Street',
          line2: 'Suite 100',
          city: 'New York',
          state: 'NY',
          postalCode: '10001',
          country: 'US',
        },
        currency: 'USD',
        items: [
          {
            description: 'Web Development Services',
            quantity: 40,
            unitAmount: 12500,
          },
          {
            description: 'Hosting & Deployment',
            quantity: 1,
            unitAmount: 5000,
          },
        ],
        taxAmount: 52500,
        status: 'paid',
        notes: 'Thank you for your business!',
      }

  const invoice1 = await payload.create({
    collection: 'invoices',
    data: invoiceData1 as any,
  })

  const invoiceData2 = hasCustomers
    ? {
        customer: customer2Id,
        currency: 'USD',
        items: [
          {
            description: 'Monthly Subscription - Pro Plan',
            quantity: 1,
            unitAmount: 9900, // $99
          },
          {
            description: 'Additional Users (x5)',
            quantity: 5,
            unitAmount: 2000, // $20 each
          },
        ],
        taxAmount: 1990,
        status: 'open',
      }
    : {
        customerInfo: {
          name: 'Jane Smith',
          email: 'jane.smith@example.com',
          phone: '+1 (555) 987-6543',
          company: 'Tech Innovations Inc.',
        },
        billingAddress: {
          line1: '456 Tech Avenue',
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94102',
          country: 'US',
        },
        currency: 'USD',
        items: [
          {
            description: 'Monthly Subscription - Pro Plan',
            quantity: 1,
            unitAmount: 9900,
          },
          {
            description: 'Additional Users (x5)',
            quantity: 5,
            unitAmount: 2000,
          },
        ],
        taxAmount: 1990,
        status: 'open',
      }

  const invoice2 = await payload.create({
    collection: 'invoices',
    data: invoiceData2 as any,
  })

  // Note: Skip payment seeding during initialization because the billing plugin
  // providers aren't fully initialized yet. Payments can be created via the demo UI.

  payload.logger.info('✅ Billing sample data seeded successfully!')
}
