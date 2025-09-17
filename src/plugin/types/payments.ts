import { Refund } from '@/plugin/types/refunds'
import { Invoice } from '@/plugin/types/invoices'
import { Id } from '@/plugin/types/id'

export interface Payment {
  id: Id;
  provider: 'stripe' | 'mollie' | 'test';
  /**
   * The payment ID from the payment provider
   */
  providerId: Id;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled' | 'refunded' | 'partially_refunded';
  /**
   * Amount in cents (e.g., 2000 = $20.00)
   */
  amount: number;
  /**
   * ISO 4217 currency code (e.g., USD, EUR)
   */
  currency: string;
  /**
   * Payment description
   */
  description?: string | null;
  invoice?: (Id | null) | Invoice;
  /**
   * Additional metadata for the payment
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
  refunds?: (number | Refund)[] | null;
  updatedAt: string;
  createdAt: string;
}
