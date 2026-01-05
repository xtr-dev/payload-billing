
export { billingPlugin } from './plugin/index'
export type { BillingPluginConfig, CustomerInfoExtractor, AdvancedTestProviderConfig } from './plugin/config'
export type { Invoice, Payment, Refund } from './plugin/types/index'
export type { PaymentProvider, ProviderData } from './providers/types'

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
