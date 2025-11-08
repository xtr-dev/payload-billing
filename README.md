# @xtr-dev/payload-billing

[![npm version](https://badge.fury.io/js/@xtr-dev%2Fpayload-billing.svg)](https://badge.fury.io/js/@xtr-dev%2Fpayload-billing)

A billing and payment provider plugin for PayloadCMS 3.x. Supports Stripe, Mollie, and local testing with comprehensive tracking and flexible customer data management.

⚠️ **Pre-release Warning**: This package is currently in active development (v0.1.x). Breaking changes may occur before v1.0.0. Not recommended for production use.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Imports](#imports)
- [Usage Examples](#usage-examples)
  - [Creating a Payment](#creating-a-payment)
  - [Creating an Invoice](#creating-an-invoice)
  - [Creating a Refund](#creating-a-refund)
  - [Querying Payments](#querying-payments)
  - [Using REST API](#using-rest-api)
- [Provider Types](#provider-types)
- [Collections](#collections)
- [Webhook Endpoints](#webhook-endpoints)
- [Development](#development)

## Features

- 💳 Multiple payment providers (Stripe, Mollie, Test)
- 🧾 Invoice generation and management with embedded customer info
- 👥 Flexible customer data management with relationship support
- 📊 Complete payment tracking and history
- 🪝 Secure webhook processing for all providers
- 🔄 Automatic payment/invoice status synchronization
- 🧪 Built-in test provider for local development
- 📱 Payment management in PayloadCMS admin
- 🔗 Bidirectional payment-invoice relationship management
- 🎨 Collection extension support for custom fields and hooks
- 🔒 Full TypeScript support

## Installation

```bash
npm install @xtr-dev/payload-billing
# or
pnpm add @xtr-dev/payload-billing
# or
yarn add @xtr-dev/payload-billing
```

### Provider Dependencies

Payment providers are peer dependencies and must be installed separately based on which providers you plan to use:

```bash
# For Stripe support
npm install stripe
# or
pnpm add stripe

# For Mollie support
npm install @mollie/api-client
# or
pnpm add @mollie/api-client
```

## Quick Start

### Basic Configuration

```typescript
import { buildConfig } from 'payload'
import { billingPlugin, stripeProvider, mollieProvider } from '@xtr-dev/payload-billing'

export default buildConfig({
  // ... your config
  plugins: [
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
      ],
      collections: {
        payments: 'payments',
        invoices: 'invoices',
        refunds: 'refunds',
      }
    })
  ]
})
```

### With Customer Management

```typescript
import { billingPlugin, CustomerInfoExtractor } from '@xtr-dev/payload-billing'

// Define how to extract customer info from your customer collection
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
  // ... providers
  collections: {
    payments: 'payments',
    invoices: 'invoices',
    refunds: 'refunds',
  },
  customerRelationSlug: 'customers', // Enable customer relationships
  customerInfoExtractor: customerExtractor, // Auto-sync customer data
})
```

### Custom Customer Data Extraction

```typescript
import { CustomerInfoExtractor } from '@xtr-dev/payload-billing'

const customExtractor: CustomerInfoExtractor = (customer) => ({
  name: customer.fullName,
  email: customer.contactEmail,
  phone: customer.phoneNumber,
  company: customer.companyName,
  taxId: customer.vatNumber,
  billingAddress: {
    line1: customer.billing.street,
    line2: customer.billing.apartment,
    city: customer.billing.city,
    state: customer.billing.state,
    postalCode: customer.billing.zip,
    country: customer.billing.countryCode,
  }
})

billingPlugin({
  // ... other config
  customerRelationSlug: 'clients',
  customerInfoExtractor: customExtractor,
})
```

## Imports

```typescript
// Main plugin
import { billingPlugin } from '@xtr-dev/payload-billing'

// Payment providers
import { stripeProvider, mollieProvider } from '@xtr-dev/payload-billing'

// Types
import type { 
  PaymentProvider, 
  Payment, 
  Invoice, 
  Refund,
  BillingPluginConfig,
  CustomerInfoExtractor,
  MollieProviderConfig,
  StripeProviderConfig,
  ProviderData
} from '@xtr-dev/payload-billing'
```

## Provider Types

### Stripe
Credit card payments, subscriptions, webhook processing, automatic payment method storage.

### Mollie
European payment methods (iDEAL, SEPA, etc.), multi-currency support, refund processing.

### Test Provider
Local development testing with configurable scenarios, automatic completion, debug mode.

## Collections

The plugin adds these collections:

- **payments** - Payment transactions with status and provider data
- **invoices** - Invoice generation with line items and embedded customer info
- **refunds** - Refund tracking and management

### Automatic Status Synchronization

The plugin automatically keeps payments and invoices in sync:

- **Payment → Invoice**: When a payment status changes to `paid` or `succeeded`, any linked invoice is automatically updated to `paid` status
- **Invoice → Payment**: When an invoice is created with a payment link, the payment is automatically linked back (bidirectional relationship)
- **Manual Invoice Payment**: When an invoice status is manually changed to `paid`, the linked payment is updated to `succeeded`

This ensures data consistency without manual intervention and works seamlessly with webhook updates from payment providers.

### Customer Data Management

The plugin supports flexible customer data handling:

1. **With Customer Relationship + Extractor**: Customer relationship required, customer info auto-populated and read-only, syncs automatically when customer changes

2. **With Customer Relationship (no extractor)**: Customer relationship optional, customer info manually editable, either relationship OR customer info required

3. **No Customer Collection**: Customer info fields always required and editable, no relationship field available

## Usage Examples

### Creating a Payment

Payments are created through PayloadCMS's local API or REST API. The plugin automatically initializes the payment with the configured provider.

```typescript
// Using Payload Local API
const payment = await payload.create({
  collection: 'payments',
  data: {
    provider: 'stripe', // or 'mollie' or 'test'
    amount: 2000, // Amount in cents ($20.00)
    currency: 'USD',
    description: 'Product purchase',
    status: 'pending',
    metadata: {
      orderId: 'order-123',
      customerId: 'cust-456'
    }
  }
})
```

### Creating an Invoice

Invoices can be created with customer information embedded or linked via relationship:

```typescript
// Create invoice with embedded customer info
const invoice = await payload.create({
  collection: 'invoices',
  data: {
    customerInfo: {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+1234567890',
      company: 'Acme Corp',
      taxId: 'TAX-123'
    },
    billingAddress: {
      line1: '123 Main St',
      line2: 'Suite 100',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      country: 'US'
    },
    currency: 'USD',
    items: [
      {
        description: 'Web Development Services',
        quantity: 10,
        unitAmount: 5000 // $50.00 per hour
      },
      {
        description: 'Hosting (Monthly)',
        quantity: 1,
        unitAmount: 2500 // $25.00
      }
    ],
    taxAmount: 7500, // $75.00 tax
    status: 'open'
  }
})

console.log(`Invoice created: ${invoice.number}`)
console.log(`Total amount: $${invoice.amount / 100}`)
```

### Creating an Invoice with Customer Relationship

If you've configured a customer collection with `customerRelationSlug` and `customerInfoExtractor`:

```typescript
// Create invoice linked to customer (info auto-populated)
const invoice = await payload.create({
  collection: 'invoices',
  data: {
    customer: 'customer-id-123', // Customer relationship
    currency: 'USD',
    items: [
      {
        description: 'Subscription - Pro Plan',
        quantity: 1,
        unitAmount: 9900 // $99.00
      }
    ],
    status: 'open'
    // customerInfo and billingAddress are auto-populated from customer
  }
})
```

### Creating a Refund

Refunds are linked to existing payments:

```typescript
const refund = await payload.create({
  collection: 'refunds',
  data: {
    payment: payment.id, // Link to payment
    providerId: 'refund-provider-id', // Provider's refund ID
    amount: 1000, // Partial refund: $10.00
    currency: 'USD',
    status: 'succeeded',
    reason: 'requested_by_customer',
    description: 'Customer requested partial refund'
  }
})
```

### Querying Payments

```typescript
// Find all successful payments
const payments = await payload.find({
  collection: 'payments',
  where: {
    status: {
      equals: 'succeeded'
    }
  }
})

// Find payments for a specific invoice
const invoicePayments = await payload.find({
  collection: 'payments',
  where: {
    invoice: {
      equals: invoiceId
    }
  }
})
```

### Updating Payment Status

Payment status is typically updated via webhooks, but you can also update manually:

```typescript
const updatedPayment = await payload.update({
  collection: 'payments',
  id: payment.id,
  data: {
    status: 'succeeded',
    providerData: {
      // Provider-specific data
      raw: providerResponse,
      timestamp: new Date().toISOString(),
      provider: 'stripe'
    }
  }
})
```

### Marking an Invoice as Paid

```typescript
const paidInvoice = await payload.update({
  collection: 'invoices',
  id: invoice.id,
  data: {
    status: 'paid',
    payment: payment.id // Link to payment
    // paidAt is automatically set by the plugin
  }
})
```

### Using the Test Provider

The test provider is useful for local development:

```typescript
// In your payload.config.ts
import { billingPlugin, testProvider } from '@xtr-dev/payload-billing'

billingPlugin({
  providers: [
    testProvider({
      enabled: true,
      testModeIndicators: {
        showWarningBanners: true,
        showTestBadges: true,
        consoleWarnings: true
      }
    })
  ],
  collections: {
    payments: 'payments',
    invoices: 'invoices',
    refunds: 'refunds',
  }
})
```

Then create test payments:

```typescript
const testPayment = await payload.create({
  collection: 'payments',
  data: {
    provider: 'test',
    amount: 5000,
    currency: 'USD',
    description: 'Test payment',
    status: 'pending'
  }
})
// Test provider automatically processes the payment
```

### Using REST API

All collections can be accessed via PayloadCMS REST API:

```bash
# Create a payment
curl -X POST http://localhost:3000/api/payments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "provider": "stripe",
    "amount": 2000,
    "currency": "USD",
    "description": "Product purchase",
    "status": "pending"
  }'

# Create an invoice
curl -X POST http://localhost:3000/api/invoices \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "customerInfo": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "billingAddress": {
      "line1": "123 Main St",
      "city": "New York",
      "postalCode": "10001",
      "country": "US"
    },
    "currency": "USD",
    "items": [
      {
        "description": "Service",
        "quantity": 1,
        "unitAmount": 5000
      }
    ],
    "status": "open"
  }'

# Get all payments
curl http://localhost:3000/api/payments \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get a specific invoice
curl http://localhost:3000/api/invoices/INVOICE_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Webhook Endpoints

Automatic webhook endpoints are created for configured providers:
- `/api/payload-billing/stripe/webhook` - Stripe payment notifications
- `/api/payload-billing/mollie/webhook` - Mollie payment notifications

## Requirements

- PayloadCMS ^3.37.0
- Node.js ^18.20.2 || >=20.9.0
- pnpm ^9 || ^10

## Development

```bash
# Install dependencies
pnpm install

# Build plugin
pnpm build

# Run tests
pnpm test

# Development server
pnpm dev
```

## License

MIT
