# Demo app

A Payload + Next.js app that loads the plugin from `../src`. It is used by `pnpm dev` and the
vitest suites in this folder (`*.spec.ts`).

```bash
pnpm install
pnpm dev   # http://localhost:3000, sign in with dev@payloadcms.com / test
```

- Database: SQLite at `dev/payload.sqlite` (tests use a temporary file). Delete the file to re-seed.
- Config (`payload.config.ts`): the test provider with `customUiRoute: '/test-payment'`, and an
  `invoices` extension that adds a `customMessage` field copied from the payment's
  `metadata.customMessage`.
- Seed (`seed.ts`): the dev user plus sample payments and invoices.

Pages:

- `/`: create a test payment and follow it through checkout
- `/test-payment/[id]`: custom checkout UI for the test provider
- `/payment-success`, `/payment-failed`: return pages
- `/invoice/[id]`: printable invoice
- `/admin`: Payload admin (**Billing → Payments / Invoices / Refunds**)

Demo API routes: `POST /api/demo/create-payment`, `GET /api/demo/payment/[providerId]` and
`GET /api/demo/invoice/[id]`.

After changing collections, regenerate types with `pnpm dev:generate-types`.
