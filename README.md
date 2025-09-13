# 💳 @xtr-dev/payload-billing

PayloadCMS plugin for billing and payment provider integrations with comprehensive tracking and local testing support.

⚠️ **Pre-release Warning**: This package is currently in active development (v0.0.x). Breaking changes may occur before v1.0.0. Not recommended for production use.

## 🚀 Features

### Payment Providers
- **🔶 Stripe Integration** - Full Stripe payment processing support
- **🟠 Mollie Integration** - Complete Mollie payment gateway integration  
- **🧪 Test Provider** - Local development and testing payment provider
- **🔧 Extensible Architecture** - Easy to add new payment providers

### Payment Tracking & Management
- **📊 Transaction History** - Complete payment tracking and history
- **🔄 Payment Status Management** - Real-time payment status updates
- **💰 Amount & Currency Handling** - Multi-currency support
- **📋 Invoice Generation** - Automatic invoice creation and management
- **🏷️ Metadata Support** - Custom metadata for payments and customers

### Developer Experience
- **🛠️ Local Development** - Test provider for local development
- **🪝 Webhook Handling** - Robust webhook processing for all providers
- **📝 TypeScript Support** - Full TypeScript definitions and type safety
- **🔍 Debugging Tools** - Built-in logging and debugging capabilities
- **📚 Documentation** - Comprehensive API documentation

### PayloadCMS Integration
- **⚡ Admin UI Extensions** - Payment management directly in Payload admin
- **🗃️ Collections** - Pre-configured payment, customer, and invoice collections
- **🔐 Access Control** - Secure payment data with proper permissions
- **🎯 Hooks & Events** - PayloadCMS lifecycle hooks for payment events

## 🏗️ Installation

```bash
npm install @xtr-dev/payload-billing
# or
yarn add @xtr-dev/payload-billing
# or  
pnpm add @xtr-dev/payload-billing
```

## ⚙️ Quick Setup

```typescript
import { billingPlugin } from '@xtr-dev/payload-billing'

export default buildConfig({
  plugins: [
    billingPlugin({
      providers: {
        stripe: {
          secretKey: process.env.STRIPE_SECRET_KEY!,
          publishableKey: process.env.STRIPE_PUBLISHABLE_KEY!,
          webhookEndpointSecret: process.env.STRIPE_WEBHOOK_SECRET!,
        },
        mollie: {
          apiKey: process.env.MOLLIE_API_KEY!,
          webhookUrl: process.env.MOLLIE_WEBHOOK_URL!,
        },
        // Test provider for local development
        test: {
          enabled: process.env.NODE_ENV === 'development',
          autoComplete: true, // Automatically complete payments
        }
      },
      collections: {
        payments: 'payments',
        customers: 'customers', 
        invoices: 'invoices',
      }
    })
  ]
})
```

## 📋 Collections Added

### Payments Collection
- Payment tracking with status, amount, currency
- Provider-specific payment data
- Customer relationships
- Transaction metadata

### Customers Collection  
- Customer information and billing details
- Payment method storage
- Transaction history
- Subscription management

### Invoices Collection
- Invoice generation and management
- PDF generation support
- Payment status tracking
- Line item details

## 🔌 Provider APIs

### Stripe Integration
```typescript
import { getPaymentProvider } from '@xtr-dev/payload-billing'

const stripe = getPaymentProvider('stripe')

// Create a payment
const payment = await stripe.createPayment({
  amount: 2000, // $20.00
  currency: 'usd',
  customer: 'customer_id',
  metadata: { orderId: '12345' }
})

// Handle webhooks
await stripe.handleWebhook(request, signature)
```

### Mollie Integration
```typescript
const mollie = getPaymentProvider('mollie')

// Create a payment
const payment = await mollie.createPayment({
  amount: { value: '20.00', currency: 'EUR' },
  description: 'Order #12345',
  redirectUrl: 'https://example.com/return',
  webhookUrl: 'https://example.com/webhook'
})
```

### Test Provider
```typescript
const testProvider = getPaymentProvider('test')

// Simulate payment scenarios
const payment = await testProvider.createPayment({
  amount: 2000,
  currency: 'usd',
  // Test-specific options
  simulateFailure: false,
  delayMs: 1000
})
```

## 🪝 Webhook Handling

The plugin automatically sets up webhook endpoints for all configured providers:

- `/api/billing/webhooks/stripe` - Stripe webhook endpoint
- `/api/billing/webhooks/mollie` - Mollie webhook endpoint  
- `/api/billing/webhooks/test` - Test provider webhook endpoint

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/xtr-dev/payload-billing.git
cd payload-billing

# Install dependencies
pnpm install

# Build the plugin
pnpm build

# Run tests
pnpm test

# Start development server
pnpm dev
```

## 📚 Documentation

- [API Reference](./docs/api.md)
- [Provider Integration Guide](./docs/providers.md)
- [Webhook Setup](./docs/webhooks.md)
- [Testing Guide](./docs/testing.md)
- [TypeScript Types](./docs/types.md)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- [PayloadCMS](https://payloadcms.com)
- [Stripe Documentation](https://stripe.com/docs)
- [Mollie Documentation](https://docs.mollie.com)
- [GitHub Repository](https://github.com/xtr-dev/payload-billing)
