# @xtr-dev/payload-billing

A billing and payment provider plugin for PayloadCMS 3.x. Supports Stripe, Mollie, and local testing with comprehensive tracking and flexible customer data management.

⚠️ **Pre-release Warning**: This package is currently in active development (v0.1.x). Breaking changes may occur before v1.0.0. Not recommended for production use.

## Features

- 💳 Multiple payment providers (Stripe, Mollie, Test)
- 🧾 Invoice generation and management with embedded customer info
- 👥 Flexible customer data management with relationship support
- 📊 Complete payment tracking and history
- 🪝 Secure webhook processing for all providers
- 🧪 Built-in test provider for local development
- 📱 Payment management in PayloadCMS admin
- 🔄 Callback-based customer data syncing
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
import { billingPlugin, defaultCustomerInfoExtractor } from '@xtr-dev/payload-billing'

billingPlugin({
  // ... providers
  collections: {
    payments: 'payments',
    invoices: 'invoices',
    refunds: 'refunds',
  },
  customerRelationSlug: 'customers', // Enable customer relationships
  customerInfoExtractor: defaultCustomerInfoExtractor, // Auto-sync customer data
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

### Customer Data Management

The plugin supports flexible customer data handling:

1. **With Customer Relationship + Extractor**: Customer relationship required, customer info auto-populated and read-only, syncs automatically when customer changes

2. **With Customer Relationship (no extractor)**: Customer relationship optional, customer info manually editable, either relationship OR customer info required

3. **No Customer Collection**: Customer info fields always required and editable, no relationship field available

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
