import type { CollectionConfig } from 'payload'

import type {
  AccessArgs,
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  InvoiceData,
  InvoiceDocument,
  InvoiceItemData
} from '../types/payload'
import type { CustomerInfoExtractor } from '../types'

export function createInvoicesCollection(
  slug: string = 'invoices',
  customerCollectionSlug?: string,
  customerInfoExtractor?: CustomerInfoExtractor
): CollectionConfig {
  return {
    slug,
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
    fields: [
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
      ...(customerCollectionSlug ? [{
        name: 'customer',
        type: 'relationship' as const,
        admin: {
          position: 'sidebar' as const,
          description: 'Link to customer record (optional)',
        },
        relationTo: customerCollectionSlug as any,
        required: false,
      }] : []),
      // Basic customer info fields (embedded)
      {
        name: 'customerInfo',
        type: 'group',
        admin: {
          description: customerCollectionSlug && customerInfoExtractor
            ? 'Customer billing information (auto-populated from customer relationship)'
            : 'Customer billing information',
          readOnly: customerCollectionSlug && customerInfoExtractor ? true : false,
        },
        fields: [
          {
            name: 'name',
            type: 'text',
            admin: {
              description: 'Customer name',
              readOnly: customerCollectionSlug && customerInfoExtractor ? true : false,
            },
            required: true,
          },
          {
            name: 'email',
            type: 'email',
            admin: {
              description: 'Customer email address',
              readOnly: customerCollectionSlug && customerInfoExtractor ? true : false,
            },
            required: true,
          },
          {
            name: 'phone',
            type: 'text',
            admin: {
              description: 'Customer phone number',
              readOnly: customerCollectionSlug && customerInfoExtractor ? true : false,
            },
          },
          {
            name: 'company',
            type: 'text',
            admin: {
              description: 'Company name (optional)',
              readOnly: customerCollectionSlug && customerInfoExtractor ? true : false,
            },
          },
          {
            name: 'taxId',
            type: 'text',
            admin: {
              description: 'Tax ID or VAT number',
              readOnly: customerCollectionSlug && customerInfoExtractor ? true : false,
            },
          },
        ],
      },
      {
        name: 'billingAddress',
        type: 'group',
        admin: {
          description: customerCollectionSlug && customerInfoExtractor
            ? 'Billing address (auto-populated from customer relationship)'
            : 'Billing address',
          readOnly: customerCollectionSlug && customerInfoExtractor ? true : false,
        },
        fields: [
          {
            name: 'line1',
            type: 'text',
            admin: {
              description: 'Address line 1',
              readOnly: customerCollectionSlug && customerInfoExtractor ? true : false,
            },
            required: true,
          },
          {
            name: 'line2',
            type: 'text',
            admin: {
              description: 'Address line 2',
              readOnly: customerCollectionSlug && customerInfoExtractor ? true : false,
            },
          },
          {
            name: 'city',
            type: 'text',
            admin: {
              readOnly: customerCollectionSlug && customerInfoExtractor ? true : false,
            },
            required: true,
          },
          {
            name: 'state',
            type: 'text',
            admin: {
              description: 'State or province',
              readOnly: customerCollectionSlug && customerInfoExtractor ? true : false,
            },
          },
          {
            name: 'postalCode',
            type: 'text',
            admin: {
              description: 'Postal or ZIP code',
              readOnly: customerCollectionSlug && customerInfoExtractor ? true : false,
            },
            required: true,
          },
          {
            name: 'country',
            type: 'text',
            admin: {
              description: 'Country code (e.g., US, GB)',
              readOnly: customerCollectionSlug && customerInfoExtractor ? true : false,
            },
            maxLength: 2,
            required: true,
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
          condition: (data: InvoiceData) => data.status === 'paid',
          readOnly: true,
        },
      },
      {
        name: 'payment',
        type: 'relationship',
        admin: {
          condition: (data: InvoiceData) => data.status === 'paid',
          position: 'sidebar',
        },
        relationTo: 'payments',
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
    ],
    hooks: {
      afterChange: [
        ({ doc, operation, req }: CollectionAfterChangeHook<InvoiceDocument>) => {
          if (operation === 'create') {
            req.payload.logger.info(`Invoice created: ${doc.number}`)
          }
        },
      ],
      beforeChange: [
        async ({ data, operation, req, originalDoc }: CollectionBeforeChangeHook<InvoiceData>) => {
          // Sync customer info from relationship if extractor is provided
          if (customerCollectionSlug && customerInfoExtractor && data.customer) {
            // Check if customer changed or this is a new invoice
            const customerChanged = operation === 'create' ||
              (originalDoc && originalDoc.customer !== data.customer)

            if (customerChanged) {
              try {
                // Fetch the customer data
                const customer = await req.payload.findByID({
                  collection: customerCollectionSlug,
                  id: data.customer,
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
                req.payload.logger.error(`Failed to extract customer info: ${error}`)
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
      ],
      beforeValidate: [
        ({ data }: CollectionBeforeValidateHook<InvoiceData>) => {
          if (!data) return

          // If using extractor, customer relationship is required
          if (customerCollectionSlug && customerInfoExtractor && !data.customer) {
            throw new Error('Please select a customer')
          }

          // If not using extractor but have customer collection, either relationship or info is required
          if (customerCollectionSlug && !customerInfoExtractor &&
              !data.customer && (!data.customerInfo?.name || !data.customerInfo?.email)) {
            throw new Error('Either select a customer or provide customer information')
          }

          // If no customer collection, ensure customer info is provided
          if (!customerCollectionSlug && (!data.customerInfo?.name || !data.customerInfo?.email)) {
            throw new Error('Customer name and email are required')
          }

          if (data && data.items && Array.isArray(data.items)) {
            // Calculate totals for each line item
            data.items = data.items.map((item: InvoiceItemData) => ({
              ...item,
              totalAmount: (item.quantity || 0) * (item.unitAmount || 0),
            }))

            // Calculate subtotal
            data.subtotal = data.items.reduce(
              (sum: number, item: InvoiceItemData) => sum + (item.totalAmount || 0),
              0
            )

            // Calculate total amount
            data.amount = (data.subtotal || 0) + (data.taxAmount || 0)
          }
        },
      ],
    },
    timestamps: true,
  }
}