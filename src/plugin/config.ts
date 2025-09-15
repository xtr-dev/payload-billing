
export const defaults = {
  paymentsCollection: 'payments'
}

// Provider configurations
export interface StripeConfig {
  apiVersion?: string
  publishableKey: string
  secretKey: string
  webhookEndpointSecret: string
}

export interface MollieConfig {
  apiKey: string
  testMode?: boolean
  webhookUrl: string
}

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
    customerRelation?: boolean | string // false to disable, string for custom collection slug
    customers?: string
    invoices?: string
    payments?: string
    refunds?: string
  }
  customerInfoExtractor?: CustomerInfoExtractor // Callback to extract customer info from relationship
  disabled?: boolean
  providers?: {
    mollie?: MollieConfig
    stripe?: StripeConfig
    test?: TestProviderConfig
  }
  webhooks?: {
    basePath?: string
    cors?: boolean
  }
}

// Plugin type
export interface BillingPluginOptions extends BillingPluginConfig {
  disabled?: boolean
}
