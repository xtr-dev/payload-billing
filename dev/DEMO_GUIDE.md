# Demo Project Quick Start Guide

This guide will help you quickly get started with the billing plugin demo.

## 🚀 Quick Start

1. **Install dependencies** (if not already done):
   ```bash
   pnpm install
   ```

2. **Start the development server**:
   ```bash
   pnpm dev
   ```

3. **Access the demo**:
   - Open [http://localhost:3000](http://localhost:3000)
   - Login with `dev@payloadcms.com` / `test` if prompted

## 🎯 What's Included

### Custom Test Payment UI
A beautiful, modern payment interface built with React and Tailwind CSS that demonstrates:
- Payment method selection (iDEAL, Credit Card, PayPal, Apple Pay, Bank Transfer)
- Test scenario selection (success, failure, cancellation, etc.)
- Real-time payment status updates
- Test mode indicators and warnings
- Responsive design

**Location**: `/dev/app/test-payment/[id]/page.tsx`

### Interactive Demo Page
A landing page that showcases the plugin features and allows you to:
- Create test payments with one click
- Navigate to custom payment UI
- Access admin collections
- Learn about the plugin features

**Location**: `/dev/app/page.tsx`

### Customer Management
Full customer collection with:
- Name, email, phone, company
- Tax ID support
- Complete address fields
- Auto-sync with invoices via `customerInfoExtractor`

**Location**: Configured in `/dev/payload.config.ts`

### Sample Data
Comprehensive seed data including:
- 2 sample customers
- 2 invoices (1 paid, 1 open)
- 4 payments (various statuses)
- 1 refund

**Location**: `/dev/seed.ts`

### Custom API Routes
Demo API endpoint for creating payments:
- `POST /api/demo/create-payment`

**Location**: `/dev/app/api/demo/create-payment/route.ts`

## 🧪 Testing the Flow

### Complete Payment Flow Test

1. **Go to the demo page**: [http://localhost:3000](http://localhost:3000)

2. **Click "Create Demo Payment"** - This creates a test payment

3. **Click "Go to Payment Page"** - Opens the custom payment UI

4. **Select a payment method** - Choose any method (e.g., Credit Card)

5. **Select a test scenario** - Try different scenarios:
   - **Instant Success**: See immediate payment success
   - **Delayed Success**: See processing indicator, then success
   - **Declined Payment**: See failure handling
   - **Cancelled Payment**: See cancellation flow

6. **Click "Process Test Payment"** - Watch the payment process

7. **View in admin** - After success, you'll be redirected to the payments list

### Testing with Different Scenarios

Each scenario simulates a different payment outcome:

| Scenario | Delay | Outcome | Use Case |
|----------|-------|---------|----------|
| Instant Success | 0ms | Success | Testing happy path |
| Delayed Success | 3s | Success | Testing async processing |
| Cancelled Payment | 1s | Cancelled | Testing user cancellation |
| Declined Payment | 2s | Failed | Testing payment failures |
| Expired Payment | 5s | Cancelled | Testing timeout handling |
| Pending Payment | 1.5s | Pending | Testing long-running payments |

## 📊 Viewing Data

### Admin Collections

After running the demo, explore the seeded data:

1. **Payments** ([http://localhost:3000/admin/collections/payments](http://localhost:3000/admin/collections/payments))
   - View all payment transactions
   - See payment statuses and provider data
   - Check linked invoices

2. **Invoices** ([http://localhost:3000/admin/collections/invoices](http://localhost:3000/admin/collections/invoices))
   - View generated invoices
   - See line items and totals
   - Check customer relationships

3. **Refunds** ([http://localhost:3000/admin/collections/refunds](http://localhost:3000/admin/collections/refunds))
   - View processed refunds
   - See refund amounts and reasons

4. **Customers** ([http://localhost:3000/admin/collections/customers](http://localhost:3000/admin/collections/customers))
   - View customer information
   - Edit customer details (invoices will auto-update!)

## 🔧 Configuration Highlights

### Plugin Configuration
```typescript
billingPlugin({
  providers: [
    testProvider({
      enabled: true,
      customUiRoute: '/test-payment', // Custom UI route
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
  },
  customerRelationSlug: 'customers',
  customerInfoExtractor: (customer) => ({
    // Auto-extract customer info for invoices
    name: customer.name,
    email: customer.email,
    // ... more fields
  }),
})
```

## 🎨 Customization Ideas

### 1. Modify the Payment UI
Edit `/dev/app/test-payment/[id]/page.tsx` to:
- Change colors and styling
- Add your brand logo
- Modify the layout
- Add additional fields

### 2. Add More Test Scenarios
Edit `testProvider` config to add custom scenarios:
```typescript
testProvider({
  scenarios: [
    {
      id: 'custom-scenario',
      name: 'Custom Scenario',
      description: 'Your custom test scenario',
      outcome: 'paid',
      delay: 2000
    }
  ]
})
```

### 3. Create Invoice Templates
Add invoice generation endpoints that use specific templates

### 4. Add Webhooks
Create webhook handlers to process real payment events

## 💡 Tips

- **Reset Data**: Delete `dev/payload.sqlite` and restart to re-seed
- **Check Console**: Test provider logs all events to the console
- **Test Mode Warnings**: Notice the warning banners and badges in test mode
- **Auto-sync**: Edit a customer's info and see invoices update automatically

## 🐛 Troubleshooting

### Payment not processing?
- Check browser console for errors
- Check server console for logs
- Verify the test provider is enabled in config

### Custom UI not loading?
- Check that `customUiRoute` matches your page route
- Verify the payment ID is valid (starts with `test_pay_`)

### Types not matching?
Run `pnpm dev:generate-types` to regenerate Payload types

## 📚 Next Steps

1. **Explore the Admin** - Login and browse the collections
2. **Create Custom Invoices** - Try creating invoices with line items
3. **Process Refunds** - Create refunds for successful payments
4. **Add Real Providers** - Configure Stripe or Mollie (see README.md)
5. **Build Your Integration** - Use this as a template for your app

## 🎓 Learning Resources

- Review `/dev/seed.ts` for data structure examples
- Check `/dev/payload.config.ts` for plugin configuration
- See `/dev/app/test-payment/[id]/page.tsx` for UI integration
- Read the main [README.md](../README.md) for API documentation

Happy testing! 🚀
