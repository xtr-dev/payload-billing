# PayloadCMS Billing Plugin Development Guidelines

## Project Overview

This is a PayloadCMS plugin that provides billing and payment functionality with flexible customer data management and invoice generation capabilities.

## Architecture Principles

### Core Design
- **TypeScript First**: Full TypeScript support with strict typing throughout
- **PayloadCMS Integration**: Deep integration with Payload collections, hooks, and admin UI
- **Flexible Customer Data**: Support for both relationship-based and embedded customer information
- **Callback-based Syncing**: Use customer info extractors to keep data in sync

### Collections Structure
- **Payments**: Core payment tracking with provider-specific data
- **Customers**: Customer management with billing information (optional)
- **Invoices**: Invoice generation with embedded customer info and optional customer relationship
- **Refunds**: Refund tracking and management

## Code Organization

```
src/
├── collections/        # PayloadCMS collection configurations
├── types/             # TypeScript type definitions
└── index.ts           # Main plugin entry point
```

## Customer Data Management

### Customer Info Extractor Pattern

The plugin uses a callback-based approach to extract customer information from customer relationships:

```typescript
// Define how to extract customer info from your customer collection
const customerInfoExtractor: CustomerInfoExtractor = (customer) => ({
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
```

### Invoice Customer Data Options

1. **With Customer Relationship + Extractor**:
   - Customer relationship required
   - Customer info auto-populated and read-only
   - Syncs automatically when customer changes

2. **With Customer Relationship (no extractor)**:
   - Customer relationship optional
   - Customer info manually editable
   - Either relationship OR customer info required

3. **No Customer Collection**:
   - Customer info fields always required and editable
   - No relationship field available

## Plugin Configuration

### Basic Configuration
```typescript
import { billingPlugin, defaultCustomerInfoExtractor } from '@xtr-dev/payload-billing'

billingPlugin({
  collections: {
    customers: 'customers',        // Customer collection slug
    invoices: 'invoices',         // Invoice collection slug
    payments: 'payments',         // Payment collection slug
    refunds: 'refunds',          // Refund collection slug
    customerRelation: false,      // Disable customer relationship
    // OR
    customerRelation: 'clients',  // Use custom collection slug
  },
  customerInfoExtractor: defaultCustomerInfoExtractor, // For built-in customer collection
})
```

### Custom Customer Info Extractor
```typescript
billingPlugin({
  customerInfoExtractor: (customer) => ({
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
})
```

## Development Guidelines

### TypeScript Guidelines
- Use strict TypeScript configuration
- All customer info extractors must implement `CustomerInfoExtractor` interface
- Ensure consistent camelCase naming for all address fields

### PayloadCMS Integration
- Follow PayloadCMS plugin patterns and conventions
- Use proper collection configurations with access control
- Utilize PayloadCMS hooks for data syncing and validation

### Field Validation Rules
- When using `customerInfoExtractor`: customer relationship is required, customer info auto-populated
- When not using extractor: either customer relationship OR customer info must be provided
- When no customer collection: customer info is always required

## Collections API

### Invoice Collection Features
- Automatic invoice number generation (INV-{timestamp})
- Currency validation (3-letter ISO codes)
- Automatic due date setting (30 days from creation)
- Line item total calculations
- Customer info syncing via hooks

### Customer Data Syncing
The `beforeChange` hook automatically:
1. Detects when customer relationship changes
2. Fetches customer data from the related collection
3. Extracts customer info using the provided callback
4. Updates invoice with extracted data
5. Maintains data consistency across updates

## Error Handling

### Validation Errors
- Customer relationship required when using extractor
- Customer info required when not using relationship
- Proper error messages for missing required fields

### Data Extraction Errors
- Failed customer fetches are logged and throw user-friendly errors
- Invalid customer data is handled gracefully

## Performance Considerations
- Customer data is only fetched when relationship changes
- Read-only fields prevent unnecessary manual edits
- Efficient hook execution with proper change detection

## Documentation Requirements
- Document all public APIs with examples
- Provide clear customer info extractor examples
- Include configuration guides for different use cases
- Maintain up-to-date TypeScript documentation