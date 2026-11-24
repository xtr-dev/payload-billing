import type { CollectionConfig } from 'payload'
import type { BillingCollectionAccess } from '../collections/access'
import type { FieldsOverride } from './utils'
import type { Payload, PayloadRequest } from 'payload'
import type { Payment, PaymentProvider, Refund } from './types/index'

export const defaults = {
  paymentsCollection: 'payments',
  invoicesCollection: 'invoices',
  refundsCollection: 'refunds',
  customerRelationSlug: 'customer'
}

// Re-export the actual test provider config instead of duplicating
export type { TestProviderConfig as AdvancedTestProviderConfig } from '../providers/test'

// Customer info extractor callback type
export interface CustomerInfoExtractor {
  (customer: any): {
    name: string
    email: string
    phone?: string
    company?: string
    taxId?: string
    billingAddress?: {
      line1: string
      line2?: string
      city: string
      state?: string
      postalCode: string
      country: string
    }
  }
}

// Collection configuration type
export type CollectionExtension =
  | string
  | {
      /** Defaults to the collection's default slug. */
      slug?: string
      /**
       * Per-operation access for REST, GraphQL and the admin panel. Defaults to admin-collection
       * users only (`req.user.collection === payload.config.admin.user`); an override replaces just
       * the operation it names. Set this if customers sign up in your admin users collection.
       */
      access?: BillingCollectionAccess
      extend?: (config: CollectionConfig) => CollectionConfig
    }

/**
 * Arguments passed to the refund lifecycle hooks.
 */
export interface RefundHookArgs {
  /** The refund after the change (providerId, status and failureReason are up to date). */
  refund: Refund
  /** The refund's status before this change; `null` when the refund was just created. */
  previousStatus: Refund['status'] | null
  /** The refunded payment (depth 0), or `null` if it could not be loaded. */
  payment: Payment | null
  payload: Payload
  req: PayloadRequest
}

export type RefundHook = (args: RefundHookArgs) => Promise<void> | void

// Plugin configuration
export interface BillingPluginConfig {
  collections?: {
    invoices?: CollectionExtension
    payments?: CollectionExtension
    refunds?: CollectionExtension
  }
  customerInfoExtractor?: CustomerInfoExtractor // Callback to extract customer info from relationship
  customerRelationSlug?: string // Customer collection slug for relationship
  disabled?: boolean
  /**
   * Called when a refund's status changes. Each hook runs once per transition (a repeated
   * webhook for the same status does not call it again) and a thrown error is logged, not
   * propagated, so a failing email can never roll back a refund.
   */
  hooks?: {
    /** Any status change, including creation. */
    onRefundStatusChange?: RefundHook
    /** The refund reached `succeeded` (money is on its way back to the buyer). */
    onRefundSucceeded?: RefundHook
    /** The refund reached `failed` (alert staff). */
    onRefundFailed?: RefundHook
  }
  providers?: (PaymentProvider | undefined | null)[]
}
