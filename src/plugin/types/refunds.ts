import type { Payment } from './payments'

export interface Refund {
  id: number;
  /**
   * The refund ID from the payment provider (set once the provider accepted the refund)
   */
  providerId?: string | null;
  /**
   * A record only: never sent to the provider and skipped by the refund sweeps
   */
  manual?: boolean | null;
  /**
   * Stable key that makes retries of this refund safe (sent to the provider)
   */
  idempotencyKey?: string | null;
  /**
   * Why the provider failed or canceled the refund
   */
  failureReason?: string | null;
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
