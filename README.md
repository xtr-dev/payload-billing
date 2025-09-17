# @xtr-dev/payload-billing

A billing and payment provider plugin for PayloadCMS 3.x. Supports Stripe, Mollie, and local testing with comprehensive tracking.

⚠️ **Pre-release Warning**: This package is currently in active development (v0.0.x). Breaking changes may occur before v1.0.0. Not recommended for production use.

## Features

- 💳 Multiple payment providers (Stripe, Mollie, Test)
- 🧾 Invoice generation and management
- 📊 Complete payment tracking and history
- 🪝 Secure webhook processing for all providers
- 🧪 Built-in test provider for local development
- 📱 Payment management in PayloadCMS admin
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

## Imports

```typescript
// Main plugin
import { billingPlugin } from '@xtr-dev/payload-billing'

// Payment providers
import { stripeProvider, mollieProvider } from '@xtr-dev/payload-billing'

// Types
import type { PaymentProvider, Payment, Invoice, Refund } from '@xtr-dev/payload-billing'
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
- **invoices** - Invoice generation with line items and PDF support
- **refunds** - Refund tracking and management

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
