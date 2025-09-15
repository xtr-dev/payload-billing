import type { CollectionConfig } from 'payload'

import type {
  AccessArgs,
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  RefundData,
  RefundDocument
} from '../types/payload'

export function createRefundsCollection(slug: string = 'refunds'): CollectionConfig {
  return {
    slug,
    access: {
      create: ({ req: { user } }: AccessArgs) => !!user,
      delete: ({ req: { user } }: AccessArgs) => !!user,
      read: ({ req: { user } }: AccessArgs) => !!user,
      update: ({ req: { user } }: AccessArgs) => !!user,
    },
    admin: {
      defaultColumns: ['id', 'payment', 'amount', 'currency', 'status', 'createdAt'],
      group: 'Billing',
      useAsTitle: 'id',
    },
    fields: [
      {
        name: 'providerId',
        type: 'text',
        admin: {
          description: 'The refund ID from the payment provider',
        },
        label: 'Provider Refund ID',
        required: true,
        unique: true,
      },
      {
        name: 'payment',
        type: 'relationship',
        admin: {
          position: 'sidebar',
        },
        relationTo: 'payments',
        required: true,
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
        ],
        required: true,
      },
      {
        name: 'amount',
        type: 'number',
        admin: {
          description: 'Refund amount in cents',
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
        name: 'reason',
        type: 'select',
        admin: {
          description: 'Reason for the refund',
        },
        options: [
          { label: 'Duplicate', value: 'duplicate' },
          { label: 'Fraudulent', value: 'fraudulent' },
          { label: 'Requested by Customer', value: 'requested_by_customer' },
          { label: 'Other', value: 'other' },
        ],
      },
      {
        name: 'description',
        type: 'textarea',
        admin: {
          description: 'Additional details about the refund',
        },
      },
      {
        name: 'metadata',
        type: 'json',
        admin: {
          description: 'Additional refund metadata',
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
    ],
    hooks: {
      afterChange: [
        async ({ doc, operation, req }: CollectionAfterChangeHook<RefundDocument>) => {
          if (operation === 'create') {
            req.payload.logger.info(`Refund created: ${doc.id} for payment: ${doc.payment}`)

            // Update the related payment's refund relationship
            try {
              const payment = await req.payload.findByID({
                id: typeof doc.payment === 'string' ? doc.payment : doc.payment.id,
                collection: 'payments',
              })

              const refundIds = Array.isArray(payment.refunds) ? payment.refunds : []
              await req.payload.update({
                id: typeof doc.payment === 'string' ? doc.payment : doc.payment.id,
                collection: 'payments',
                data: {
                  refunds: [...refundIds, doc.id as any],
                },
              })
            } catch (error) {
              req.payload.logger.error(`Failed to update payment refunds: ${error}`)
            }
          }
        },
      ],
      beforeChange: [
        ({ data, operation }: CollectionBeforeChangeHook<RefundData>) => {
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
          }
        },
      ],
    },
    timestamps: true,
  }
}
