import type { Payment } from './payments'
import type { Id } from './id'

export interface Invoice<TCustomer = unknown> {
  id: Id;
  /**
   * Invoice number (auto-generated as INV-<unix-ms-timestamp>, e.g. INV-1755289904123, unless set explicitly)
   */
  number: string;
  /**
   * Link to customer record (optional when the customer name and email are filled in)
   */
  customer?: (Id | null) | TCustomer;
  /**
   * Customer billing information. With a `customerInfoExtractor` it is filled from the selected
   * customer; an invoice without a customer keeps the name and email it was created with.
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
   * Billing address (filled from the selected customer when a `customerInfoExtractor` is configured)
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
   * Discount in cents, subtracted from the subtotal. Cannot exceed the subtotal
   */
  discountAmount?: number | null;
  /**
   * Tax amount in cents
   */
  taxAmount?: number | null;
  /**
   * Total amount (subtotal − discount + tax)
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
