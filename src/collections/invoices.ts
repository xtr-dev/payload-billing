import type {
  AccessArgs,
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  CollectionSlug,
  Field,
} from 'payload'
import type { BillingPluginConfig} from '../plugin/config.js';
import { defaults } from '../plugin/config.js'
import { extractSlug } from '../plugin/utils.js'
import { createContextLogger } from '../utils/logger.js'
import type { Invoice } from '../plugin/types/index.js'

export function createInvoicesCollection(pluginConfig: BillingPluginConfig): CollectionConfig {
  const {customerRelationSlug, customerInfoExtractor} = pluginConfig

  // Get slugs for relationships - these need to be determined before building fields
  const paymentsSlug = extractSlug(pluginConfig.collections?.payments, defaults.paymentsCollection)
  const invoicesSlug = extractSlug(pluginConfig.collections?.invoices, defaults.invoicesCollection)

  const fields: Field[] = [
    {
      name: 'number',
      type: 'text',
      admin: {
        description: 'Invoice number (e.g., INV-001)',
      },
      index: true,
      required: true,
      unique: true,
    },
    // Optional customer relationship
    ...(customerRelationSlug ? [{
      name: 'customer',
      type: 'relationship' as const,
      admin: {
        position: 'sidebar' as const,
        description: 'Link to customer record (optional)',
      },
      relationTo: customerRelationSlug as any,
      required: false,
    }] : []),
    // Basic customer info fields (embedded)
    {
      name: 'customerInfo',
      type: 'group',
      admin: {
        description: customerRelationSlug && customerInfoExtractor
          ? 'Customer billing information (auto-populated from customer relationship)'
          : 'Customer billing information',
        readOnly: !!(customerRelationSlug && customerInfoExtractor),
      },
      fields: [
        {
          name: 'name',
          type: 'text',
          admin: {
            description: 'Customer name',
            readOnly: !!(customerRelationSlug && customerInfoExtractor),
          },
          required: !customerRelationSlug || !customerInfoExtractor,
        },
        {
          name: 'email',
          type: 'email',
          admin: {
            description: 'Customer email address',
            readOnly: !!(customerRelationSlug && customerInfoExtractor),
          },
          required: !customerRelationSlug || !customerInfoExtractor,
        },
        {
          name: 'phone',
          type: 'text',
          admin: {
            description: 'Customer phone number',
            readOnly: !!(customerRelationSlug && customerInfoExtractor),
          },
        },
        {
          name: 'company',
          type: 'text',
          admin: {
            description: 'Company name (optional)',
            readOnly: !!(customerRelationSlug && customerInfoExtractor),
          },
        },
        {
          name: 'taxId',
          type: 'text',
          admin: {
            description: 'Tax ID or VAT number',
            readOnly: !!(customerRelationSlug && customerInfoExtractor),
          },
        },
      ],
    },
    {
      name: 'billingAddress',
      type: 'group',
      admin: {
        description: customerRelationSlug && customerInfoExtractor
          ? 'Billing address (auto-populated from customer relationship)'
          : 'Billing address',
        readOnly: !!(customerRelationSlug && customerInfoExtractor),
      },
      fields: [
        {
          name: 'line1',
          type: 'text',
          admin: {
            description: 'Address line 1',
            readOnly: !!(customerRelationSlug && customerInfoExtractor),
          },
          required: !customerRelationSlug || !customerInfoExtractor,
        },
        {
          name: 'line2',
          type: 'text',
          admin: {
            description: 'Address line 2',
            readOnly: !!(customerRelationSlug && customerInfoExtractor),
          },
        },
        {
          name: 'city',
          type: 'text',
          admin: {
            readOnly: !!(customerRelationSlug && customerInfoExtractor),
          },
          required: !customerRelationSlug || !customerInfoExtractor,
        },
        {
          name: 'state',
          type: 'text',
          admin: {
            description: 'State or province',
            readOnly: !!(customerRelationSlug && customerInfoExtractor),
          },
        },
        {
          name: 'postalCode',
          type: 'text',
          admin: {
            description: 'Postal or ZIP code',
            readOnly: !!(customerRelationSlug && customerInfoExtractor),
          },
          required: !customerRelationSlug || !customerInfoExtractor,
        },
        {
          name: 'country',
          type: 'text',
          admin: {
            description: 'Country code (e.g., US, GB)',
            readOnly: !!(customerRelationSlug && customerInfoExtractor),
          },
          maxLength: 2,
          required: !customerRelationSlug || !customerInfoExtractor,
        },
      ],
    },
    {
      name: 'status',
      type: 'select',
      admin: {
        position: 'sidebar',
      },
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Open', value: 'open' },
        { label: 'Paid', value: 'paid' },
        { label: 'Void', value: 'void' },
        { label: 'Uncollectible', value: 'uncollectible' },
      ],
      required: true,
    },
    {
      name: 'currency',
      type: 'text',
      admin: {
        description: 'ISO 4217 currency code (e.g., USD, EUR)',
      },
      defaultValue: 'USD',
      maxLength: 3,
      required: true,
    },
    {
      name: 'items',
      type: 'array',
      admin: {
        // Custom row labeling can be added here when needed
      },
      fields: [
        {
          name: 'description',
          type: 'text',
          admin: {
            width: '40%',
          },
          required: true,
        },
        {
          name: 'quantity',
          type: 'number',
          admin: {
            width: '15%',
          },
          defaultValue: 1,
          min: 1,
          required: true,
        },
        {
          name: 'unitAmount',
          type: 'number',
          admin: {
            description: 'Amount in cents',
            width: '20%',
          },
          min: 0,
          required: true,
        },
        {
          name: 'totalAmount',
          type: 'number',
          admin: {
            description: 'Calculated: quantity × unitAmount',
            readOnly: true,
            width: '20%',
          },
        },
      ],
      minRows: 1,
      required: true,
    },
    {
      name: 'subtotal',
      type: 'number',
      admin: {
        description: 'Sum of all line items',
        readOnly: true,
      },
    },
    {
      name: 'taxAmount',
      type: 'number',
      admin: {
        description: 'Tax amount in cents',
      },
      defaultValue: 0,
    },
    {
      name: 'amount',
      type: 'number',
      admin: {
        description: 'Total amount (subtotal + tax)',
        readOnly: true,
      },
    },
    {
      name: 'dueDate',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayOnly',
        },
      },
    },
    {
      name: 'paidAt',
      type: 'date',
      admin: {
        condition: (data) => data.status === 'paid',
        readOnly: true,
      },
    },
    {
      name: 'payment',
      type: 'relationship',
      admin: {
        condition: (data) => data.status === 'paid',
        position: 'sidebar',
      },
      relationTo: paymentsSlug,
    },
    {
      name: 'notes',
      type: 'textarea',
      admin: {
        description: 'Internal notes',
      },
    },
    {
      name: 'metadata',
      type: 'json',
      admin: {
        description: 'Additional invoice metadata',
      },
    },
  ]

  const baseConfig: CollectionConfig = {
    slug: invoicesSlug,
    access: {
      create: ({ req: { user } }: AccessArgs) => !!user,
      delete: ({ req: { user } }: AccessArgs) => !!user,
      read: ({ req: { user } }: AccessArgs) => !!user,
      update: ({ req: { user } }: AccessArgs) => !!user,
    },
    admin: {
      defaultColumns: ['number', 'customerInfo.name', 'status', 'amount', 'currency', 'dueDate'],
      group: 'Billing',
      useAsTitle: 'number',
    },
    fields,
    hooks: {
      afterChange: [
        async ({ doc, operation, req, previousDoc }) => {
          const logger = createContextLogger(req.payload, 'Invoices Collection')

          if (operation === 'create') {
            logger.info(`Invoice created: ${doc.number}`)

            // If invoice has a linked payment, update the payment to link back to this invoice
            if (doc.payment) {
              try {
                const paymentId = typeof doc.payment === 'object' ? doc.payment.id : doc.payment

                logger.info(`Linking payment ${paymentId} back to invoice ${doc.id}`)

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await req.payload.update({
                  collection: paymentsSlug as CollectionSlug,
                  id: paymentId,
                  data: {
                    invoice: doc.id,
                  } as any,
                })

                logger.info(`Payment ${paymentId} linked to invoice ${doc.id}`)
              } catch (error) {
                logger.error(`Failed to link payment to invoice: ${String(error)}`)
                // Don't throw - invoice is already created
              }
            }
          }

          // If invoice status changes to paid, ensure linked payment is also marked as paid
          const statusChanged = operation === 'update' && previousDoc && previousDoc.status !== doc.status
          if (statusChanged && doc.status === 'paid' && doc.payment) {
            try {
              const paymentId = typeof doc.payment === 'object' ? doc.payment.id : doc.payment

              // Fetch the payment to check its status
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const payment = await req.payload.findByID({
                collection: paymentsSlug as CollectionSlug,
                id: paymentId,
              }) as any

              // Only update if payment is not already in a successful state
              if (payment && !['paid', 'succeeded'].includes(payment.status)) {
                logger.info(`Invoice ${doc.id} marked as paid, updating payment ${paymentId}`)

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await req.payload.update({
                  collection: paymentsSlug as CollectionSlug,
                  id: paymentId,
                  data: {
                    status: 'succeeded',
                  } as any,
                })

                logger.info(`Payment ${paymentId} marked as succeeded`)
              }
            } catch (error) {
              logger.error(`Failed to update payment status: ${String(error)}`)
              // Don't throw - invoice update is already complete
            }
          }
        },
      ] satisfies CollectionAfterChangeHook<Invoice>[],
      beforeChange: [
        async ({ data, operation, req, originalDoc }) => {
          // Sync customer info from relationship if extractor is provided
          if (customerRelationSlug && customerInfoExtractor && data.customer) {
            // Check if customer changed or this is a new invoice
            const customerChanged = operation === 'create' ||
              (originalDoc && originalDoc.customer !== data.customer)

            if (customerChanged) {
              try {
                // Fetch the customer data
                const customer = await req.payload.findByID({
                  collection: customerRelationSlug as never,
                  id: data.customer as never,
                })

                // Extract customer info using the provided callback
                const extractedInfo = customerInfoExtractor(customer)

                // Update the invoice data with extracted info
                data.customerInfo = {
                  name: extractedInfo.name,
                  email: extractedInfo.email,
                  phone: extractedInfo.phone,
                  company: extractedInfo.company,
                  taxId: extractedInfo.taxId,
                }

                if (extractedInfo.billingAddress) {
                  data.billingAddress = extractedInfo.billingAddress
                }
              } catch (error) {
                const logger = createContextLogger(req.payload, 'Invoices Collection')
                logger.error(`Failed to extract customer info: ${String(error)}`)
                throw new Error('Failed to extract customer information')
              }
            }
          }

          if (operation === 'create') {
            // Generate invoice number if not provided
            if (!data.number) {
              const timestamp = Date.now()
              data.number = `INV-${timestamp}`
            }

            // Validate currency format
            if (data.currency) {
              data.currency = data.currency.toUpperCase()
              if (!/^[A-Z]{3}$/.test(data.currency)) {
                throw new Error('Currency must be a 3-letter ISO code')
              }
            }

            // Set due date if not provided (30 days from now)
            if (!data.dueDate) {
              const dueDate = new Date()
              dueDate.setDate(dueDate.getDate() + 30)
              data.dueDate = dueDate.toISOString()
            }
          }

          // Set paid date when status changes to paid
          if (data.status === 'paid' && !data.paidAt) {
            data.paidAt = new Date().toISOString()
          }
        },
      ] satisfies CollectionBeforeChangeHook<Invoice>[],
      beforeValidate: [
        ({ data }) => {
          if (!data) {return}

          // If using extractor, customer relationship is required
          if (customerRelationSlug && customerInfoExtractor && !data.customer) {
            throw new Error('Please select a customer')
          }

          // If not using extractor but have customer collection, either relationship or info is required
          if (customerRelationSlug && !customerInfoExtractor &&
              !data.customer && (!data.customerInfo?.name || !data.customerInfo?.email)) {
            throw new Error('Either select a customer or provide customer information')
          }

          // If no customer collection, ensure customer info is provided
          if (!customerRelationSlug && (!data.customerInfo?.name || !data.customerInfo?.email)) {
            throw new Error('Customer name and email are required')
          }

          if (data && data.items && Array.isArray(data.items)) {
            // Calculate totals for each line item
            data.items = data.items.map((item) => ({
              ...item,
              totalAmount: (item.quantity || 0) * (item.unitAmount || 0),
            }))

            // Calculate subtotal
            data.subtotal = data.items.reduce(
              (sum: number, item) => sum + (item.totalAmount || 0),
              0
            )

            // Calculate total amount
            data.amount = (data.subtotal || 0) + (data.taxAmount || 0)
          }
        },
      ] satisfies CollectionBeforeValidateHook<Invoice>[],
    },
    timestamps: true,
  }

  // Apply collection extension function if provided
  const collectionConfig = pluginConfig.collections?.invoices
  if (typeof collectionConfig === 'object' && collectionConfig.extend) {
    return collectionConfig.extend(baseConfig)
  }

  return baseConfig
}
