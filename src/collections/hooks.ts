import type { Payment } from '../plugin/types/index.js'
import type { Payload } from 'payload'
import { useBillingPlugin } from '../plugin/index.js'

export const initProviderPayment = (payload: Payload, payment: Partial<Payment>) => {
  const billing = useBillingPlugin(payload)
  if (!payment.provider || !billing.providerConfig[payment.provider]) {
    throw new Error(`Provider ${payment.provider} not found.`)
  }
  return billing.providerConfig[payment.provider].initPayment(payload, payment)
}
