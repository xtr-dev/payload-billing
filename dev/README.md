# Billing Plugin Demo Application

This is a demo application showcasing the `@xtr-dev/payload-billing` plugin for PayloadCMS 3.x.

## Features

- 🧪 **Test Payment Provider** with customizable scenarios
- 💳 **Payment Management** with full CRUD operations
- 🧾 **Invoice Generation** with line items and tax calculation
- 👥 **Customer Management** with relationship support
- 🔄 **Refund Processing** and tracking
- 🎨 **Custom Payment UI** with modern design
- 📊 **Sample Data** for quick testing

## Getting Started

### Installation

```bash
# Install dependencies
pnpm install
```

### Running the Demo

```bash
# Start the development server
pnpm dev

# The application will be available at http://localhost:3000
```

### Default Credentials

- **Email**: `dev@payloadcms.com`
- **Password**: `test`

## Demo Routes

### Interactive Demo Page
Visit [http://localhost:3000](http://localhost:3000) to access the interactive demo page where you can:
- Create test payments
- View the custom payment UI
- Test different payment scenarios
- Navigate to admin collections

### Custom Payment UI
The custom test payment UI is available at:
```
http://localhost:3000/test-payment/{payment-id}
```

This page demonstrates:
- Modern, responsive payment interface
- Payment method selection
- Test scenario selection (success, failure, cancellation, etc.)
- Real-time payment status updates
- Test mode indicators and warnings

### Admin Routes

- **Payments**: [http://localhost:3000/admin/collections/payments](http://localhost:3000/admin/collections/payments)
- **Invoices**: [http://localhost:3000/admin/collections/invoices](http://localhost:3000/admin/collections/invoices)
- **Refunds**: [http://localhost:3000/admin/collections/refunds](http://localhost:3000/admin/collections/refunds)
- **Customers**: [http://localhost:3000/admin/collections/customers](http://localhost:3000/admin/collections/customers)

## Sample Data

The application includes seed data with:

- **2 Customers**
  - John Doe (Acme Corporation)
  - Jane Smith (Tech Innovations Inc.)

- **2 Invoices**
  - Paid invoice with web development services
  - Open invoice with subscription and additional users

- **4 Payments**
  - Successful payment linked to invoice
  - Pending payment linked to invoice
  - Standalone successful payment
  - Failed payment example

- **1 Refund**
  - Partial refund on a successful payment

To reset the sample data:
```bash
# Delete the database file
rm dev/payload.sqlite

# Restart the server (will re-seed automatically)
pnpm dev
```

## Configuration

The plugin is configured in `dev/payload.config.ts` with:

### Test Provider Setup
```typescript
testProvider({
  enabled: true,
  testModeIndicators: {
    showWarningBanners: true,
    showTestBadges: true,
    consoleWarnings: true
  },
  customUiRoute: '/test-payment',
})
```

### Customer Relationship
```typescript
customerRelationSlug: 'customers',
customerInfoExtractor: (customer) => ({
  name: customer.name,
  email: customer.email,
  phone: customer.phone,
  company: customer.company,
  taxId: customer.taxId,
  billingAddress: customer.address ? {
    line1: customer.address.line1,
    line2: customer.address.line2,
    city: customer.address.city,
    state: customer.address.state,
    postalCode: customer.address.postalCode,
    country: customer.address.country,
  } : undefined,
})
```

## Test Payment Scenarios

The test provider includes the following scenarios:

1. **Instant Success** - Payment succeeds immediately
2. **Delayed Success** - Payment succeeds after a delay (3s)
3. **Cancelled Payment** - User cancels the payment (1s)
4. **Declined Payment** - Payment is declined by the provider (2s)
5. **Expired Payment** - Payment expires before completion (5s)
6. **Pending Payment** - Payment remains in pending state (1.5s)

## Payment Methods

The test provider supports these payment methods:

- 🏦 iDEAL
- 💳 Credit Card
- 🅿️ PayPal
- 🍎 Apple Pay
- 🏛️ Bank Transfer

## API Examples

### Creating a Payment (Local API)

```typescript
import { getPayload } from 'payload'
import configPromise from '@payload-config'

const payload = await getPayload({ config: configPromise })

const payment = await payload.create({
  collection: 'payments',
  data: {
    provider: 'test',
    amount: 2500, // $25.00 in cents
    currency: 'USD',
    description: 'Demo payment',
    status: 'pending',
  }
})

// The payment will have a providerId that can be used in the custom UI
console.log(`Payment URL: /test-payment/${payment.providerId}`)
```

### Creating an Invoice with Customer

```typescript
const invoice = await payload.create({
  collection: 'invoices',
  data: {
    customer: 'customer-id-here',
    currency: 'USD',
    items: [
      {
        description: 'Service',
        quantity: 1,
        unitAmount: 5000 // $50.00
      }
    ],
    taxAmount: 500, // $5.00
    status: 'open'
  }
})
```

### REST API Example

```bash
# Create a payment
curl -X POST http://localhost:3000/api/payments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "provider": "test",
    "amount": 2500,
    "currency": "USD",
    "description": "Demo payment",
    "status": "pending"
  }'
```

## Custom Routes

The demo includes custom API routes:

### Create Payment
```
POST /api/demo/create-payment
```

Request body:
```json
{
  "amount": 2500,
  "currency": "USD",
  "description": "Demo payment"
}
```

Response:
```json
{
  "success": true,
  "payment": {
    "id": "test_pay_1234567890_abc123",
    "paymentId": "67890",
    "amount": 2500,
    "currency": "USD",
    "description": "Demo payment"
  }
}
```

## Development

### File Structure

```
dev/
├── app/
│   ├── page.tsx                     # Interactive demo page (root)
│   ├── test-payment/
│   │   └── [id]/
│   │       └── page.tsx             # Custom payment UI
│   ├── api/
│   │   └── demo/
│   │       └── create-payment/
│   │           └── route.ts         # Payment creation endpoint
│   └── (payload)/                   # PayloadCMS admin routes
├── helpers/
│   └── credentials.ts               # Default user credentials
├── payload.config.ts                # PayloadCMS configuration
├── seed.ts                          # Sample data seeding
└── README.md                        # This file
```

### Modifying the Demo

To customize the demo:

1. **Add more test scenarios**: Edit the `testProvider` config in `payload.config.ts`
2. **Customize the payment UI**: Edit `app/test-payment/[id]/page.tsx`
3. **Add more sample data**: Edit `seed.ts`
4. **Add custom collections**: Add to `collections` array in `payload.config.ts`

### Testing Different Providers

To test with real payment providers:

```typescript
// Install the provider
pnpm add stripe
// or
pnpm add @mollie/api-client

// Update payload.config.ts
import { stripeProvider, mollieProvider } from '../src/providers'

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
    // Keep test provider for development
    testProvider({ enabled: true }),
  ],
  // ... rest of config
})
```

## Troubleshooting

### Database Issues

If you encounter database errors:
```bash
# Delete the database
rm dev/payload.sqlite

# Regenerate types
pnpm dev:generate-types

# Restart the server
pnpm dev
```

### Port Already in Use

If port 3000 is already in use:
```bash
# Use a different port
PORT=3001 pnpm dev
```

### TypeScript Errors

Regenerate Payload types:
```bash
pnpm dev:generate-types
```

## Resources

- [Plugin Documentation](../README.md)
- [PayloadCMS Documentation](https://payloadcms.com/docs)
- [GitHub Repository](https://github.com/xtr-dev/payload-billing)

## License

MIT
