
export { billingPlugin } from './plugin/index'
export type { BillingPluginConfig, CustomerInfoExtractor, AdvancedTestProviderConfig } from './plugin/config'
export type { Invoice, Payment, Refund } from './plugin/types/index'
export type { PaymentProvider, ProviderData, InitPayment } from './providers/types'

import type { Invoice as InvoiceType } from './plugin/types/invoices'
import type { Payment as PaymentType } from './plugin/types/payments'
import type { Refund as RefundType } from './plugin/types/refunds'

// Reusable field-level types, derived from the collection types above so they
// can't drift from the shapes they describe.
export type PaymentStatus = PaymentType['status']
export type InvoiceStatus = InvoiceType['status']
export type RefundStatus = RefundType['status']
export type RefundReason = NonNullable<RefundType['reason']>
export type Address = NonNullable<InvoiceType['billingAddress']>
export type InvoiceItem = InvoiceType['items'][number]
export type CustomerInfo = NonNullable<InvoiceType['customerInfo']>

// Export logging utilities
export { getPluginLogger, createContextLogger } from './utils/logger'

// Export test provider (always available)
export { testProvider } from './providers/test'
export type {
  TestProviderConfig,
  TestProviderConfigResponse,
  PaymentOutcome,
  PaymentMethod,
  PaymentScenario
} from './providers/test'

// Mollie and Stripe providers are optional - import from separate entry points:
// import { mollieProvider } from '@xtr-dev/payload-billing/mollie'
// import { stripeProvider } from '@xtr-dev/payload-billing/stripe'
export type { StripeProviderConfig } from './providers/stripe'
export type { MollieProviderConfig } from './providers/mollie'
