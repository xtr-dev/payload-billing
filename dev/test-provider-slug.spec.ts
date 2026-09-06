// Guards the slug resolution in the test provider's database paths. collections.payments
// accepts a bare slug or { slug, extend }; until 2026-08-14 updatePaymentInDatabase used its
// own string-only check and fell back to the literal 'payments' for the object form, so every
// test payment against a renamed collection stayed pending forever. This drives the real
// /payload-billing/test/process handler with { slug: 'orders' } and a fake payload that
// records which collection every find/update targets.
// Run directly (`vitest run dev/test-provider-slug.spec.ts`) — it needs no database.
import { expect, it } from 'vitest'
import { testProvider } from '../src/providers/test'

it('process handler updates the renamed payments collection', async () => {
  const provider = testProvider({ enabled: true, defaultDelay: 1 })!
  const pluginConfig: any = { collections: { payments: { slug: 'orders' } } }
  const config: any = { endpoints: [] }
  provider.onConfig!(config, pluginConfig)

  const processEndpoint = config.endpoints.find((e: any) => e.path === '/payload-billing/test/process')
  expect(processEndpoint).toBeDefined()

  const queried: string[] = []
  const updated: string[] = []
  const paymentDoc: any = { id: 1, providerId: 'test_pay_verify1', status: 'pending', createdAt: new Date().toISOString() }
  const fakePayload: any = {
    find: async ({ collection }: any) => {
      queried.push(collection)
      return { docs: [paymentDoc] }
    },
    update: async ({ collection, data }: any) => {
      updated.push(collection)
      Object.assign(paymentDoc, data)
      return paymentDoc
    },
  }

  const res = await processEndpoint.handler({
    payload: fakePayload,
    json: async () => ({ paymentId: 'test_pay_verify1', scenarioId: 'instant-success', method: 'ideal' }),
  })
  expect(res.status).toBe(200)

  // instant-success schedules processTestPayment on a timer (defaultDelay: 1ms)
  await new Promise((r) => setTimeout(r, 200))

  expect(queried).toContain('orders')
  expect(queried).not.toContain('payments')
  expect(updated).toEqual(['orders'])
  expect(paymentDoc.status).toBe('succeeded')
})
