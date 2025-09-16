import { Payment } from '@/plugin/types/payments'

import { Id } from '@/plugin/types/id'

export interface Invoice<TCustomer = unknown> {
  id: Id;
  /**
   * Invoice number (e.g., INV-001)
   */
  number: string;
  /**
   * Link to customer record (optional)
   */
  customer?: (Id | null) | TCustomer;
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
