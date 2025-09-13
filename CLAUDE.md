# PayloadCMS Billing Plugin Development Guidelines

## Project Overview

This is a PayloadCMS plugin that provides billing and payment functionality with multiple payment provider integrations (Stripe, Mollie) and a test payment provider for local development.

## Architecture Principles

### Core Design
- **Provider Abstraction**: All payment providers implement a common interface for consistency
- **TypeScript First**: Full TypeScript support with strict typing throughout
- **PayloadCMS Integration**: Deep integration with Payload collections, hooks, and admin UI
- **Extensible**: Easy to add new payment providers through the common interface
- **Developer Experience**: Comprehensive testing tools and local development support

### Payment Provider Interface
All payment providers must implement the `PaymentProvider` interface:
```typescript
interface PaymentProvider {
  createPayment(options: CreatePaymentOptions): Promise<Payment>
  retrievePayment(id: string): Promise<Payment>
  cancelPayment(id: string): Promise<Payment>
  refundPayment(id: string, amount?: number): Promise<Refund>
  handleWebhook(request: Request, signature?: string): Promise<WebhookEvent>
}
```

### Collections Structure
- **Payments**: Core payment tracking with provider-specific data
- **Customers**: Customer management with billing information
- **Invoices**: Invoice generation and management
- **Refunds**: Refund tracking and management

## Code Organization

```
src/
├── providers/           # Payment provider implementations
│   ├── stripe/         # Stripe integration
│   ├── mollie/         # Mollie integration
│   ├── test/           # Test provider for development
│   └── base/           # Base provider interface and utilities
├── collections/        # PayloadCMS collection configurations
├── endpoints/          # API endpoints (webhooks, etc.)
├── hooks/             # PayloadCMS lifecycle hooks
├── admin/             # Admin UI components and extensions
├── types/             # TypeScript type definitions
└── utils/             # Shared utilities and helpers
```

## Development Guidelines

### Payment Provider Development
1. **Implement Base Interface**: All providers must implement `PaymentProvider`
2. **Error Handling**: Use consistent error types and proper error propagation
3. **Webhook Security**: Always verify webhook signatures and implement replay protection
4. **Idempotency**: Support idempotent operations where possible
5. **Logging**: Use structured logging for debugging and monitoring

### Testing Strategy
- **Unit Tests**: Test individual provider methods and utilities
- **Integration Tests**: Test provider integrations with mock APIs
- **E2E Tests**: Test complete payment flows using test provider
- **Webhook Tests**: Test webhook handling with various scenarios

### TypeScript Guidelines
- Use strict TypeScript configuration
- Define proper interfaces for all external API responses
- Use discriminated unions for provider-specific data
- Implement proper generic types for extensibility

### PayloadCMS Integration
- Follow PayloadCMS plugin patterns and conventions
- Use proper collection configurations with access control
- Implement admin UI components using PayloadCMS patterns
- Utilize PayloadCMS hooks for business logic

### Security Considerations
- **Webhook Verification**: Always verify webhook signatures
- **API Key Storage**: Use environment variables for sensitive data
- **Access Control**: Implement proper PayloadCMS access control
- **Input Validation**: Validate all inputs and sanitize data
- **Audit Logging**: Log all payment operations for audit trails

## Environment Configuration

### Required Environment Variables
```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Mollie Configuration  
MOLLIE_API_KEY=test_...
MOLLIE_WEBHOOK_URL=https://yourapp.com/api/billing/webhooks/mollie

# Test Provider Configuration
NODE_ENV=development # Enables test provider
```

### Development Setup
1. Use test provider for local development
2. Configure webhook forwarding tools (ngrok, etc.) for local webhook testing
3. Use provider sandbox/test modes during development
4. Implement comprehensive logging for debugging

## Plugin Configuration

### Basic Configuration
```typescript
billingPlugin({
  providers: {
    // Provider configurations
  },
  collections: {
    // Collection name overrides
  },
  webhooks: {
    // Webhook configuration
  },
  admin: {
    // Admin UI configuration
  }
})
```

### Advanced Configuration
- Custom collection schemas
- Provider-specific options
- Webhook endpoint customization
- Admin UI customization

## Error Handling Strategy

### Provider Errors
- Map provider-specific errors to common error types
- Preserve original error information for debugging
- Implement proper retry logic for transient failures

### Webhook Errors
- Handle duplicate webhooks gracefully
- Implement proper error responses for webhook failures
- Log webhook processing errors with context

## Performance Considerations
- Implement proper caching where appropriate
- Use database indexes for payment queries
- Optimize webhook processing for high throughput
- Consider rate limiting for API endpoints

## Monitoring and Observability
- Log all payment operations with structured data
- Track payment success/failure rates
- Monitor webhook processing times
- Implement health check endpoints

## Documentation Requirements
- Document all public APIs with examples
- Provide integration guides for each payment provider
- Include troubleshooting guides for common issues
- Maintain up-to-date TypeScript documentation