import { Customer, Refund } from '../../dev/payload-types'

export type Id = string | number

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
  customer?: (Id | null) | Customer;
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

export interface Invoice {
  id: Id;
  /**
   * Invoice number (e.g., INV-001)
   */
  number: string;
  /**
   * Link to customer record (optional)
   */
  customer?: (Id | null) | Customer;
  /**
   * Customer billing information (auto-populated from customer relationship)
   */
  customerInfo?: {
    /**
     * Customer name
     */
    name?: string | null;
    /**
     * Customer email address
     */
    email?: string | null;
    /**
     * Customer phone number
     */
    phone?: string | null;
    /**
     * Company name (optional)
     */
    company?: string | null;
    /**
     * Tax ID or VAT number
     */
    taxId?: string | null;
  };
  /**
   * Billing address (auto-populated from customer relationship)
   */
  billingAddress?: {
    /**
     * Address line 1
     */
    line1?: string | null;
    /**
     * Address line 2
     */
    line2?: string | null;
    city?: string | null;
    /**
     * State or province
     */
    state?: string | null;
    /**
     * Postal or ZIP code
     */
    postalCode?: string | null;
    /**
     * Country code (e.g., US, GB)
     */
    country?: string | null;
  };
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  /**
   * ISO 4217 currency code (e.g., USD, EUR)
   */
  currency: string;
  items: {
    description: string;
    quantity: number;
    /**
     * Amount in cents
     */
    unitAmount: number;
    /**
     * Calculated: quantity × unitAmount
     */
    totalAmount?: number | null;
    id?: Id | null;
  }[];
  /**
   * Sum of all line items
   */
  subtotal?: number | null;
  /**
   * Tax amount in cents
   */
  taxAmount?: number | null;
  /**
   * Total amount (subtotal + tax)
   */
  amount?: number | null;
  dueDate?: string | null;
  paidAt?: string | null;
  payment?: (number | null) | Payment;
  /**
   * Internal notes
   */
  notes?: string | null;
  /**
   * Additional invoice metadata
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
  updatedAt: string;
  createdAt: string;
}
