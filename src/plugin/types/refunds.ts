import type { Payment } from './payments'

export interface Refund {
  id: number;
  /**
   * The refund ID from the payment provider
   */
  providerId: string;
  payment: number | Payment;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  /**
   * Refund amount in cents
   */
  amount: number;
  /**
   * ISO 4217 currency code (e.g., USD, EUR)
   */
  currency: string;
  /**
   * Reason for the refund
   */
  reason?: ('duplicate' | 'fraudulent' | 'requested_by_customer' | 'other') | null;
  /**
   * Additional details about the refund
   */
  description?: string | null;
  /**
   * Additional refund metadata
   */
  metadata?:
    | {
    [k: string]: unknown;
  }
    | unknown[]
    | string
    | number
    | boolean
    | null;
  /**
   * Raw data from the payment provider
   */
  providerData?:
    | {
    [k: string]: unknown;
  }
    | unknown[]
    | string
    | number
    | boolean
    | null;
  updatedAt: string;
  createdAt: string;
}
