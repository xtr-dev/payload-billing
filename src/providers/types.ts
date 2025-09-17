import type { Payment } from '@/plugin/types/payments'
import type { Config, Payload } from 'payload'
import type { BillingPluginConfig } from '@/plugin/config'

export type InitPayment = (payload: Payload, payment: Partial<Payment>) => Promise<Partial<Payment>>

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
  raw: T
  timestamp: string
  provider: string
}
