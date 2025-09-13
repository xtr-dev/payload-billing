/**
 * Validation utilities for billing data
 */

import { z } from 'zod'

import { isValidCurrencyCode } from './currency'

/**
 * Zod schema for payment creation options
 */
export const createPaymentSchema = z.object({
  amount: z.number().int().positive('Amount must be positive').min(1, 'Amount must be at least 1 cent'),
  cancelUrl: z.string().url('Invalid cancel URL').optional(),
  currency: z.string().length(3, 'Currency must be 3 characters').regex(/^[A-Z]{3}$/, 'Currency must be uppercase'),
  customer: z.string().optional(),
  description: z.string().max(500, 'Description too long').optional(),
  metadata: z.record(z.unknown()).optional(),
  returnUrl: z.string().url('Invalid return URL').optional(),
})

/**
 * Zod schema for customer data
 */
export const customerSchema = z.object({
  name: z.string().max(100, 'Name too long').optional(),
  address: z.object({
    city: z.string().max(50).optional(),
    country: z.string().length(2, 'Country must be 2 characters').regex(/^[A-Z]{2}$/, 'Country must be uppercase').optional(),
    line1: z.string().max(100).optional(),
    line2: z.string().max(100).optional(),
    postal_code: z.string().max(20).optional(),
    state: z.string().max(50).optional(),
  }).optional(),
  email: z.string().email('Invalid email address').optional(),
  metadata: z.record(z.unknown()).optional(),
  phone: z.string().max(20, 'Phone number too long').optional(),
})

/**
 * Zod schema for invoice items
 */
export const invoiceItemSchema = z.object({
  description: z.string().min(1, 'Description is required').max(200, 'Description too long'),
  quantity: z.number().int().positive('Quantity must be positive'),
  unitAmount: z.number().int().min(0, 'Unit amount must be non-negative'),
})

/**
 * Zod schema for invoice creation
 */
export const invoiceSchema = z.object({
  currency: z.string().length(3).regex(/^[A-Z]{3}$/),
  customer: z.string().min(1, 'Customer is required'),
  dueDate: z.string().datetime().optional(),
  items: z.array(invoiceItemSchema).min(1, 'At least one item is required'),
  metadata: z.record(z.unknown()).optional(),
  notes: z.string().max(1000).optional(),
  taxAmount: z.number().int().min(0).default(0),
})

/**
 * Validates payment creation data
 */
export function validateCreatePayment(data: unknown) {
  const result = createPaymentSchema.safeParse(data)
  if (!result.success) {
    throw new Error(`Invalid payment data: ${result.error.issues.map(i => i.message).join(', ')}`)
  }
  
  // Additional currency validation
  if (!isValidCurrencyCode(result.data.currency)) {
    throw new Error(`Unsupported currency: ${result.data.currency}`)
  }
  
  return result.data
}

/**
 * Validates customer data
 */
export function validateCustomer(data: unknown) {
  const result = customerSchema.safeParse(data)
  if (!result.success) {
    throw new Error(`Invalid customer data: ${result.error.issues.map(i => i.message).join(', ')}`)
  }
  return result.data
}

/**
 * Validates invoice data
 */
export function validateInvoice(data: unknown) {
  const result = invoiceSchema.safeParse(data)
  if (!result.success) {
    throw new Error(`Invalid invoice data: ${result.error.issues.map(i => i.message).join(', ')}`)
  }
  
  // Additional currency validation
  if (!isValidCurrencyCode(result.data.currency)) {
    throw new Error(`Unsupported currency: ${result.data.currency}`)
  }
  
  return result.data
}

/**
 * Validates webhook signature format
 */
export function validateWebhookSignature(signature: string, provider: string): void {
  if (!signature) {
    throw new Error(`Missing webhook signature for ${provider}`)
  }
  
  switch (provider) {
    case 'mollie':
      if (signature.length < 32) {
        throw new Error('Invalid Mollie webhook signature length')
      }
      break
    case 'stripe':
      if (!signature.startsWith('t=')) {
        throw new Error('Invalid Stripe webhook signature format')
      }
      break
    case 'test':
      // Test provider accepts any signature
      break
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

/**
 * Validates payment provider name
 */
export function validateProviderName(provider: string): void {
  const validProviders = ['stripe', 'mollie', 'test']
  if (!validProviders.includes(provider)) {
    throw new Error(`Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}`)
  }
}

/**
 * Validates payment amount and currency combination
 */
export function validateAmountAndCurrency(amount: number, currency: string): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Amount must be a positive integer')
  }
  
  if (!isValidCurrencyCode(currency)) {
    throw new Error('Invalid currency code')
  }
  
  // Validate minimum amounts for different currencies
  const minimums: Record<string, number> = {
    EUR: 50,  // €0.50
    GBP: 30,  // £0.30
    JPY: 50,  // ¥50
    USD: 50,  // $0.50
  }
  
  const minimum = minimums[currency] || 50
  if (amount < minimum) {
    throw new Error(`Amount too small for ${currency}. Minimum: ${minimum} cents`)
  }
}

/**
 * Validates refund amount against original payment
 */
export function validateRefundAmount(refundAmount: number, paymentAmount: number): void {
  if (!Number.isInteger(refundAmount) || refundAmount <= 0) {
    throw new Error('Refund amount must be a positive integer')
  }
  
  if (refundAmount > paymentAmount) {
    throw new Error('Refund amount cannot exceed original payment amount')
  }
}