import { CollectionConfig } from 'payload'
import { FieldsOverride } from './utils.js'
import { PaymentProvider } from './types/index.js'

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

// Plugin configuration
export interface BillingPluginConfig {
  admin?: {
    customComponents?: boolean
    dashboard?: boolean
  }
  collections?: {
    invoices?: string | (Partial<CollectionConfig> & {fields?: FieldsOverride})
    payments?: string | (Partial<CollectionConfig> & {fields?: FieldsOverride})
    refunds?: string | (Partial<CollectionConfig> & {fields?: FieldsOverride})
  }
  customerInfoExtractor?: CustomerInfoExtractor // Callback to extract customer info from relationship
  customerRelationSlug?: string // Customer collection slug for relationship
  disabled?: boolean
  providers?: PaymentProvider[]
}

