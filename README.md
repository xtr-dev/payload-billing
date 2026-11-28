# @xtr-dev/payload-billing

[![npm version](https://badge.fury.io/js/@xtr-dev%2Fpayload-billing.svg)](https://badge.fury.io/js/@xtr-dev%2Fpayload-billing)

Payments, invoices and refunds for PayloadCMS 3.x, with Stripe, Mollie and a local test provider.
Provider webhooks keep payment, invoice and refund statuses in sync.

**v0.x** — minor versions may contain breaking changes until 1.0.

## Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Payment Providers](#payment-providers): [Stripe](#stripe), [Mollie](#mollie), [Test Provider](#test-provider), [Server URL](#server-url)
- [Configuration](#configuration): [Customers](#customer-management), [Collections](#collection-slugs-and-extensions), [Access Control](#access-control)
- [Collections](#collections): [Payments](#payments), [Invoices](#invoices), [Refunds](#refunds)
- [Refunds](#issuing-a-refund)
- [Webhooks](#webhooks)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Installation

```bash
pnpm add @xtr-dev/payload-billing

# Provider SDKs are optional peer dependencies; install the ones you use
pnpm add stripe              # ^18.5.0 – ^22
pnpm add @mollie/api-client  # ^3.7.0 || ^4
```

The test provider needs no extra packages.

## Quick Start

```typescript
import { buildConfig } from 'payload'
import { billingPlugin, testProvider } from '@xtr-dev/payload-billing'
import { stripeProvider } from '@xtr-dev/payload-billing/stripe'
import { mollieProvider } from '@xtr-dev/payload-billing/mollie'

export default buildConfig({
  // ...
  plugins: [
    billingPlugin({
      providers: [
        stripeProvider({
          secretKey: process.env.STRIPE_SECRET_KEY!,
          webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
        }),
        mollieProvider({ apiKey: process.env.MOLLIE_API_KEY! }),
        testProvider({ enabled: process.env.NODE_ENV === 'development' }),
      ],
    }),
  ],
})
```

This adds `payments`, `invoices` and `refunds` collections. Creating a payment calls the provider:

```typescript
const payment = await payload.create({
  collection: 'payments',
  data: {
    provider: 'mollie',   // 'stripe' | 'mollie' | 'test'
    amount: 5000,         // in cents: €50.00
    currency: 'EUR',
    description: 'Order #123',
    redirectUrl: 'https://example.com/thank-you?t={returnToken}',
  },
})
```

- **Stripe**: `providerId` is the PaymentIntent id. Confirm it on the frontend with Stripe.js
  using `payment.providerData.raw.client_secret`, and pass `payment.redirectUrl` as
  `confirmParams.return_url`. The plugin stores the resolved return URL there (the provider's
  `returnUrl` when the payment has none, `{returnToken}` filled in); Stripe only accepts it at
  confirm time, not when the PaymentIntent is created.
- **Mollie** and **test**: redirect the customer to `payment.checkoutUrl`.

## Payment Providers

### Stripe

```typescript
import { stripeProvider } from '@xtr-dev/payload-billing/stripe'

stripeProvider({
  secretKey: string        // sk_test_... or sk_live_...
  webhookSecret?: string   // whsec_...; the webhook endpoint is only registered when set
  apiVersion?: string      // default '2025-08-27.basil'
  returnUrl?: string       // stored as the payment's redirectUrl when it has none
})
```

Stripe refunds are not issued by the plugin yet: [record them](#recording-a-refund) with a `providerId`.

### Mollie

```typescript
import { mollieProvider } from '@xtr-dev/payload-billing/mollie'

mollieProvider({
  apiKey: string           // test_... or live_...
  webhookUrl?: string      // default: <server URL>/api/payload-billing/mollie/webhook
  redirectUrl?: string     // used when the payment has no redirectUrl
})
```

- Without `webhookUrl` the plugin builds it from the [server URL](#server-url). Outside production
  it falls back to `https://localhost:3000`. In production it throws when no valid HTTPS URL can be
  determined (Mollie rejects `http://` and localhost URLs).
- Amounts are sent to Mollie as decimal strings (`5000` → `"50.00"`, `5000` JPY → `"5000"`).

### Test Provider

A local provider with a checkout page where you pick a payment method and an outcome. Sessions are
kept in memory, so open test payments are lost on restart.

```typescript
import { testProvider } from '@xtr-dev/payload-billing'

testProvider({
  enabled: boolean            // required; must be true to register the provider
  scenarios?: PaymentScenario[]
  defaultDelay?: number       // ms, default 1000
  baseUrl?: string            // default: the server URL, then http://localhost:3000
  customUiRoute?: string      // serve the checkout from your own page: <baseUrl><route>/<id>
  returnUrl?: string          // path on baseUrl used when the payment has no redirectUrl (default /payment/success)
  testModeIndicators?: {      // all default true
    showWarningBanners?: boolean
    showTestBadges?: boolean
    consoleWarnings?: boolean
  }
})
```

Default scenarios (`outcome` is the scenario outcome, not `Payment.status`):

| Scenario | `id` | Outcome | Delay |
|----------|------|---------|-------|
| Instant Success | `instant-success` | `paid` | 0ms |
| Delayed Success | `delayed-success` | `paid` | 3000ms |
| Cancelled Payment | `cancelled-payment` | `cancelled` | 1000ms |
| Declined Payment | `declined-payment` | `failed` | 2000ms |
| Expired Payment | `expired-payment` | `expired` | 5000ms |
| Pending Payment | `pending-payment` | `pending` | 1500ms |

Passing `scenarios` replaces this list. Each scenario is
`{ id, name, description, outcome, delay?, method? }`, where `method` is one of `ideal`, `creditcard`,
`paypal`, `applepay` or `banktransfer`. A scenario's `delay` (including `0`) takes precedence over
`defaultDelay`. Once a scenario settles as `paid`, `failed`, `cancelled` or `expired`, the checkout
page sends the customer to the payment's redirect URL, as Mollie and Stripe do, so your return page
also handles declined payments.

Endpoints (under `/api`): `GET /payload-billing/test/payment/:id` (checkout page),
`GET /payload-billing/test/config`, `POST /payload-billing/test/process`,
`GET /payload-billing/test/status/:id` and `POST /payload-billing/test/refund` (see
[refunds](#refunds-from-the-admin-panel)).

### Server URL

When a provider config has no `webhookUrl` (Mollie) or `baseUrl` (test provider), the plugin builds
those URLs from the environment, checking in order:

1. `PAYLOAD_SERVER_URL`
2. `PAYLOAD_PUBLIC_SERVER_URL`
3. `SERVER_URL`
4. `NEXT_PUBLIC_SERVER_URL`

`NEXT_PUBLIC_SERVER_URL` is checked last, and the plugin logs a warning when it uses it. Next.js
replaces every `process.env.NEXT_PUBLIC_*` with its value at `next build`, so an image built once
and deployed under another URL would send Mollie webhooks and test-checkout redirects to the URL it
was built with. Set one of the runtime variables, or pass the URL in the config:

```typescript
mollieProvider({
  apiKey: process.env.MOLLIE_API_KEY!,
  webhookUrl: `${process.env.PAYLOAD_SERVER_URL}/api/payload-billing/mollie/webhook`,
})

testProvider({ enabled: true, baseUrl: process.env.PAYLOAD_SERVER_URL })
```

## Configuration

```typescript
billingPlugin({
  providers?: PaymentProvider[]
  collections?: { payments?, invoices?, refunds? }   // slug string or { slug?, access?, extend? }
  customerRelationSlug?: string
  customerInfoExtractor?: CustomerInfoExtractor
  hooks?: { onRefundStatusChange?, onRefundSucceeded?, onRefundFailed? }
  refundJobs?: boolean | { queue?: string; sweepSchedule?: string | false }
  disabled?: boolean
})
```

`disabled: true` keeps the collection schemas registered, so stored billing data is preserved, but
denies all access to them, hides their admin views and skips their hooks, endpoints and provider
wiring.

### Customer Management

Invoices store a customer snapshot (`customerInfo` and `billingAddress`). There are three ways to fill it.

**1. Customer relationship with an extractor.** The extractor fills the snapshot whenever an
invoice is created with a `customer` or its `customer` changes, replacing any `customerInfo` and
`billingAddress` passed alongside it. Later edits to the customer record are not copied to existing
invoices.

An invoice for a guest leaves `customer` empty and passes the name and email in `customerInfo`
itself (other snapshot fields are optional); the extractor is not called. An invoice with neither a
`customer` nor a name and email is refused. The snapshot fields are read-only in the admin panel,
so guest invoices are created through the Local API or REST.

```typescript
import type { CustomerInfoExtractor } from '@xtr-dev/payload-billing'

const customerInfoExtractor: CustomerInfoExtractor = (customer) => ({
  name: customer.name,
  email: customer.email,
  phone: customer.phone,
  company: customer.company,
  taxId: customer.taxId,
  billingAddress: customer.address, // { line1, line2?, city, state?, postalCode, country }
})

billingPlugin({ customerRelationSlug: 'customers', customerInfoExtractor })
```

**2. Customer relationship without an extractor.** Give either a `customer` or a name and email in
`customerInfo`. The snapshot stays editable.

**3. No `customerRelationSlug`.** There is no relationship field, and the customer name and email
are required.

### Collection Slugs and Extensions

Each entry under `collections` is a slug string or an object:

```typescript
billingPlugin({
  collections: {
    payments: 'transactions',
    invoices: {
      slug: 'bills',
      extend: (config) => ({
        ...config,
        fields: [...config.fields, { name: 'customMessage', type: 'textarea' }],
      }),
    },
    refunds: { slug: 'chargebacks', access: { create: isStaff } },
  },
})
```

`extend` receives the finished collection config and runs last, so it can change fields, hooks,
admin options and access.

### Access Control

The `payments`, `invoices` and `refunds` collections are **admin-only by default**: a request is allowed
only when `req.user` signed in through the collection Payload uses for its admin panel
(`admin.user`, normally `users`). This governs REST, GraphQL and the admin panel. The plugin's own
code (webhooks, providers, `refundPayment`, the sweeps) uses the Local API without a user and is not
affected.

> **If customers sign up in the same collection as your staff** (for example a single `users`
> collection with roles), the default cannot tell them apart and every customer would be allowed.
> Set `access` yourself. Without it a signed-in customer could `PATCH` their own payment to
> `succeeded`, read every invoice (names, emails, addresses) and reserve refund payouts.

Set per-operation access with the `access` option of each collection. An override replaces only the
operation it names; the others keep the default:

```typescript
const isStaff = ({ req }) => req.user?.role === 'staff'

billingPlugin({
  collections: {
    payments: { access: { read: isStaff, create: isStaff, update: isStaff, delete: () => false } },
    invoices: { access: { read: isStaff } },       // create/update/delete stay admin-only
    refunds: { slug: 'chargebacks', access: { create: isStaff } },
  },
})
```

API-key users of the admin collection are treated like its other users. Passing `undefined` for an
operation keeps the default.

## Collections

### Payments

| Field | Notes |
|-------|-------|
| `provider` | `'stripe' \| 'mollie' \| 'test'` |
| `providerId` | The provider's payment id |
| `status` | `pending`, `processing`, `succeeded`, `failed`, `canceled`, `refunded`, `partially_refunded` |
| `amount` / `currency` | Integer in the smallest currency unit / ISO 4217 code (stored uppercase) |
| `description`, `metadata` | Free text / JSON. Stripe receives `metadata` too |
| `checkoutUrl` | Where to send the customer (Mollie, test), read-only |
| `redirectUrl` | Per-payment return URL. `{returnToken}` is filled in |
| `returnToken` | Random token set on create, read-only |
| `invoice` | Linked invoice |
| `providerData` | `{ raw, timestamp, provider }`: the provider's response, read-only |
| `refunds` | The payment's refunds, read-only |
| `version` | Bumped on every update for optimistic locking |

- Creating a payment calls the provider's `initPayment`. An invalid amount or currency is rejected.
- When a payment becomes `succeeded`, its linked invoice is marked `paid`.
- Provider webhooks never move a settled payment back: `succeeded` only moves on to the refund
  statuses, and `failed` / `canceled` only to `succeeded` (Stripe allows a retry after a failed
  attempt). Status writes are version-checked; on MongoDB that check is a conditional write in the
  database, so it also holds without a replica set (no transactions).
- Redirect URL priority: `payment.redirectUrl` > the provider's `redirectUrl` / `returnUrl` > the
  provider's default.

**Finding the payment on your return page (`{returnToken}`).** The return URL is sent to the
provider while the payment is being created, before it has a database id, so there is no
`{paymentId}` placeholder. Instead every payment gets a random `returnToken` on create (32 random
hex characters, unique, stored on the payment), and the plugin replaces `{returnToken}` in the
redirect URL with it. This works in `payment.redirectUrl` and in the provider config's
`redirectUrl` (Mollie) / `returnUrl` (Stripe, test provider).

```typescript
// On https://example.com/thank-you?t=...
const { docs } = await payload.find({
  collection: 'payments',
  where: { returnToken: { equals: token } },
  limit: 1,
})
```

The plugin always generates the token itself: a `returnToken` passed on create is replaced, and an
update cannot change it. Payments created before this feature have no token.

Treat the token as a bearer secret for that one payment. Anyone who has the return URL can use it,
and it also ends up in browser history, server logs and the provider's dashboard. On the return
page, show only what the customer may see (for example the status), and don't expose the whole
payment document on a public endpoint keyed only by the token. The stored `redirectUrl` already
has the token filled in.

### Invoices

| Field | Notes |
|-------|-------|
| `number` | Unique. Generated as `INV-<unix ms>` when blank |
| `customer` | Relationship, when `customerRelationSlug` is set |
| `customerInfo` | `{ name, email, phone?, company?, taxId? }` |
| `billingAddress` | `{ line1, line2?, city, state?, postalCode, country }` (ISO 3166-1 alpha-2) |
| `status` | `draft`, `open`, `paid`, `void`, `uncollectible` |
| `currency` | ISO 4217 |
| `items[]` | `{ description, quantity, unitAmount, totalAmount }`. `totalAmount` = quantity × unitAmount |
| `subtotal` / `taxAmount` / `amount` | `subtotal` = sum of items, `amount` = subtotal + taxAmount |
| `dueDate` | Defaults to 30 days after creation |
| `paidAt` | Set when the status becomes `paid` |
| `payment` | Linked payment. Linking on create also sets the payment's `invoice` |
| `notes`, `metadata` | Free text / JSON |

When an invoice is marked `paid`, its linked payment becomes `succeeded`, unless the provider has
already reported a final status for it.

```typescript
const invoice = await payload.create({
  collection: 'invoices',
  data: {
    customerInfo: { name: 'Acme Corp', email: 'billing@acme.com' },
    billingAddress: { line1: '123 Business Blvd', city: 'Amsterdam', postalCode: '1011 AA', country: 'NL' },
    currency: 'EUR',
    items: [
      { description: 'Website development', quantity: 40, unitAmount: 15000 },
      { description: 'Hosting (annual)', quantity: 1, unitAmount: 50000 },
    ],
    taxAmount: 136500,
    status: 'open',
  },
})
// subtotal 650000, amount 786500

await payload.create({
  collection: 'payments',
  data: { provider: 'mollie', amount: invoice.amount, currency: invoice.currency, invoice: invoice.id },
})
```

### Refunds

| Field | Notes |
|-------|-------|
| `payment` | Required |
| `amount` / `currency` | Cents / ISO 4217 |
| `status` | `pending`, `processing`, `succeeded`, `failed`, `canceled` |
| `reason` | `duplicate`, `fraudulent`, `requested_by_customer`, `other` |
| `providerId` | The provider's refund id, set when the provider accepts the refund |
| `idempotencyKey` | Generated if not given. Sent to the provider so retries never pay out twice |
| `failureReason` | Why the provider failed or canceled the refund |
| `manual` | Record only: never sent or polled by the plugin (see below) |
| `description`, `metadata`, `providerData` | |

The payment's status follows its succeeded refunds (`partially_refunded` / `refunded`). A refund
created without a `providerId` is a reservation that the plugin **sends to the provider** (Mollie
and the test provider) through `refundPayment`, the [refund jobs](#refunds-from-the-admin-panel) or
`processRefund` / `processPendingRefunds`.

## Issuing a Refund

`refundPayment` makes the payment's provider carry out a refund (Mollie:
`POST /v2/payments/{id}/refunds`):

```typescript
import { refundPayment } from '@xtr-dev/payload-billing'

const refund = await refundPayment(payload, {
  paymentId: payment.id,          // our payment id
  amount: 1000,                   // cents; omit to refund what is still refundable
  description: 'Event sold out',
  reason: 'other',
  idempotencyKey: `order-${order.id}-sold-out`, // optional but recommended
})
refund.providerId  // 're_…' from Mollie
refund.status      // 'processing' until Mollie settles it, then 'succeeded' | 'failed'
```

- **Reserve, verify, send:** `refundPayment` first creates the refund document (a committed
  *reservation*), then re-checks it against every other pending, processing or succeeded refund of
  the payment, and only then calls the provider. A refund that would exceed the payment is marked
  `failed` (`onRefundFailed` fires) and the provider is never called. Of two concurrent refunds
  that together exceed the payment at least one always fails; in a true tie both fail, so retry
  one. This needs no database transactions or locks, but it does need a committed write to be visible
  to the next read: true for a single primary at read-committed or stronger, **not** for lagging
  read replicas or Mongo reads from secondaries. If your Payload reads go to a replica, two
  concurrent refunds can both pass verification; point Payload at the primary. The tests only cover
  single-connection SQLite. Creating a `pending` refund document by hand **only reserves it**: send it with
  `processRefund(payload, refund.id)`, let `processPendingRefunds` pick it up, or turn on
  [`refundJobs`](#refunds-from-the-admin-panel).
- **Validation:** the payment must be `succeeded` / `partially_refunded`, and the amount may not
  exceed what is left after pending, processing and succeeded refunds.
- **Status:** Mollie's `queued`/`pending`/`processing` map to `processing`, `refunded` to
  `succeeded`. Mollie calls the payment webhook when a refund changes, and the plugin syncs the
  payment's refunds from it (refunds made in the Mollie dashboard are recorded too). Statuses only
  move forward, so a late webhook can't undo a later state. Without webhooks, poll with
  `syncOpenRefunds(payload)`.
- **Payment status:** follows the succeeded refunds (`partially_refunded` / `refunded`). Mollie keeps
  reporting such a payment as `paid`; the webhook no longer resets it to `succeeded`.
- **Idempotency:** every refund has an `idempotencyKey` (yours, or generated) that is sent to
  Mollie as `Idempotency-Key` and stored in the refund's metadata, and `refundPayment` with a key
  you've used returns the existing refund. A webhook + sweep retry can't pay out twice.
- **Provider errors:** a 4xx rejection stores the refund as `failed` with `failureReason`; a network
  or 5xx error leaves it `pending` for `processPendingRefunds(payload)` (run it from a cron/job).
- **Sweeps:** `processPendingRefunds` and `syncOpenRefunds` work through every matching refund,
  oldest first, not just one page. `syncOpenRefunds` only polls `processing` refunds with a
  `providerId` (the only ones the provider can still move on).
- **Manual refunds:** tick `manual` on a refund (field in the admin sidebar, or `manual: true` on
  create) to keep it as a record only: `processRefund`, `processPendingRefunds` and
  `syncOpenRefunds` skip it, so it is never paid out by the plugin. Use it for refunds handled by
  hand or to hold one back; untick it to let the next sweep send it. A manual refund still counts
  against what can be refunded while it is `pending` / `processing` / `succeeded`. It only stops
  the plugin from *sending* or *polling* it: a manual refund with a `providerId` is still updated
  when the payment's webhook or `syncPaymentRefunds` reports that refund. Anyone who can update
  refunds can clear `manual` (and so release it to the sweep): restrict it together with
  `providerId`, e.g. with field-level access via `collections.refunds.extend`.

### Refunds from the admin panel

A refund created in the admin panel (Billing > Refunds > Create), over REST or with
`payload.create` is only a reservation. `refundJobs` is **opt-in** (off by default): without it
nothing sends that refund until you call `processRefund` or `processPendingRefunds` yourself. Set
it to have the plugin send the refund through
[Payload's jobs queue](https://payloadcms.com/docs/jobs-queue/overview), which your app must run
(see below):

```typescript
billingPlugin({
  refundJobs: true, // or { queue: 'billing', sweepSchedule: '*/5 * * * *' }
})
```

- Creating a refund without a `providerId` (or clearing `manual` on a pending one) queues a
  `billingProcessRefund` job (`REFUND_TASK_SLUG`) in the same transaction. The job runs
  `processRefund`, which does the same reserve, verify, send as `refundPayment`. `refundPayment`
  sends the refund itself and queues nothing.
- A `billingRefundSweep` task (`REFUND_SWEEP_TASK_SLUG`) runs `processPendingRefunds` and
  `syncOpenRefunds` every 5 minutes by default (`sweepSchedule`; `false` registers it unscheduled).
  It retries refunds left `pending` by a provider outage and polls refunds the provider is still
  processing.
- Both tasks use the `default` queue unless you set `queue`. The plugin only queues the jobs: your
  app has to **run** that queue, or refunds stay `pending`. Do so either with `jobs.autoRun` on a
  long-running server or with a cron calling `GET /api/payload-jobs/run` (serverless). That call also queues the scheduled sweep.
- This adds Payload's `payload-jobs` collection (and `payload-job-stats` for the schedule), so run
  a migration on Postgres/SQLite.

**Access:** refunds are admin-only by default (see [Access Control](#access-control)). Creating a
refund reserves a real payout (or, with a `providerId`, marks it `succeeded`), so if you open
`collections.refunds.access.create` keep it limited to staff.

**Hooks** (e.g. to email the buyer and alert staff). They run once per status transition, and an
error thrown in one is logged, never rolls the refund back:

```typescript
billingPlugin({
  hooks: {
    onRefundSucceeded: async ({ refund, payment, payload }) => { /* email the buyer */ },
    onRefundFailed: async ({ refund, payment, payload }) => { /* alert staff: refund.failureReason */ },
    onRefundStatusChange: async ({ refund, previousStatus }) => {},
  },
})
```

`refund.metadata` is yours to fill (e.g. the line items refunded, for partial refunds) and is
available in every hook.

**Test provider:** pick the outcome per refund with `metadata: { testScenario }`:
`refund-success` (default), `refund-processing` (settle it with
`POST /api/payload-billing/test/refund` `{ refundId, outcome: 'succeeded' | 'failed' }`),
`refund-failed` (provider reports it failed) and `refund-rejected` (provider rejects the request).

Providers implement this with the optional `refundPayment` and `fetchRefunds` members of
`PaymentProvider`.

### Recording a Refund

A refund that already has a `providerId` is only recorded, not sent to the provider:

```typescript
await payload.create({
  collection: 'refunds',
  data: {
    payment: payment.id,
    amount: 1000,
    currency: payment.currency,
    providerId: 're_from_provider',
    status: 'succeeded',
    reason: 'requested_by_customer',
  },
})
// The payment becomes 'partially_refunded' (or 'refunded' for the full amount)
```

## Webhooks

| Provider | Endpoint | Notes |
|----------|----------|-------|
| Stripe | `POST /api/payload-billing/stripe/webhook` | Registered only with `webhookSecret`. Requests without a valid `stripe-signature` get a 400 |
| Mollie | `POST /api/payload-billing/mollie/webhook` | Body `id=tr_…`. The plugin fetches the payment from Mollie rather than trusting the body |

**Stripe:** add the endpoint in Dashboard → Developers → Webhooks with the `payment_intent.*` and
`charge.refunded` events, and set `STRIPE_WEBHOOK_SECRET`. Handled events:
`payment_intent.succeeded`, `payment_intent.payment_failed` and `payment_intent.canceled` set the
payment status, and `charge.refunded` sets `refunded` / `partially_refunded`. To test locally, run
`stripe listen --forward-to localhost:3000/api/payload-billing/stripe/webhook`.

**Mollie:** the webhook URL is passed per payment, so there is nothing to set up in the dashboard.
To test locally, expose your app over HTTPS (e.g. `ngrok http 3000`) and use that URL as the
server URL.

After verification, webhooks answer 200 even when the payment is unknown or processing fails. The
error is logged, and the response body stays generic.

**Syncing without the webhook:** when a webhook never arrived (local development, an outage), pull
the payment from the provider through the same code path the webhook uses (status update, invoice
marked paid, refunds synced), e.g. from a cron job or a thank-you page:

```typescript
import { syncPaymentFromProvider } from '@xtr-dev/payload-billing'

const payment = await syncPaymentFromProvider(payload, paymentId) // our payment id
```

It throws when the payment has no provider payment id yet or its provider cannot sync
(currently only Mollie can). To only read a Mollie status the way the plugin does, use
`mapMollieStatusToPaymentStatus` from `@xtr-dev/payload-billing/mollie`.

## API Reference

| Import | Exports |
|--------|---------|
| `@xtr-dev/payload-billing` | `billingPlugin`, `testProvider`, `refundPayment`, `processRefund`, `processPendingRefunds`, `syncPaymentRefunds`, `syncOpenRefunds`, `syncPaymentFromProvider`, `REFUND_TASK_SLUG`, `REFUND_SWEEP_TASK_SLUG`, `TEST_REFUND_SCENARIOS`, `getPluginLogger`, `createContextLogger` |
| `@xtr-dev/payload-billing/stripe` | `stripeProvider` |
| `@xtr-dev/payload-billing/mollie` | `mollieProvider`, `mapMollieStatusToPaymentStatus` |

There are no `/client` or `/rsc` entry points: the plugin ships no React components. They held
unwired demo components until 0.5.x and were removed.

Types (from the main entry): `Payment`, `Invoice`, `Refund`, `PaymentStatus`, `InvoiceStatus`,
`RefundStatus`, `RefundReason`, `Address`, `InvoiceItem`, `CustomerInfo`, `BillingPluginConfig`,
`CustomerInfoExtractor`, `BillingCollectionAccess`, `RefundJobsConfig`, `RefundHook`,
`RefundHookArgs`, `PaymentProvider`, `ProviderData`, `InitPayment`, `ProviderRefund`,
`ProviderRefundRequest`, `StripeProviderConfig`, `MollieProviderConfig`, `TestProviderConfig`,
`TestProviderConfigResponse`, `PaymentScenario`, `PaymentOutcome`, `PaymentMethod`,
`RefundScenarioId`.

A custom provider implements `PaymentProvider`:

```typescript
type PaymentProvider = {
  key: string                                   // the value stored in payment.provider
  initPayment: (payload, payment) => Partial<Payment> | Promise<Partial<Payment>>
  onConfig?: (config, pluginConfig) => void     // e.g. register endpoints
  onInit?: (payload) => void | Promise<void>
  refundPayment?: (payload, request: ProviderRefundRequest) => Promise<ProviderRefund>
  fetchRefunds?: (payload, payment) => Promise<ProviderRefund[]>
  syncPayment?: (payload, pluginConfig, payment) => Promise<boolean>
}
```

## Troubleshooting

- **Payment status not updating:** check the webhook deliveries in the Stripe/Mollie dashboard,
  check that the Stripe `webhookSecret` is set (without it there is no endpoint), and check that a
  payment with that `providerId` exists. Resync a Mollie payment with
  `syncPaymentFromProvider(payload, paymentId)`.
- **Mollie "invalid URL":** Mollie needs public HTTPS URLs. Set a [server URL](#server-url), for
  example an ngrok URL during development.
- **Invoice not marked paid:** the payment needs `invoice` set and must reach `succeeded`.
- **Test checkout says "session not found":** test sessions live in memory and are lost on restart.
  Create a new payment.

## Development

```bash
pnpm install
pnpm dev          # demo app from dev/ on http://localhost:3000 (dev@payloadcms.com / test)
pnpm test         # vitest (dev/*.spec.ts, SQLite)
pnpm typecheck
pnpm lint
pnpm test:pack    # build and check the packed exports
```

See [dev/README.md](./dev/README.md) for the demo app. Pull request titles use conventional-commit
form. Releases run from the manual Release workflow (xtr-dev/changelog), so don't bump the version
in a PR.

## Requirements

- **PayloadCMS**: ^3.37.0
- **Node.js**: ^18.20.2 || >=20.9.0
- **Package Manager**: pnpm ^9 || ^10

## License

MIT
