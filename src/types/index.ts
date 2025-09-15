import type { Config } from 'payload'

// Base payment provider interface
export interface PaymentProvider {
  cancelPayment(id: string): Promise<Payment>
  createPayment(options: CreatePaymentOptions): Promise<Payment>
  handleWebhook(request: Request, signature?: string): Promise<WebhookEvent>
  name: string
  refundPayment(id: string, amount?: number): Promise<Refund>
  retrievePayment(id: string): Promise<Payment>
}

// Payment types
export interface CreatePaymentOptions {
  amount: number
  cancelUrl?: string
  currency: string
  customer?: string
  description?: string
  metadata?: Record<string, unknown>
  returnUrl?: string
}

export interface Payment {
  amount: number
  createdAt: string
  currency: string
  customer?: string
  description?: string
  id: string
  metadata?: Record<string, unknown>
  provider: string
  providerData?: Record<string, unknown>
  status: PaymentStatus
  updatedAt: string
}

export interface Refund {
  amount: number
  createdAt: string
  currency: string
  id: string
  paymentId: string
  providerData?: Record<string, unknown>
  reason?: string
  status: RefundStatus
}

export interface WebhookEvent {
  data: Record<string, unknown>
  id: string
  provider: string
  type: string
  verified: boolean
}

// Status enums
export type PaymentStatus = 
  | 'canceled'
  | 'failed'
  | 'partially_refunded'
  | 'pending'
  | 'processing'
  | 'refunded'
  | 'succeeded'

export type RefundStatus =
  | 'canceled'
  | 'failed'
  | 'pending'
  | 'processing'
  | 'succeeded'

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

// Collection types
export interface PaymentRecord {
  amount: number
  createdAt: string
  currency: string
  customer?: string
  description?: string
  id: string
  metadata?: Record<string, unknown>
  provider: string
  providerData?: Record<string, unknown>
  providerId: string
  status: PaymentStatus
  updatedAt: string
}

export interface CustomerRecord {
  address?: {
    city?: string
    country?: string
    line1?: string
    line2?: string
    postal_code?: string
    state?: string
  }
  createdAt: string
  email?: string
  id: string
  metadata?: Record<string, unknown>
  name?: string
  phone?: string
  providerIds?: Record<string, string>
  updatedAt: string
}

export interface InvoiceRecord {
  amount: number
  billingAddress?: {
    city: string
    country: string
    line1: string
    line2?: string
    postalCode: string
    state?: string
  }
  createdAt: string
  currency: string
  customer?: string // Optional relationship to customer collection
  customerInfo?: {
    company?: string
    email: string
    name: string
    phone?: string
    taxId?: string
  }
  dueDate?: string
  id: string
  items: InvoiceItem[]
  metadata?: Record<string, unknown>
  number: string
  paidAt?: string
  status: InvoiceStatus
  updatedAt: string
}

export interface InvoiceItem {
  description: string
  quantity: number
  totalAmount: number
  unitAmount: number
}

export type InvoiceStatus = 
  | 'draft'
  | 'open' 
  | 'paid'
  | 'uncollectible'
  | 'void'

// Plugin type
export interface BillingPluginOptions extends BillingPluginConfig {
  disabled?: boolean
}

// Error types
export class BillingError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider?: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'BillingError'
  }
}

export class PaymentProviderError extends BillingError {
  constructor(
    message: string,
    provider: string,
    code?: string,
    details?: Record<string, unknown>
  ) {
    super(message, code || 'PROVIDER_ERROR', provider, details)
    this.name = 'PaymentProviderError'
  }
}

export class WebhookError extends BillingError {
  constructor(
    message: string,
    provider: string,
    code?: string,
    details?: Record<string, unknown>
  ) {
    super(message, code || 'WEBHOOK_ERROR', provider, details)
    this.name = 'WebhookError'
  }
}