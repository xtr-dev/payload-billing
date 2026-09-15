import type { Config, Payload } from 'payload'
import { describe, expect, test, vi } from 'vitest'

import billingPlugin, { useBillingPlugin } from '../src/plugin'
import { testProvider } from '../src/providers/test'

const makeConfig = (overrides: Partial<Config> = {}): Config =>
  ({ collections: [], ...overrides }) as Config

const findCollection = (config: Config, slug: string) =>
  config.collections?.find((collection) => collection.slug === slug)

const findField = (config: Config, collectionSlug: string, fieldName: string) => {
  const collection = findCollection(config, collectionSlug)
  return (collection?.fields as any[] | undefined)?.find((field) => field.name === fieldName)
}

describe('billingPlugin config transform', () => {
  test('appends the billing collections to existing ones instead of replacing them', () => {
    const config = makeConfig({ collections: [{ slug: 'posts', fields: [] }] })

    const result = billingPlugin()(config)

    expect(result.collections).toHaveLength(4)
    expect(result.collections?.map((collection) => collection.slug)).toEqual([
      'posts',
      'payments',
      'invoices',
      'refunds',
    ])
  })

  test('propagates a payments slug override into the invoices and refunds relationships', () => {
    const config = makeConfig()

    const result = billingPlugin({ collections: { payments: 'orders' } })(config)

    expect(findCollection(result, 'orders')).toBeDefined()
    expect(findField(result, 'invoices', 'payment')?.relationTo).toBe('orders')
    expect(findField(result, 'refunds', 'payment')?.relationTo).toBe('orders')
  })

  test('resolves the string and object forms of CollectionExtension identically', () => {
    const slugsFor = (result: Config) => ({
      paymentsSlug: findCollection(result, 'orders')?.slug,
      invoiceRelation: findField(result, 'invoices', 'payment')?.relationTo,
      refundRelation: findField(result, 'refunds', 'payment')?.relationTo,
    })

    const withString = billingPlugin({ collections: { payments: 'orders' } })(makeConfig())
    const withObject = billingPlugin({ collections: { payments: { slug: 'orders' } } })(makeConfig())

    expect(slugsFor(withString)).toEqual(slugsFor(withObject))
    expect(slugsFor(withString).paymentsSlug).toBe('orders')
  })

  test('applies extend and keeps the base collection fields', () => {
    const config = makeConfig()

    const result = billingPlugin({
      collections: {
        payments: {
          slug: 'orders',
          extend: (collectionConfig) => ({
            ...collectionConfig,
            fields: [...collectionConfig.fields, { name: 'x', type: 'text' }],
          }),
        },
      },
    })(config)

    const payments = findCollection(result, 'orders')
    const fieldNames = (payments?.fields as any[]).map((field) => field.name)
    expect(fieldNames).toContain('x')
    expect(fieldNames).toContain('providerId')
  })

  test('disabled keeps billing collections and does not wrap onInit', () => {
    const onInit = async () => {}
    const config = makeConfig({ collections: [{ slug: 'posts', fields: [] }], onInit })

    const result = billingPlugin({ disabled: true })(config)

    expect(result.collections?.map((collection) => collection.slug)).toEqual([
      'posts',
      'payments',
      'invoices',
      'refunds',
    ])
    for (const slug of ['payments', 'invoices', 'refunds']) {
      const collection = findCollection(result, slug)
      expect((collection?.fields as any[]).length).toBeGreaterThan(0)
      expect(collection?.hooks).toEqual({})
      expect(collection?.endpoints).toBe(false)
    }
    expect(result.onInit).toBe(onInit)
  })

  test("runs the consumer's existing onInit first, before the plugin becomes available", async () => {
    const order: string[] = []
    const fakePayload = {} as Payload
    const config = makeConfig({
      onInit: async (payload) => {
        order.push('consumer')
        expect(useBillingPlugin(payload)).toBeUndefined()
      },
    })

    const result = billingPlugin()(config)
    await result.onInit!(fakePayload)

    expect(order).toEqual(['consumer'])
    expect(useBillingPlugin(fakePayload)).toBeDefined()
  })

  test('registers providers by key and tolerates holes from disabled providers', async () => {
    vi.useFakeTimers()
    try {
      const provider = testProvider({ enabled: true })!
      const onConfigSpy = vi.spyOn(provider, 'onConfig')
      const config = makeConfig()
      const pluginConfig = { providers: [undefined, provider, testProvider({ enabled: false }), null] }

      const result = billingPlugin(pluginConfig)(config)

      expect(onConfigSpy).toHaveBeenCalledTimes(1)
      expect(onConfigSpy).toHaveBeenCalledWith(config, pluginConfig)

      const fakePayload = {} as Payload
      await expect(result.onInit!(fakePayload)).resolves.not.toThrow()

      const plugin = useBillingPlugin(fakePayload)
      expect(Object.keys(plugin!.providerConfig)).toEqual(['test'])
    } finally {
      vi.useRealTimers()
    }
  })
})
