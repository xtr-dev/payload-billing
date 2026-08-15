import type { Payment } from '../plugin/types/payments'
import type { Config, Payload } from 'payload'
import type { BillingPluginConfig } from '../plugin/config'

export type InitPayment = (
  payload: Payload,
  payment: Partial<Payment>,
) => Promise<Partial<Payment>> | Partial<Payment>

export type PaymentProvider = {
  key: string
  onConfig?: (config: Config, pluginConfig: BillingPluginConfig) => void
  onInit?: (payload: Payload) => Promise<void> | void
  initPayment: InitPayment
}

/**
 * Type-safe provider data wrapper
 */
export type ProviderData<T = unknown> = {
  eventId?: string
  /**
   * Ids of webhook events already applied to this payment, most recent last.
   * `eventId` alone only catches a back-to-back replay of the same event; a
   * redelivery of an older event after a newer one has already been applied
   * (e.g. a succeeded event replayed after a later refund event) needs the
   * full history to be recognised as already-processed.
   */
  processedEventIds?: string[]
  raw: T
  timestamp: string
  provider: string
}
