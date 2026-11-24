import type { Payment } from '../plugin/types/payments'
import type { Refund } from '../plugin/types/refunds'
import type { Config, Payload } from 'payload'
import type { BillingPluginConfig } from '../plugin/config'

export type InitPayment = (payload: Payload, payment: Partial<Payment>) => Promise<Partial<Payment>> | Partial<Payment>

/**
 * What the core asks a provider to refund.
 */
export type ProviderRefundRequest = {
  /** The payment being refunded (its `providerId` is the provider's payment id). */
  payment: Payment
  /** Amount in cents. Always set by the core: a full refund is resolved to the remaining amount first. */
  amount: number
  /** ISO 4217 code, always the payment's currency. */
  currency: string
  description?: string | null
  reason?: Refund['reason']
  metadata?: Refund['metadata']
  /**
   * Stable per refund document. Providers MUST make a repeated call with the same key
   * return the same refund instead of creating a second one (Mollie: `Idempotency-Key`).
   */
  idempotencyKey: string
}

/**
 * A refund as the provider reports it, already mapped onto our refund statuses.
 */
export type ProviderRefund = {
  /** The provider's refund id (Mollie `re_…`). */
  providerId: string
  status: Refund['status']
  amount: number
  currency: string
  /** Why the provider failed or canceled the refund, when it says. */
  failureReason?: string | null
  /** Echo of the idempotency key stored on the refund at the provider, when the provider keeps it. */
  idempotencyKey?: string | null
  providerData?: ProviderData<unknown>
}

export type PaymentProvider = {
  key: string
  onConfig?: (config: Config, pluginConfig: BillingPluginConfig) => void
  onInit?: (payload: Payload) => Promise<void> | void
  initPayment: InitPayment
  /**
   * Send a refund to the provider. Optional: a provider without it leaves refund documents
   * as plain records (the pre-existing behaviour).
   */
  refundPayment?: (payload: Payload, request: ProviderRefundRequest) => Promise<ProviderRefund>
  /**
   * List the provider's current refunds for a payment, for polling and for webhooks that
   * only tell us "something changed on this payment".
   */
  fetchRefunds?: (payload: Payload, payment: Payment) => Promise<ProviderRefund[]>
  /**
   * Fetch the payment's current state from the provider and apply it the same way the
   * provider's webhook does (status update, invoice, refunds). Returns whether the payment
   * document was updated. Called by `syncPaymentFromProvider`.
   */
  syncPayment?: (payload: Payload, pluginConfig: BillingPluginConfig, payment: Payment) => Promise<boolean>
}

/**
 * Type-safe provider data wrapper
 */
export type ProviderData<T = unknown> = {
  raw: T
  timestamp: string
  provider: string
}
