import type { AccessArgs, CollectionConfig, PayloadRequest } from 'payload'
import type { BillingPluginConfig} from '../plugin/config';
import { defaults } from '../plugin/config'
import { extractSlug } from '../plugin/utils'
import type { Payment, Refund } from '../plugin/types/index'
import { randomUUID } from 'node:crypto'
import { submitRefundToProvider, updatePaymentRefundStatus, validateRefundRequest } from '../providers/refunds'
import { createContextLogger } from '../utils/logger'
import { isValidCurrencyCode } from '../providers/currency'

async function onRefundStatusChanged(
  req: PayloadRequest,
  pluginConfig: BillingPluginConfig,
  refund: Refund,
  previousStatus: Refund['status'] | null,
): Promise<void> {
  const logger = createContextLogger(req.payload, 'Refunds Collection')
  const paymentsSlug = extractSlug(pluginConfig.collections?.payments, defaults.paymentsCollection)
  const paymentId = typeof refund.payment === 'object' ? refund.payment.id : refund.payment

  // Refunded / partially_refunded on the payment follows from the succeeded refunds
  if (refund.status === 'succeeded' || previousStatus === 'succeeded') {
    try {
      await updatePaymentRefundStatus(req.payload, pluginConfig, paymentId)
    } catch (error) {
      logger.error(`Failed to update payment ${paymentId} refund status: ${error}`)
    }
  }

  const hooks = pluginConfig.hooks
  const callbacks = [
    hooks?.onRefundStatusChange,
    refund.status === 'succeeded' ? hooks?.onRefundSucceeded : undefined,
    refund.status === 'failed' ? hooks?.onRefundFailed : undefined,
  ].filter((callback) => !!callback)
  if (callbacks.length === 0) {return}

  let payment: Payment | null = null
  try {
    payment = (await req.payload.findByID({ collection: paymentsSlug, depth: 0, id: paymentId })) as Payment
  } catch (error) {
    logger.error(`Failed to load payment ${paymentId} for refund hooks: ${error}`)
  }
  for (const callback of callbacks) {
    try {
      await callback({ payload: req.payload, payment, previousStatus, refund, req })
    } catch (error) {
      // A failing email must not undo a refund
      logger.error(`Refund hook failed for refund ${refund.id}: ${error}`)
    }
  }
}

export function createRefundsCollection(pluginConfig: BillingPluginConfig): CollectionConfig {
  // Get slugs for relationships - these need to be determined before building fields
  const paymentsSlug = extractSlug(pluginConfig.collections?.payments, defaults.paymentsCollection)
  const refundsSlug = extractSlug(pluginConfig.collections?.refunds, defaults.refundsCollection)

  const baseConfig: CollectionConfig = {
    slug: refundsSlug,
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
          description:
            'The refund ID from the payment provider. Filled in when the provider accepts the refund; supply it to record a refund made elsewhere.',
          readOnly: false,
        },
        index: true,
        label: 'Provider Refund ID',
        unique: true,
      },
      {
        name: 'idempotencyKey',
        type: 'text',
        admin: {
          description: 'Sent to the provider so retrying this refund can never pay out twice',
          readOnly: true,
        },
        index: true,
        unique: true,
      },
      {
        name: 'failureReason',
        type: 'text',
        admin: {
          description: 'Why the provider failed or canceled the refund',
          readOnly: true,
        },
      },
      {
        name: 'payment',
        type: 'relationship',
        admin: {
          position: 'sidebar',
        },
        relationTo: paymentsSlug,
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
        defaultValue: 'pending',
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
        async ({ doc, operation, previousDoc, req }) => {
          const previousStatus: Refund['status'] | null = operation === 'create' ? null : (previousDoc?.status ?? null)
          if (previousStatus !== doc.status) {
            await onRefundStatusChanged(req, pluginConfig, doc as Refund, previousStatus)
          }
          if (operation === 'create') {
            const logger = createContextLogger(req.payload, 'Refunds Collection')
            logger.info(`Refund created: ${doc.id} for payment: ${typeof doc.payment === 'object' ? doc.payment.id : doc.payment}`)

            // Update the related payment's refund relationship
            try {
              const payment = await req.payload.findByID({
                id: typeof doc.payment === 'string' ? doc.payment : doc.payment.id,
                collection: paymentsSlug,
              }) as Payment

              const refundIds = Array.isArray(payment.refunds) ? payment.refunds : []
              await req.payload.update({
                id: typeof doc.payment === 'string' ? doc.payment : doc.payment.id,
                collection: paymentsSlug,
                data: {
                  refunds: [...refundIds, doc.id],
                },
              })
            } catch (error) {
              const logger = createContextLogger(req.payload, 'Refunds Collection')
              logger.error(`Failed to update payment refunds: ${error}`)
            }
          }
        },
      ],
      beforeChange: [
        async ({ data, operation, req }) => {
          if (operation === 'create') {
            // Validate amount format
            if (data.amount && !Number.isInteger(data.amount)) {
              throw new Error('Amount must be an integer (in cents)')
            }

            // Normalize and validate the ISO 4217 currency code
            if (data.currency) {
              data.currency = data.currency.toUpperCase()
              if (!isValidCurrencyCode(data.currency)) {
                throw new Error('Currency must be a valid ISO 4217 code')
              }
            }

            // No provider refund yet: this document is the request. Validate it and have the
            // provider carry it out, the same way creating a payment calls initPayment.
            if (!data.providerId) {
              const payment = (await req.payload.findByID({
                collection: paymentsSlug,
                depth: 0,
                id: typeof data.payment === 'object' ? data.payment.id : data.payment,
              })) as Payment
              const { amount, currency } = await validateRefundRequest(req.payload, pluginConfig, payment, data)
              data.amount = amount
              data.currency = currency
              data.idempotencyKey = data.idempotencyKey || randomUUID()
              data.status = data.status || 'pending'
              if (data.status === 'pending') {
                Object.assign(data, await submitRefundToProvider(req.payload, pluginConfig, payment, data as Refund))
              }
            }
          }
        },
      ],
    },
    timestamps: true,
  }

  // Apply collection extension function if provided
  const collectionConfig = pluginConfig.collections?.refunds
  if (typeof collectionConfig === 'object' && collectionConfig.extend) {
    return collectionConfig.extend(baseConfig)
  }

  return baseConfig
}
