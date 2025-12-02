import type { AccessArgs, CollectionAfterChangeHook, CollectionBeforeChangeHook, CollectionConfig, Field } from 'payload'
import type { BillingPluginConfig} from '../plugin/config';
import { defaults } from '../plugin/config'
import { extractSlug } from '../plugin/utils'
import type { Payment } from '../plugin/types/payments'
import { initProviderPayment } from './hooks'
import { createContextLogger } from '../utils/logger'

export function createPaymentsCollection(pluginConfig: BillingPluginConfig): CollectionConfig {
  // Get slugs for relationships - these need to be determined before building fields
  const invoicesSlug = extractSlug(pluginConfig.collections?.invoices, defaults.invoicesCollection)
  const refundsSlug = extractSlug(pluginConfig.collections?.refunds, defaults.refundsCollection)
  const paymentsSlug = extractSlug(pluginConfig.collections?.payments, defaults.paymentsCollection)

  const fields: Field[] = [
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
      name: 'checkoutUrl',
      type: 'text',
      admin: {
        description: 'Checkout URL where user can complete payment (if applicable)',
        readOnly: true,
      },
    },
    {
      name: 'redirectUrl',
      type: 'text',
      admin: {
        description: 'URL to redirect user after payment completion',
      },
    },
    {
      name: 'invoice',
      type: 'relationship',
      admin: {
        position: 'sidebar',
      },
      relationTo: invoicesSlug,
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
      relationTo: refundsSlug,
    },
    {
      name: 'version',
      type: 'number',
      defaultValue: 1,
      admin: {
        hidden: true, // Hide from admin UI to prevent manual tampering
      },
      index: true, // Index for optimistic locking performance
    },
  ]

  const baseConfig: CollectionConfig = {
    slug: paymentsSlug,
    access: {
      create: ({ req: { user } }: AccessArgs) => !!user,
      delete: ({ req: { user } }: AccessArgs) => !!user,
      read: ({ req: { user } }: AccessArgs) => !!user,
      update: ({ req: { user } }: AccessArgs) => !!user,
    },
    admin: {
      defaultColumns: ['id', 'provider', 'status', 'amount', 'currency', 'createdAt'],
      group: 'Billing',
      useAsTitle: 'id',
    },
    fields,
    defaultPopulate: {
      id: true,
      provider: true,
      status: true,
      amount: true,
      currency: true,
      description: true,
      checkoutUrl: true,
      providerId: true,
      metadata: true,
      providerData: true,
    },
    hooks: {
      afterChange: [
        async ({ doc, operation, req, previousDoc }) => {
          const logger = createContextLogger(req.payload, 'Payments Collection')

          // Only process when payment status changes to a successful state
          const successStatuses = ['paid', 'succeeded']
          const paymentSucceeded = successStatuses.includes(doc.status)
          const statusChanged = operation === 'update' && previousDoc && previousDoc.status !== doc.status

          if (paymentSucceeded && (operation === 'create' || statusChanged)) {
            // If payment has a linked invoice, update the invoice status to paid
            if (doc.invoice) {
              try {
                const invoiceId = typeof doc.invoice === 'object' ? doc.invoice.id : doc.invoice

                logger.info(`Payment ${doc.id} succeeded, updating invoice ${invoiceId} to paid`)

                await req.payload.update({
                  collection: invoicesSlug,
                  id: invoiceId,
                  data: {
                    status: 'paid',
                  },
                })

                logger.info(`Invoice ${invoiceId} marked as paid`)
              } catch (error) {
                logger.error(`Failed to update invoice status: ${error}`)
                // Don't throw - we don't want to fail the payment update
              }
            }
          }
        },
      ] satisfies CollectionAfterChangeHook<Payment>[],
      beforeChange: [
        async ({ data, operation, req, originalDoc }) => {
          if (operation === 'create') {
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
          }

          // Auto-increment version for manual updates (not webhook updates)
          // Webhook updates handle their own versioning in updatePaymentStatus
          if (operation === 'update' && !data.version) {
            // If version is not being explicitly set (i.e., manual admin update),
            // increment it automatically
            const currentVersion = (originalDoc as Payment)?.version || 1
            data.version = currentVersion + 1
          }
        },
      ] satisfies CollectionBeforeChangeHook<Payment>[],
    },
    timestamps: true,
  }

  // Apply collection extension function if provided
  const collectionConfig = pluginConfig.collections?.payments
  if (typeof collectionConfig === 'object' && collectionConfig.extend) {
    return collectionConfig.extend(baseConfig)
  }

  return baseConfig
}
