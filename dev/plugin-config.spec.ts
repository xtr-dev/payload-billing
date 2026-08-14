import type { Config, Payload } from 'payload'
import { describe, expect, test, vi } from 'vitest'

import billingPlugin, { useBillingPlugin } from '../src/plugin'
import type { PaymentProvider } from '../src/providers/types'
import { testProvider } from '../src/providers/test'

// billingPlugin only touches the parts of Config and Payload it reads or
// writes, so a plain object literal stands in for both - no Payload
// instance and no database needed for any of these.
const makeConfig = (overrides: Partial<Config> = {}): Config =>
  ({ collections: [], ...overrides }) as Config

const findCollection = (config: Config, slug: string) =>
  config.collections?.find((collection) => collection.slug === slug)

const findField = (config: Config, collectionSlug: string, fieldName: string) => {
  const collection = findCollection(config, collectionSlug)
  return (collection?.fields as any[] | undefined)?.find((field) => field.name === fieldName)
}

describe('billingPlugin', () => {
  test('disabled is a true no-op: collections array and onInit reference are untouched', () => {
    const collections = [{ slug: 'posts', fields: [] }]
    const onInit = async () => {}
    const config = makeConfig({ collections, onInit })

    const result = billingPlugin({ disabled: true })(config)

    expect(result.collections).toBe(collections)
    expect(result.onInit).toBe(onInit)
  })

  test('registers exactly the three billing collections after the caller\'s own', () => {
    const config = makeConfig({ collections: [{ slug: 'posts', fields: [] }] })

    const result = billingPlugin()(config)

    expect(result.collections?.[0]?.slug).toBe('posts')
    expect(result.collections?.map((collection) => collection.slug)).toEqual([
      'posts',
      'payments',
      'invoices',
      'refunds',
    ])
  })

  test('slug overrides (string and object form) propagate into the payments relationship fields', () => {
    const config = makeConfig()

    const result = billingPlugin({
      collections: {
        payments: 'billing-payments',
        invoices: { slug: 'bills' },
      },
    })(config)

    expect(findCollection(result, 'billing-payments')).toBeDefined()
    expect(findCollection(result, 'bills')).toBeDefined()
    expect(findField(result, 'billing-payments', 'invoice')?.relationTo).toBe('bills')
    expect(findField(result, 'billing-payments', 'refunds')?.relationTo).toBe('refunds')
  })

  test('extend replaces the registered collection with the extended one', () => {
    const config = makeConfig()

    const result = billingPlugin({
      collections: {
        payments: {
          slug: 'payments',
          extend: (collectionConfig) => ({
            ...collectionConfig,
            admin: { ...collectionConfig.admin, group: 'Custom' },
          }),
        },
      },
    })(config)

    expect(findCollection(result, 'payments')?.admin?.group).toBe('Custom')
  })

  test("awaits the host's own onInit before the plugin's work runs", async () => {
    const order: string[] = []
    const fakePayload = {} as Payload
    const config = makeConfig({
      onInit: async () => {
        expect(useBillingPlugin(fakePayload)).toBeUndefined()
        order.push('host')
      },
    })

    const result = billingPlugin()(config)
    await result.onInit!(fakePayload)

    expect(order).toEqual(['host'])
    expect(useBillingPlugin(fakePayload)).toBeDefined()
  })

  test('the singleton filters nullish provider entries without throwing', async () => {
    const provider = testProvider({ enabled: true })!
    const pluginConfig = { providers: [provider, null, undefined] }
    const config = makeConfig()
    const fakePayload = {} as Payload

    const result = billingPlugin(pluginConfig)(config)

    // testProvider's own onInit schedules a real setInterval; fake timers
    // keep this test from leaving it running after the assertions below.
    vi.useFakeTimers()
    try {
      await result.onInit!(fakePayload)
    } finally {
      vi.useRealTimers()
    }

    const plugin = useBillingPlugin(fakePayload)
    expect(plugin?.config).toBe(pluginConfig)
    expect(Object.keys(plugin!.providerConfig)).toEqual(['test'])
    expect(plugin!.providerConfig.test).toBe(provider)
  })

  test('each provider\'s onConfig is called exactly once with (config, pluginConfig)', () => {
    const provider: PaymentProvider = {
      key: 'fake',
      onConfig: vi.fn(),
      initPayment: () => ({}),
    }
    const config = makeConfig()
    const pluginConfig = { providers: [provider] }

    billingPlugin(pluginConfig)(config)

    expect(provider.onConfig).toHaveBeenCalledTimes(1)
    expect(provider.onConfig).toHaveBeenCalledWith(config, pluginConfig)
  })

  test("a provider's onInit is awaited before config.onInit resolves", async () => {
    let sideEffectVisible = false
    const provider: PaymentProvider = {
      key: 'fake',
      onInit: async () => {
        await Promise.resolve()
        sideEffectVisible = true
      },
      initPayment: () => ({}),
    }
    const config = makeConfig()
    const fakePayload = {} as Payload

    const result = billingPlugin({ providers: [provider] })(config)

    expect(sideEffectVisible).toBe(false)
    await result.onInit!(fakePayload)
    expect(sideEffectVisible).toBe(true)
  })
})
