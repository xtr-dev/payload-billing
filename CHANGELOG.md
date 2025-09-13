# @xtr-dev/payload-billing

## 0.1.0 (Initial Release)

### Features

- **Payment Providers**: Initial support for Stripe, Mollie, and Test providers
- **PayloadCMS Integration**: Pre-configured collections for payments, customers, invoices, and refunds
- **Test Provider**: Full-featured test payment provider for local development
- **TypeScript Support**: Complete TypeScript definitions and type safety
- **Webhook Handling**: Robust webhook processing for all supported providers
- **Currency Support**: Multi-currency support with validation and formatting utilities
- **Logging**: Structured logging system for debugging and monitoring
- **Validation**: Comprehensive data validation using Zod schemas

### Collections

- **Payments**: Track payment status, amounts, and provider-specific data
- **Customers**: Customer management with billing information and relationships
- **Invoices**: Invoice generation with line items and status tracking
- **Refunds**: Refund tracking with relationship to original payments

### Provider Features

#### Test Provider
- Configurable auto-completion of payments
- Failure simulation for testing error scenarios
- Delay simulation for testing async operations
- In-memory storage for development
- Full webhook event simulation

#### Extensible Architecture
- Common provider interface for easy extension
- Provider registry system
- Standardized error handling
- Consistent logging across providers

### Developer Experience

- **Testing**: Comprehensive test suite with Jest
- **Build System**: Modern build setup with tsup
- **Linting**: ESLint configuration with TypeScript support
- **Documentation**: Complete API documentation and usage examples
- **Development**: Hot reloading and watch mode support