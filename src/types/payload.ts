/**
 * PayloadCMS type definitions for hooks and handlers
 */

import type { PayloadRequest, User } from 'payload'

// Collection hook types
export interface CollectionBeforeChangeHook<T = Record<string, unknown>> {
  data: T
  operation: 'create' | 'delete' | 'update'
  originalDoc?: T
  req: PayloadRequest
}

export interface CollectionAfterChangeHook<T = Record<string, unknown>> {
  doc: T
  operation: 'create' | 'delete' | 'update'
  previousDoc?: T
  req: PayloadRequest
}

export interface CollectionBeforeValidateHook<T = Record<string, unknown>> {
  data?: T
  operation: 'create' | 'update'
  originalDoc?: T
  req: PayloadRequest
}

// Access control types
export interface AccessArgs<T = unknown> {
  data?: T
  id?: number | string
  req: {
    payload: unknown
    user: null | User
  }
}

// Invoice item type for hooks
export interface InvoiceItemData {
  description: string
  quantity: number
  totalAmount?: number
  unitAmount: number
}

// Invoice data type for hooks
export interface InvoiceData {
  amount?: number
  currency?: string
  customer?: string
  dueDate?: string
  items?: InvoiceItemData[]
  metadata?: Record<string, unknown>
  notes?: string
  number?: string
  paidAt?: string
  payment?: string
  status?: string
  subtotal?: number
  taxAmount?: number
}

// Payment data type for hooks
export interface PaymentData {
  amount?: number
  currency?: string
  customer?: string
  description?: string
  invoice?: string
  metadata?: Record<string, unknown>
  provider?: string
  providerData?: Record<string, unknown>
  providerId?: string
  status?: string
}

// Customer data type for hooks
export interface CustomerData {
  address?: {
    city?: string
    country?: string
    line1?: string
    line2?: string
    postal_code?: string
    state?: string
  }
  email?: string
  metadata?: Record<string, unknown>
  name?: string
  phone?: string
  providerIds?: Record<string, string>
}

// Refund data type for hooks
export interface RefundData {
  amount?: number
  currency?: string
  description?: string
  metadata?: Record<string, unknown>
  payment?: { id: string } | string
  providerData?: Record<string, unknown>
  providerId?: string
  reason?: string
  status?: string
}

// Document types with required fields after creation
export interface PaymentDocument extends PaymentData {
  amount: number
  createdAt: string
  currency: string
  id: string
  provider: string
  providerId: string
  status: string
  updatedAt: string
}

export interface CustomerDocument extends CustomerData {
  createdAt: string
  id: string
  updatedAt: string
}

export interface InvoiceDocument extends InvoiceData {
  amount: number
  createdAt: string
  currency: string
  customer: string
  id: string
  items: InvoiceItemData[]
  number: string
  status: string
  updatedAt: string
}

export interface RefundDocument extends RefundData {
  amount: number
  createdAt: string
  currency: string
  id: string
  payment: { id: string } | string
  providerId: string
  refunds?: string[]
  status: string
  updatedAt: string
}