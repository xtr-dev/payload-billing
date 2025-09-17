import type { AccessArgs, CollectionBeforeChangeHook, CollectionConfig, CollectionSlug, Field } from 'payload'
import type { BillingPluginConfig} from '@/plugin/config';
import { defaults } from '@/plugin/config'
import { extractSlug } from '@/plugin/utils'
import { Payment } from '@/plugin/types/payments'
import { initProviderPayment } from '@/collections/hooks'

export function createPaymentsCollection(pluginConfig: BillingPluginConfig): CollectionConfig {
  const overrides = typeof pluginConfig.collections?.payments === 'object' ? pluginConfig.collections?.payments : {}
  let fields: Field[] = [
    {
      name: 'provider',
      type: 'select',
      admin: {
        position: 'sidebar',
      },
      options: [
        { label: 'Stripe', value: 'stripe' },
        { label: 'Mollie', value: 'mollie' },
        { label: 'Test', value: 'test' },
      ],
      required: true,
    },
    {
      name: 'providerId',
      type: 'text',
      admin: {
        description: 'The payment ID from the payment provider',
      },
      label: 'Provider Payment ID',
      unique: true,
      index: true, // Ensure this field is indexed for webhook lookups
    },
    {
      name: 'status',
      type: 'select',
      admin: {
        position: 'sidebar',
      },
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Processing', value: 'processing' },
        { label: 'Succeeded', value: 'succeeded' },
        { label: 'Failed', value: 'failed' },
        { label: 'Canceled', value: 'canceled' },
        { label: 'Refunded', value: 'refunded' },
        { label: 'Partially Refunded', value: 'partially_refunded' },
      ],
      required: true,
    },
    {
      name: 'amount',
      type: 'number',
      admin: {
        description: 'Amount in cents (e.g., 2000 = $20.00)',
      },
      min: 1,
      required: true,
    },
    {
      name: 'currency',
      type: 'text',
      admin: {
        description: 'ISO 4217 currency code (e.g., USD, EUR)',
      },
      maxLength: 3,
      required: true,
    },
    {
      name: 'description',
      type: 'text',
      admin: {
        description: 'Payment description',
      },
    },
    {
      name: 'invoice',
      type: 'relationship',
      admin: {
        position: 'sidebar',
      },
      relationTo: extractSlug(pluginConfig.collections?.invoices || defaults.invoicesCollection) as CollectionSlug,
    },
    {
      name: 'metadata',
      type: 'json',
      admin: {
        description: 'Additional metadata for the payment',
      },
    },
    {
      name: 'providerData',
      type: 'json',
      admin: {
        description: 'Raw data from the payment provider',
        readOnly: true,
      },
    },
    {
      name: 'refunds',
      type: 'relationship',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
      hasMany: true,
      relationTo: extractSlug(pluginConfig.collections?.refunds || defaults.refundsCollection) as CollectionSlug,
    },
    {
      name: 'version',
      type: 'number',
      admin: {
        hidden: true, // Hide from admin UI
      },
      defaultValue: 1,
      required: true,
    },
  ]
  if (overrides?.fields) {
    fields = overrides?.fields({defaultFields: fields})
  }
  return {
    slug: extractSlug(pluginConfig.collections?.payments || defaults.paymentsCollection),
    access: overrides?.access || {
      create: ({ req: { user } }: AccessArgs) => !!user,
      delete: ({ req: { user } }: AccessArgs) => !!user,
      read: ({ req: { user } }: AccessArgs) => !!user,
      update: ({ req: { user } }: AccessArgs) => !!user,
    },
    admin: {
      defaultColumns: ['id', 'provider', 'status', 'amount', 'currency', 'createdAt'],
      group: 'Billing',
      useAsTitle: 'id',
      ...overrides?.admin
    },
    fields,
    hooks: {
      beforeChange: [
        async ({ data, operation, req }) => {
          if (operation === 'create') {
            // Initialize version for new payments
            data.version = 1

            // Validate amount format
            if (data.amount && !Number.isInteger(data.amount)) {
              throw new Error('Amount must be an integer (in cents)')
            }

            // Validate currency format
            if (data.currency) {
              data.currency = data.currency.toUpperCase()
              if (!/^[A-Z]{3}$/.test(data.currency)) {
                throw new Error('Currency must be a 3-letter ISO code')
              }
            }

            await initProviderPayment(req.payload, data)
          } else if (operation === 'update') {
            // Auto-increment version for updates (if not already set by optimistic locking)
            if (!data.version) {
              const currentDoc = await req.payload.findByID({
                collection: extractSlug(pluginConfig.collections?.payments || defaults.paymentsCollection),
                id: req.id as any
              })
              data.version = (currentDoc.version || 1) + 1
            }
          }
        },
      ] satisfies CollectionBeforeChangeHook<Payment>[],
    },
    timestamps: true,
  }
}
