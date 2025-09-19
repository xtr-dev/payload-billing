# Advanced Test Provider Example

The advanced test provider allows you to test complex payment scenarios with an interactive UI for development purposes.

## Basic Configuration

```typescript
import { billingPlugin, testProvider } from '@xtr-dev/payload-billing'

// Configure the test provider
const testProviderConfig = {
  enabled: true, // Enable the test provider
  defaultDelay: 2000, // Default delay in milliseconds
  baseUrl: process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000',
  customUiRoute: '/test-payment', // Custom route for test payment UI
  testModeIndicators: {
    showWarningBanners: true, // Show warning banners in test mode
    showTestBadges: true, // Show test badges
    consoleWarnings: true, // Show console warnings
  }
}

// Add to your payload config
export default buildConfig({
  plugins: [
    billingPlugin({
      providers: [
        testProvider(testProviderConfig)
      ]
    })
  ]
})
```

## Custom Scenarios

You can define custom payment scenarios:

```typescript
const customScenarios = [
  {
    id: 'quick-success',
    name: 'Quick Success',
    description: 'Payment succeeds in 1 second',
    outcome: 'paid' as const,
    delay: 1000,
    method: 'creditcard' as const
  },
  {
    id: 'network-timeout',
    name: 'Network Timeout',
    description: 'Simulates network timeout',
    outcome: 'failed' as const,
    delay: 10000
  },
  {
    id: 'user-abandonment',
    name: 'User Abandonment',
    description: 'User closes payment window',
    outcome: 'cancelled' as const,
    delay: 5000
  }
]

const testProviderConfig = {
  enabled: true,
  scenarios: customScenarios,
  // ... other config
}
```

## Available Payment Outcomes

- `paid` - Payment succeeds
- `failed` - Payment fails
- `cancelled` - Payment is cancelled by user
- `expired` - Payment expires
- `pending` - Payment remains pending

## Available Payment Methods

- `ideal` - iDEAL (Dutch banking)
- `creditcard` - Credit/Debit Cards
- `paypal` - PayPal
- `applepay` - Apple Pay
- `banktransfer` - Bank Transfer

## Using the Test UI

1. Create a payment using the test provider
2. The payment will return a `paymentUrl` in the provider data
3. Navigate to this URL to access the interactive test interface
4. Select a payment method and scenario
5. Click "Process Test Payment" to simulate the payment
6. The payment status will update automatically based on the selected scenario

## React Components

Use the provided React components in your admin interface:

```tsx
import { TestModeWarningBanner, TestModeBadge, TestPaymentControls } from '@xtr-dev/payload-billing/client'

// Show warning banner when in test mode
<TestModeWarningBanner visible={isTestMode} />

// Add test badge to payment status
<div>
  Payment Status: {status}
  <TestModeBadge visible={isTestMode} />
</div>

// Payment testing controls
<TestPaymentControls
  paymentId={paymentId}
  onScenarioSelect={(scenario) => console.log('Selected scenario:', scenario)}
  onMethodSelect={(method) => console.log('Selected method:', method)}
/>
```

## API Endpoints

The test provider automatically registers these endpoints:

- `GET /api/payload-billing/test/payment/:id` - Test payment UI
- `POST /api/payload-billing/test/process` - Process test payment
- `GET /api/payload-billing/test/status/:id` - Get payment status

## Development Tips

1. **Console Warnings**: Keep `consoleWarnings: true` to get notifications about test mode
2. **Visual Indicators**: Use warning banners and badges to clearly mark test payments
3. **Custom Scenarios**: Create scenarios that match your specific use cases
4. **Automated Testing**: Use the test provider in your e2e tests for predictable payment outcomes
5. **Method Testing**: Test different payment methods to ensure your UI handles them correctly

## Production Safety

The test provider includes several safety mechanisms:

- Must be explicitly enabled with `enabled: true`
- Clearly marked with test indicators
- Console warnings when active
- Separate endpoint namespace (`/payload-billing/test/`)
- No real payment processing

**Important**: Never use the test provider in production environments!