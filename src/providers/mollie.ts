import type { Payment } from '@/plugin/types/payments'
import type { InitPayment, PaymentProvider } from '@/plugin/types'
import type { Payload } from 'payload'
import { createSingleton } from '@/plugin/singleton'
import type { createMollieClient, MollieClient } from '@mollie/api-client'

const symbol = Symbol('mollie')
export type MollieProviderConfig = Parameters<typeof createMollieClient>[0]

export const mollieProvider = (config: MollieProviderConfig) => {
  const singleton = createSingleton<MollieClient>(symbol)
  return {
    key: 'mollie',
    onInit: async (payload: Payload) => {
      const createMollieClient = (await import('@mollie/api-client')).default
      const mollieClient = createMollieClient(config)
      singleton.set(payload, mollieClient)
    },
    initPayment: async (payload, payment) => {
      if (!payment.amount) {
        throw new Error('Amount is required')
      }
      if (!payment.currency) {
        throw new Error('Currency is required')
      }
      const molliePayment = await singleton.get(payload).payments.create({
        amount: {
          value: (payment.amount / 100).toFixed(2),
          currency: payment.currency
        },
        description: payment.description || '',
        redirectUrl: 'https://localhost:3000/payment/success',
        webhookUrl:  'https://localhost:3000',
      });
      payment.providerId = molliePayment.id
      payment.providerData = molliePayment.toPlainObject()
      return payment
    },
  } satisfies PaymentProvider
}
