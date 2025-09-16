import type { Payment } from '@/plugin/types/payments'
import type { Payload } from 'payload'

export type InitPayment = (payload: Payload, payment: Partial<Payment>) => Promise<Partial<Payment>>

export type PaymentProvider = {
  key: string
  onInit: (payload: Payload) => Promise<void> | void
  initPayment: InitPayment
}
