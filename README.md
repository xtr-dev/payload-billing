# @xtr-dev/payload-billing

[![npm version](https://badge.fury.io/js/@xtr-dev%2Fpayload-billing.svg)](https://badge.fury.io/js/@xtr-dev%2Fpayload-billing)

A comprehensive billing and payment provider plugin for PayloadCMS 3.x with support for Stripe, Mollie, and local testing. Features automatic payment/invoice synchronization, webhook processing, and flexible customer data management.

⚠️ **Pre-release Warning**: This package is in active development (v0.1.x). Breaking changes may occur before v1.0.0. Not recommended for production use.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Payment Providers](#payment-providers)
  - [Stripe](#stripe)
  - [Mollie](#mollie)
  - [Test Provider](#test-provider)
- [Configuration](#configuration)
  - [Basic Setup](#basic-setup)
  - [Customer Management](#customer-management)
  - [Provider Configuration](#provider-configuration)
- [Collections](#collections)
  - [Payments](#payments)
  - [Invoices](#invoices)
  - [Refunds](#refunds)
- [Payment Flows](#payment-flows)
- [Usage Examples](#usage-examples)
- [Webhook Setup](#webhook-setup)
- [API Reference](#api-reference)
- [TypeScript Support](#typescript-support)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Features

- 💳 **Multiple Payment Providers** - Stripe, Mollie, and Test provider support
- 🧾 **Invoice Management** - Generate invoices with line items, tax calculation, and automatic numbering
- 👥 **Flexible Customer Data** - Use relationships to existing collections or embedded customer info
- 🔄 **Automatic Synchronization** - Payment and invoice statuses sync bidirectionally
- 🪝 **Secure Webhooks** - Production-ready webhook handling with signature verification
- 🔗 **Bidirectional Relations** - Payment-invoice-refund relationships automatically maintained
- 🎨 **Collection Extension** - Add custom fields and hooks to all collections
- 🧪 **Testing Tools** - Built-in test provider with configurable payment scenarios
- 🔒 **Type-Safe** - Full TypeScript support with comprehensive type definitions
- ⚡ **Optimistic Locking** - Prevents concurrent payment status update conflicts
- 💰 **Multi-Currency** - Support for 100+ currencies with proper decimal handling
- 🔐 **Production Ready** - Transaction support, error handling, and security best practices

## Installation

```bash
npm install @xtr-dev/payload-billing
# or
pnpm add @xtr-dev/payload-billing
# or
yarn add @xtr-dev/payload-billing
```

### Provider Dependencies

Payment providers are peer dependencies and must be installed separately:

```bash
# For Stripe support
npm install stripe

# For Mollie support
npm install @mollie/api-client
```

The test provider requires no additional dependencies.

## Quick Start

### Basic Setup

```typescript
import { buildConfig } from 'payload'
import { billingPlugin, stripeProvider } from '@xtr-dev/payload-billing'

export default buildConfig({
  // ... your config
  plugins: [
    billingPlugin({
      providers: [
        stripeProvider({
          secretKey: process.env.STRIPE_SECRET_KEY!,
          webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
        }),
      ],
    })
  ]
})
```

### Create Your First Payment

```typescript
const payment = await payload.create({
  collection: 'payments',
  data: {
    provider: 'stripe',
    amount: 5000,        // $50.00 in cents
    currency: 'USD',
    description: 'Product purchase',
    status: 'pending',
  }
})

// Payment is automatically initialized with Stripe
console.log(payment.providerId)  // Stripe PaymentIntent ID
```

## Payment Providers

### Stripe

Full-featured credit card processing with support for multiple payment methods, subscriptions, and refunds.

**Features:**
- Credit/debit cards, digital wallets (Apple Pay, Google Pay)
- Automatic payment method detection
- Strong Customer Authentication (SCA) support
- Comprehensive webhook events
- Full refund support (partial and full)

**Configuration:**

```typescript
import { stripeProvider } from '@xtr-dev/payload-billing'

stripeProvider({
  secretKey: string          // Required: Stripe secret key (sk_test_... or sk_live_...)
  webhookSecret?: string     // Recommended: Webhook signing secret (whsec_...)
  apiVersion?: string        // Optional: API version (default: '2025-08-27.basil')
  returnUrl?: string         // Optional: Custom return URL after payment
  webhookUrl?: string        // Optional: Custom webhook URL
})
```

**Environment Variables:**

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Mollie

European payment service provider supporting iDEAL, SEPA, Bancontact, and other local payment methods.

**Features:**
- 20+ European payment methods (iDEAL, SEPA, Bancontact, etc.)
- Multi-currency support
- Simple redirect-based flow
- Automatic webhook notifications

**Configuration:**

```typescript
import { mollieProvider } from '@xtr-dev/payload-billing'

mollieProvider({
  apiKey: string           // Required: Mollie API key (test_... or live_...)
  webhookUrl?: string      // Optional: Custom webhook URL
  redirectUrl?: string     // Optional: Custom redirect URL after payment
})
```

**Environment Variables:**

```bash
MOLLIE_API_KEY=test_...
MOLLIE_WEBHOOK_URL=https://yourdomain.com/api/payload-billing/mollie/webhook
PAYLOAD_PUBLIC_SERVER_URL=https://yourdomain.com
```

**Important Notes:**
- Mollie requires HTTPS URLs in production (no localhost)
- Webhook URL defaults to `{PAYLOAD_PUBLIC_SERVER_URL}/api/payload-billing/mollie/webhook`
- Amounts are formatted as decimal strings (e.g., "50.00")

### Test Provider

Local development provider with interactive UI for testing different payment scenarios.

**Features:**
- Interactive payment UI with scenario selection
- Configurable payment outcomes (success, failure, cancellation, etc.)
- Customizable processing delays
- Multiple payment method simulation
- No external API calls

**Configuration:**

```typescript
import { testProvider } from '@xtr-dev/payload-billing'

testProvider({
  enabled: boolean                           // Required: Must be explicitly enabled
  scenarios?: PaymentScenario[]              // Optional: Custom scenarios
  defaultDelay?: number                      // Optional: Default processing delay (ms)
  baseUrl?: string                           // Optional: Server URL
  testModeIndicators?: {
    showWarningBanners?: boolean             // Show test mode warnings
    showTestBadges?: boolean                 // Show test badges on UI
    consoleWarnings?: boolean                // Log test mode warnings
  }
})
```

**Default Scenarios:**

| Scenario | Outcome | Delay |
|----------|---------|-------|
| Instant Success | `succeeded` | 0ms |
| Delayed Success | `succeeded` | 3000ms |
| Cancelled Payment | `canceled` | 1000ms |
| Declined Payment | `failed` | 2000ms |
| Expired Payment | `canceled` | 5000ms |
| Pending Payment | `pending` | 1500ms |

**Custom Scenarios:**

```typescript
testProvider({
  enabled: true,
  scenarios: [
    {
      id: 'slow-success',
      name: 'Slow Success',
      description: 'Payment succeeds after 10 seconds',
      outcome: 'paid',
      delay: 10000,
      method: 'creditcard'
    },
    {
      id: 'instant-fail',
      name: 'Instant Failure',
      description: 'Payment fails immediately',
      outcome: 'failed',
      delay: 0,
      method: 'ideal'
    }
  ]
})
```

**Usage:**

1. Create a test payment
2. Navigate to the payment URL in `providerData.raw.paymentUrl`
3. Select payment method and scenario
4. Submit to process payment

## Configuration

### Basic Setup

Minimal configuration with a single provider:

```typescript
import { billingPlugin, stripeProvider } from '@xtr-dev/payload-billing'

billingPlugin({
  providers: [
    stripeProvider({
      secretKey: process.env.STRIPE_SECRET_KEY!,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    })
  ]
})
```

### Multiple Providers

Use multiple payment providers simultaneously:

```typescript
billingPlugin({
  providers: [
    stripeProvider({
      secretKey: process.env.STRIPE_SECRET_KEY!,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    }),
    mollieProvider({
      apiKey: process.env.MOLLIE_API_KEY!,
      webhookUrl: process.env.MOLLIE_WEBHOOK_URL,
    }),
    testProvider({
      enabled: process.env.NODE_ENV === 'development',
    })
  ]
})
```

### Customer Management

#### Option 1: Customer Relationship with Auto-Sync

Link invoices to an existing customer collection and automatically populate customer data:

```typescript
import { CustomerInfoExtractor } from '@xtr-dev/payload-billing'

const customerExtractor: CustomerInfoExtractor = (customer) => ({
  name: customer.name,
  email: customer.email,
  phone: customer.phone,
  company: customer.company,
  taxId: customer.taxId,
  billingAddress: {
    line1: customer.address.line1,
    line2: customer.address.line2,
    city: customer.address.city,
    state: customer.address.state,
    postalCode: customer.address.postalCode,
    country: customer.address.country,
  }
})

billingPlugin({
  providers: [/* ... */],
  customerRelationSlug: 'customers',
  customerInfoExtractor: customerExtractor,
})
```

**Behavior:**
- Customer relationship field is **required**
- Customer info fields are **read-only** (auto-populated)
- Customer info syncs automatically when customer record changes

#### Option 2: Customer Relationship (Manual Customer Info)

Link to customer collection but manually enter customer data:

```typescript
billingPlugin({
  providers: [/* ... */],
  customerRelationSlug: 'customers',
  // No customerInfoExtractor
})
```

**Behavior:**
- Customer relationship is **optional**
- Customer info fields are **editable**
- Either customer relationship OR customer info is required

#### Option 3: No Customer Collection

Store customer data directly on invoices:

```typescript
billingPlugin({
  providers: [/* ... */],
  // No customerRelationSlug
})
```

**Behavior:**
- No customer relationship field
- Customer info fields are **required** and **editable**

### Collection Slugs

Customize collection names:

```typescript
billingPlugin({
  providers: [/* ... */],
  collections: {
    payments: 'transactions',     // Default: 'payments'
    invoices: 'bills',            // Default: 'invoices'
    refunds: 'chargebacks',       // Default: 'refunds'
  }
})
```

### Provider Configuration Reference

| Provider | Required Config | Optional Config | Notes |
|----------|----------------|-----------------|-------|
| **Stripe** | `secretKey` | `webhookSecret`, `apiVersion`, `returnUrl`, `webhookUrl` | Webhook secret highly recommended for production |
| **Mollie** | `apiKey` | `webhookUrl`, `redirectUrl` | Requires HTTPS in production |
| **Test** | `enabled: true` | `scenarios`, `defaultDelay`, `baseUrl`, `testModeIndicators` | Only for development |

## Collections

### Payments

Tracks payment transactions with provider integration.

**Fields:**

```typescript
{
  id: string | number
  provider: 'stripe' | 'mollie' | 'test'
  providerId: string                    // Provider's payment ID
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled' | 'refunded' | 'partially_refunded'
  amount: number                        // Amount in cents
  currency: string                      // ISO 4217 currency code
  description?: string
  invoice?: Invoice | string            // Linked invoice
  metadata?: Record<string, any>        // Custom metadata
  providerData?: ProviderData           // Raw provider response (read-only)
  refunds?: Refund[]                    // Associated refunds
  version: number                       // For optimistic locking
  createdAt: string
  updatedAt: string
}
```

**Status Flow:**

```
pending → processing → succeeded
                    → failed
                    → canceled
succeeded → partially_refunded → refunded
```

**Automatic Behaviors:**
- Amount must be a positive integer
- Currency normalized to uppercase
- Version incremented on each update
- Provider's `initPayment()` called on creation
- Linked invoice updated when status becomes `succeeded`

### Invoices

Generate and manage invoices with line items and customer information.

**Fields:**

```typescript
{
  id: string | number
  number: string                        // Auto-generated (INV-YYYYMMDD-XXXX)
  customer?: string                     // Customer relationship (if configured)
  customerInfo: {
    name: string
    email: string
    phone?: string
    company?: string
    taxId?: string
  }
  billingAddress: {
    line1: string
    line2?: string
    city: string
    state?: string
    postalCode: string
    country: string                     // ISO 3166-1 alpha-2
  }
  currency: string                      // ISO 4217 currency code
  items: Array<{
    description: string
    quantity: number
    unitAmount: number                  // In cents
    amount: number                      // Auto-calculated (quantity × unitAmount)
  }>
  subtotal: number                      // Auto-calculated sum of items
  taxAmount?: number
  amount: number                        // Auto-calculated (subtotal + taxAmount)
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  payment?: Payment | string            // Linked payment
  dueDate?: string
  issuedAt?: string
  paidAt?: string                       // Auto-set when status becomes 'paid'
  notes?: string
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
}
```

**Status Flow:**

```
draft → open → paid
            → void
            → uncollectible
```

**Automatic Behaviors:**
- Invoice number auto-generated on creation
- Item amounts calculated from quantity × unitAmount
- Subtotal calculated from sum of item amounts
- Total amount calculated as subtotal + taxAmount
- `paidAt` timestamp set when status becomes 'paid'
- Linked payment updated when invoice marked as paid
- Customer info auto-populated if extractor configured

### Refunds

Track refunds associated with payments.

**Fields:**

```typescript
{
  id: string | number
  payment: Payment | string             // Required: linked payment
  providerId?: string                   // Provider's refund ID
  amount: number                        // Refund amount in cents
  currency: string                      // ISO 4217 currency code
  status: 'pending' | 'succeeded' | 'failed' | 'canceled'
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer' | 'other'
  description?: string
  metadata?: Record<string, any>
  providerData?: ProviderData
  createdAt: string
  updatedAt: string
}
```

**Automatic Behaviors:**
- Payment status updated based on refund amount:
  - Full refund: payment status → `refunded`
  - Partial refund: payment status → `partially_refunded`
- Refunds tracked in payment's `refunds` array

## Payment Flows

### Stripe Payment Flow

```
1. Create Payment Record
   └─> POST /api/payments { provider: 'stripe', amount: 5000, ... }

2. Initialize with Stripe
   └─> stripe.paymentIntents.create()
   └─> Returns: PaymentIntent with client_secret

3. Client Confirms Payment
   └─> Use Stripe.js with client_secret
   └─> User completes payment

4. Stripe Sends Webhook
   └─> POST /api/payload-billing/stripe/webhook
   └─> Event: payment_intent.succeeded

5. Update Payment Status
   └─> Find payment by providerId
   └─> Update status to 'succeeded' (with optimistic locking)

6. Update Invoice Status
   └─> Find linked invoice
   └─> Update invoice status to 'paid'
   └─> Set paidAt timestamp
```

### Mollie Payment Flow

```
1. Create Payment Record
   └─> POST /api/payments { provider: 'mollie', amount: 5000, ... }

2. Initialize with Mollie
   └─> mollieClient.payments.create()
   └─> Returns: Payment with checkout URL

3. Redirect User to Mollie
   └─> User redirected to Mollie's checkout page
   └─> User completes payment

4. Mollie Sends Webhook
   └─> POST /api/payload-billing/mollie/webhook
   └─> Body: id=tr_xxxxx

5. Fetch Payment Status
   └─> mollieClient.payments.get(id)
   └─> Get latest payment status

6. Update Payment Status
   └─> Map Mollie status to internal status
   └─> Update with optimistic locking

7. Update Invoice Status
   └─> Update linked invoice to 'paid' if payment succeeded
```

### Test Provider Flow

```
1. Create Payment Record
   └─> POST /api/payments { provider: 'test', amount: 5000, ... }

2. Create In-Memory Session
   └─> Generate test payment ID (test_pay_...)
   └─> Store session in memory
   └─> Return payment UI URL

3. User Opens Payment UI
   └─> Navigate to /api/payload-billing/test/payment/{id}
   └─> Interactive HTML form displayed

4. Select Scenario
   └─> Choose payment method (iDEAL, Credit Card, etc.)
   └─> Choose scenario (Success, Failed, etc.)
   └─> Submit form

5. Process Payment
   └─> POST /api/payload-billing/test/process
   └─> Schedule payment processing after delay
   └─> Return processing status

6. Update Payment Status
   └─> After delay, update payment in database
   └─> Map scenario outcome to payment status
   └─> Update linked invoice if succeeded
```

## Usage Examples

### Creating a Payment with Stripe

```typescript
// Create payment
const payment = await payload.create({
  collection: 'payments',
  data: {
    provider: 'stripe',
    amount: 2000,           // $20.00
    currency: 'USD',
    description: 'Premium subscription',
    status: 'pending',
    metadata: {
      customerId: 'cust_123',
      planId: 'premium'
    }
  }
})

// Get client secret for Stripe.js
const clientSecret = payment.providerData.raw.client_secret

// Frontend: Confirm payment with Stripe.js
// const stripe = Stripe('pk_...')
// await stripe.confirmCardPayment(clientSecret, { ... })
```

### Creating an Invoice with Line Items

```typescript
const invoice = await payload.create({
  collection: 'invoices',
  data: {
    customerInfo: {
      name: 'Acme Corporation',
      email: 'billing@acme.com',
      company: 'Acme Corp',
      taxId: 'US123456789'
    },
    billingAddress: {
      line1: '123 Business Blvd',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94102',
      country: 'US'
    },
    currency: 'USD',
    items: [
      {
        description: 'Website Development',
        quantity: 40,
        unitAmount: 15000    // $150/hour
      },
      {
        description: 'Hosting (Annual)',
        quantity: 1,
        unitAmount: 50000    // $500
      }
    ],
    taxAmount: 65000,        // $650 (10% tax)
    dueDate: '2025-12-31',
    status: 'open',
    notes: 'Payment due within 30 days'
  }
})

// Invoice automatically calculated:
// subtotal = (40 × $150) + (1 × $500) = $6,500
// amount = $6,500 + $650 = $7,150
console.log(`Invoice ${invoice.number} created for $${invoice.amount / 100}`)
```

### Linking Payment to Invoice

```typescript
// Create payment for specific invoice
const payment = await payload.create({
  collection: 'payments',
  data: {
    provider: 'stripe',
    amount: invoice.amount,
    currency: invoice.currency,
    description: `Payment for invoice ${invoice.number}`,
    invoice: invoice.id,      // Link to invoice
    status: 'pending'
  }
})

// Or update invoice with payment
await payload.update({
  collection: 'invoices',
  id: invoice.id,
  data: {
    payment: payment.id
  }
})
```

### Creating a Refund

```typescript
// Full refund
const refund = await payload.create({
  collection: 'refunds',
  data: {
    payment: payment.id,
    amount: payment.amount,      // Full amount
    currency: payment.currency,
    status: 'succeeded',
    reason: 'requested_by_customer',
    description: 'Customer cancelled order'
  }
})
// Payment status automatically updated to 'refunded'

// Partial refund
const partialRefund = await payload.create({
  collection: 'refunds',
  data: {
    payment: payment.id,
    amount: 1000,               // Partial amount ($10.00)
    currency: payment.currency,
    status: 'succeeded',
    reason: 'requested_by_customer',
    description: 'Partial refund for damaged item'
  }
})
// Payment status automatically updated to 'partially_refunded'
```

### Using Customer Relationships

```typescript
// With customer extractor configured
const invoice = await payload.create({
  collection: 'invoices',
  data: {
    customer: 'customer_id_123',  // Customer info auto-populated
    currency: 'EUR',
    items: [{
      description: 'Monthly Subscription',
      quantity: 1,
      unitAmount: 4900            // €49.00
    }],
    status: 'open'
  }
})
// customerInfo and billingAddress automatically filled from customer record
```

### Querying with Relations

```typescript
// Find all payments for a customer's invoices
const customerInvoices = await payload.find({
  collection: 'invoices',
  where: {
    customer: { equals: customerId }
  }
})

const payments = await payload.find({
  collection: 'payments',
  where: {
    invoice: {
      in: customerInvoices.docs.map(inv => inv.id)
    },
    status: { equals: 'succeeded' }
  }
})

// Find all refunds for a payment
const payment = await payload.findByID({
  collection: 'payments',
  id: paymentId,
  depth: 2  // Include refund details
})

console.log(`Payment has ${payment.refunds?.length || 0} refunds`)
```

### Using Metadata

```typescript
// Store custom data with payment
const payment = await payload.create({
  collection: 'payments',
  data: {
    provider: 'stripe',
    amount: 5000,
    currency: 'USD',
    metadata: {
      orderId: 'order_12345',
      customerId: 'cust_67890',
      source: 'mobile_app',
      campaignId: 'spring_sale_2025',
      affiliateCode: 'REF123'
    }
  }
})

// Query by metadata
const campaignPayments = await payload.find({
  collection: 'payments',
  where: {
    'metadata.campaignId': { equals: 'spring_sale_2025' },
    status: { equals: 'succeeded' }
  }
})
```

## Webhook Setup

### Stripe Webhook Configuration

1. **Get your webhook signing secret:**
   - Go to Stripe Dashboard → Developers → Webhooks
   - Click "Add endpoint"
   - URL: `https://yourdomain.com/api/payload-billing/stripe/webhook`
   - Events to send: Select all `payment_intent.*` and `charge.refunded` events
   - Copy the signing secret (`whsec_...`)

2. **Add to environment:**
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

3. **Test locally with Stripe CLI:**
   ```bash
   stripe listen --forward-to localhost:3000/api/payload-billing/stripe/webhook
   stripe trigger payment_intent.succeeded
   ```

**Events Handled:**
- `payment_intent.succeeded` → Updates payment status to `succeeded`
- `payment_intent.failed` → Updates payment status to `failed`
- `payment_intent.canceled` → Updates payment status to `canceled`
- `charge.refunded` → Updates payment status to `refunded` or `partially_refunded`

### Mollie Webhook Configuration

1. **Set webhook URL:**
   ```bash
   MOLLIE_WEBHOOK_URL=https://yourdomain.com/api/payload-billing/mollie/webhook
   PAYLOAD_PUBLIC_SERVER_URL=https://yourdomain.com
   ```

2. **Mollie automatically calls webhook** for payment status updates

3. **Test locally with ngrok:**
   ```bash
   ngrok http 3000
   # Use ngrok URL as PAYLOAD_PUBLIC_SERVER_URL
   ```

**Important:**
- Mollie requires HTTPS URLs (no `http://` or `localhost` in production)
- Webhook URL defaults to `{PAYLOAD_PUBLIC_SERVER_URL}/api/payload-billing/mollie/webhook`
- Mollie validates webhooks by verifying payment ID exists

### Webhook Security

All webhook endpoints:
- Return HTTP 200 OK for all requests (prevents replay attacks)
- Validate signatures (Stripe) or payment IDs (Mollie)
- Use optimistic locking to prevent concurrent update conflicts
- Log detailed errors internally but return generic responses
- Run within database transactions for atomicity

## API Reference

### Plugin Configuration

```typescript
type BillingPluginConfig = {
  providers?: PaymentProvider[]
  collections?: {
    payments?: string
    invoices?: string
    refunds?: string
  }
  customerRelationSlug?: string
  customerInfoExtractor?: CustomerInfoExtractor
}
```

### Provider Types

```typescript
type PaymentProvider = {
  key: string
  onConfig?: (config: Config, pluginConfig: BillingPluginConfig) => void
  onInit?: (payload: Payload) => Promise<void> | void
  initPayment: (payload: Payload, payment: Partial<Payment>) => Promise<Partial<Payment>>
}

type StripeProviderConfig = {
  secretKey: string
  webhookSecret?: string
  apiVersion?: string
  returnUrl?: string
  webhookUrl?: string
}

type MollieProviderConfig = {
  apiKey: string
  webhookUrl?: string
  redirectUrl?: string
}

type TestProviderConfig = {
  enabled: boolean
  scenarios?: PaymentScenario[]
  defaultDelay?: number
  baseUrl?: string
  testModeIndicators?: {
    showWarningBanners?: boolean
    showTestBadges?: boolean
    consoleWarnings?: boolean
  }
}
```

### Customer Info Extractor

```typescript
type CustomerInfoExtractor = (
  customer: any
) => {
  name: string
  email: string
  phone?: string
  company?: string
  taxId?: string
  billingAddress: Address
}

type Address = {
  line1: string
  line2?: string
  city: string
  state?: string
  postalCode: string
  country: string  // ISO 3166-1 alpha-2 (e.g., 'US', 'GB', 'NL')
}
```

### Provider Data

```typescript
type ProviderData<T = any> = {
  raw: T                    // Raw provider response
  timestamp: string         // ISO 8601 timestamp
  provider: string          // Provider key ('stripe', 'mollie', 'test')
}
```

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import type {
  // Main types
  Payment,
  Invoice,
  Refund,

  // Provider types
  PaymentProvider,
  StripeProviderConfig,
  MollieProviderConfig,
  TestProviderConfig,

  // Configuration
  BillingPluginConfig,
  CustomerInfoExtractor,

  // Data types
  ProviderData,
  Address,
  InvoiceItem,
  CustomerInfo,

  // Status types
  PaymentStatus,
  InvoiceStatus,
  RefundStatus,
  RefundReason,

  // Utility types
  InitPayment,
  PaymentScenario,
} from '@xtr-dev/payload-billing'

// Use in your code
const createPayment = async (
  payload: Payload,
  amount: number,
  currency: string
): Promise<Payment> => {
  return await payload.create({
    collection: 'payments',
    data: {
      provider: 'stripe',
      amount,
      currency,
      status: 'pending' as PaymentStatus
    }
  })
}
```

## Security

### Best Practices

1. **Always use webhook secrets in production:**
   ```typescript
   stripeProvider({
     secretKey: process.env.STRIPE_SECRET_KEY!,
     webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!  // Required
   })
   ```

2. **Use HTTPS in production:**
   - Stripe requires HTTPS for webhooks
   - Mollie requires HTTPS for all URLs

3. **Validate amounts:**
   - Amounts are validated automatically (must be positive integers)
   - Currency codes validated against ISO 4217

4. **Use optimistic locking:**
   - Payment updates use version field to prevent conflicts
   - Automatic retry logic for concurrent updates

5. **Secure customer data:**
   - Use customer relationships instead of duplicating data
   - Implement proper access control on collections

6. **Test webhook handling:**
   - Use Stripe CLI or test provider for local testing
   - Verify webhook signatures are checked

### Security Features

- **Webhook Signature Verification** - Stripe webhooks validated with HMAC-SHA256
- **Optimistic Locking** - Version field prevents concurrent update conflicts
- **Transaction Support** - Database transactions ensure atomicity
- **Error Concealment** - Generic error responses prevent information disclosure
- **Input Validation** - Amount, currency, and URL validation
- **Read-Only Provider Data** - Raw provider responses immutable in admin UI

## Troubleshooting

### Webhook Not Receiving Events

**Stripe:**
```bash
# Check webhook endpoint is accessible
curl -X POST https://yourdomain.com/api/payload-billing/stripe/webhook

# Test with Stripe CLI
stripe listen --forward-to localhost:3000/api/payload-billing/stripe/webhook
stripe trigger payment_intent.succeeded

# Check webhook secret is correct
echo $STRIPE_WEBHOOK_SECRET
```

**Mollie:**
```bash
# Verify PAYLOAD_PUBLIC_SERVER_URL is set
echo $PAYLOAD_PUBLIC_SERVER_URL

# Check webhook URL is accessible (must be HTTPS in production)
curl -X POST https://yourdomain.com/api/payload-billing/mollie/webhook \
  -d "id=tr_test123"
```

### Payment Status Not Updating

1. **Check webhook logs** in Stripe/Mollie dashboard
2. **Verify webhook secret** is configured correctly
3. **Check database transactions** are supported
4. **Look for version conflicts** (optimistic locking failures)
5. **Verify payment exists** with matching `providerId`

### Invoice Not Updating After Payment

1. **Check payment-invoice link** exists:
   ```typescript
   const payment = await payload.findByID({
     collection: 'payments',
     id: paymentId,
     depth: 1
   })
   console.log(payment.invoice)  // Should be populated
   ```

2. **Verify payment status** is `succeeded` or `paid`

3. **Check collection hooks** are not disabled

### Mollie "Invalid URL" Error

- Mollie requires HTTPS URLs in production
- Use ngrok or deploy to staging for local testing:
  ```bash
  ngrok http 3000
  # Set PAYLOAD_PUBLIC_SERVER_URL to ngrok URL
  ```

### Test Provider Payment Not Processing

1. **Verify test provider is enabled:**
   ```typescript
   testProvider({ enabled: true })
   ```

2. **Check payment URL** in `providerData.raw.paymentUrl`

3. **Navigate to payment UI** and manually select scenario

4. **Check console logs** for processing status

### Amount Formatting Issues

**Stripe and Test Provider:**
- Use cents/smallest currency unit (integer)
- Example: $50.00 = `5000`

**Mollie:**
- Formatted automatically as decimal string
- Example: $50.00 → `"50.00"`

**Non-decimal currencies** (JPY, KRW, etc.):
- No decimal places
- Example: ¥5000 = `5000`

### TypeScript Errors

```bash
# Ensure types are installed
pnpm add -D @types/node

# Check PayloadCMS version
pnpm list payload  # Should be ^3.37.0 or higher
```

## Development

### Local Development Setup

```bash
# Clone repository
git clone https://github.com/xtr-dev/payload-billing.git
cd payload-billing

# Install dependencies
pnpm install

# Build plugin
pnpm build

# Run development server
pnpm dev
```

### Testing

```bash
# Run tests
pnpm test

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Build for production
pnpm build
```

### Project Structure

```
payload-billing/
├── src/
│   ├── collections/          # Collection definitions
│   │   ├── payments.ts
│   │   ├── invoices.ts
│   │   └── refunds.ts
│   ├── providers/            # Payment providers
│   │   ├── stripe.ts
│   │   ├── mollie.ts
│   │   ├── test.ts
│   │   ├── types.ts
│   │   └── utils.ts
│   ├── plugin/               # Plugin core
│   │   ├── index.ts
│   │   ├── types/
│   │   └── singleton.ts
│   └── index.ts              # Public exports
├── dev/                      # Development/testing app
└── dist/                     # Built files
```

### Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Requirements

- **PayloadCMS**: ^3.37.0
- **Node.js**: ^18.20.2 || >=20.9.0
- **Package Manager**: pnpm ^9 || ^10

## License

MIT

## Links

- [GitHub Repository](https://github.com/xtr-dev/payload-billing)
- [npm Package](https://www.npmjs.com/package/@xtr-dev/payload-billing)
- [PayloadCMS Documentation](https://payloadcms.com/docs)
- [Issue Tracker](https://github.com/xtr-dev/payload-billing/issues)

## Support

- **Issues**: [GitHub Issues](https://github.com/xtr-dev/payload-billing/issues)
- **Discussions**: [GitHub Discussions](https://github.com/xtr-dev/payload-billing/discussions)
- **PayloadCMS Discord**: [Join Discord](https://discord.gg/payload)
