import type { Payment } from '../plugin/types/index'
import type { Payload } from 'payload'
import { useBillingPlugin } from '../plugin/index'

export const initProviderPayment = async (payload: Payload, payment: Partial<Payment>): Promise<Partial<Payment>> => {
  const billing = useBillingPlugin(payload)

  if (!billing) {
    throw new Error(
      'Billing plugin not initialized. Make sure the billingPlugin is properly configured in your Payload config and that Payload has finished initializing. ' +
      'If you are calling this from a Next.js API route or Server Component, ensure you are using getPayload() with the same config instance used in your Payload configuration.'
    )
  }

  if (!payment.provider || !billing.providerConfig[payment.provider]) {
    throw new Error(`Provider ${payment.provider} not found.`)
  }
  // Handle both async and non-async initPayment functions
  const result = billing.providerConfig[payment.provider].initPayment(payload, payment)
  return await Promise.resolve(result)
}
