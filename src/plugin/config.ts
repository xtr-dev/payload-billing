import type { CollectionConfig } from 'payload'
import type { FieldsOverride } from './utils'
import type { PaymentProvider } from './types/index'

export const defaults = {
  paymentsCollection: 'payments',
  invoicesCollection: 'invoices',
  refundsCollection: 'refunds',
  customerRelationSlug: 'customer'
}

// Provider configurations

export interface TestProviderConfig {
  autoComplete?: boolean
  defaultDelay?: number
  enabled: boolean
  failureRate?: number
  simulateFailures?: boolean
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
      slug: string
      extend?: (config: CollectionConfig) => CollectionConfig
    }

// Plugin configuration
export interface BillingPluginConfig {
  admin?: {
    customComponents?: boolean
    dashboard?: boolean
  }
  collections?: {
    invoices?: CollectionExtension
    payments?: CollectionExtension
    refunds?: CollectionExtension
  }
  customerInfoExtractor?: CustomerInfoExtractor // Callback to extract customer info from relationship
  customerRelationSlug?: string // Customer collection slug for relationship
  disabled?: boolean
  providers?: (PaymentProvider | undefined | null)[]
}

