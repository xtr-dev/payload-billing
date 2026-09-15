import type { Config, Payload } from 'payload'
import { describe, expect, test, vi } from 'vitest'

import billingPlugin, { useBillingPlugin } from '../src/plugin'
import type { PaymentProvider } from '../src/providers/types'

describe('billingPlugin provider wiring', () => {
  test('passes configuration to providers, initializes them, and retains their config', async () => {
    let collectionSlugsAtOnConfig: unknown[] | undefined
    const providerA: PaymentProvider = {
      key: 'stub',
      onConfig: vi.fn((config) => {
        collectionSlugsAtOnConfig = config.collections?.map(
          (collection: { slug: string }) => collection.slug,
        )
        config.endpoints = [
          ...(config.endpoints || []),
          { path: '/stub', method: 'get', handler: () => new Response() },
        ]
      }),
      onInit: vi.fn(),
      initPayment: () => ({}),
    }
    const pluginConfig = { providers: [providerA] }
    const hostCollection = { slug: 'posts', fields: [] }
    const baseConfig = { collections: [hostCollection] } as unknown as Config
    const mockPayload = {} as Payload

    const resultConfig = billingPlugin(pluginConfig)(baseConfig)

    expect(providerA.onConfig).toHaveBeenCalledTimes(1)
    expect(providerA.onConfig).toHaveBeenCalledWith(resultConfig, pluginConfig)
    // Proves ordering: this snapshot was taken *inside* the onConfig mock, before
    // it ran any further, so it reflects config.collections as it stood when the
    // provider was invoked -- unlike comparing against resultConfig after the
    // fact, which only shows the final, fully-mutated object regardless of when
    // onConfig actually ran relative to collection assembly.
    expect(collectionSlugsAtOnConfig).toEqual(
      expect.arrayContaining(['posts', 'payments', 'invoices', 'refunds']),
    )
    expect(resultConfig.endpoints?.map((endpoint) => endpoint.path)).toContain(
      '/stub',
    )
    expect(resultConfig.collections).toEqual(
      expect.arrayContaining([
        hostCollection,
        expect.objectContaining({ slug: 'payments' }),
        expect.objectContaining({ slug: 'invoices' }),
        expect.objectContaining({ slug: 'refunds' }),
      ]),
    )

    await resultConfig.onInit!(mockPayload)

    expect(providerA.onInit).toHaveBeenCalledTimes(1)
    expect(providerA.onInit).toHaveBeenCalledWith(mockPayload)
    expect(useBillingPlugin(mockPayload)).toEqual({
      config: pluginConfig,
      providerConfig: { stub: providerA },
    })
  })

  test('calls onConfig in registration order after collections are assembled, skipping providers without it', () => {
    const onConfigOrder: string[] = []
    const slugsAtCall: Record<string, unknown[] | undefined> = {}

    const withOnConfig = (key: string): PaymentProvider => ({
      key,
      onConfig: vi.fn((config: Config) => {
        onConfigOrder.push(key)
        slugsAtCall[key] = config.collections?.map(
          (collection: { slug: string }) => collection.slug,
        )
      }),
      initPayment: () => ({}),
    })

    const first = withOnConfig('first')
    const skipped: PaymentProvider = {
      key: 'skipped',
      initPayment: () => ({}),
    }
    const second = withOnConfig('second')
    const pluginConfig = { providers: [first, skipped, second] }
    const baseConfig = {
      collections: [{ slug: 'posts', fields: [] }],
    } as unknown as Config

    billingPlugin(pluginConfig)(baseConfig)

    expect(first.onConfig).toHaveBeenCalledTimes(1)
    expect(second.onConfig).toHaveBeenCalledTimes(1)
    expect(onConfigOrder).toEqual(['first', 'second'])
    expect(slugsAtCall.first).toEqual(
      expect.arrayContaining(['posts', 'payments', 'invoices', 'refunds']),
    )
    expect(slugsAtCall.second).toEqual(slugsAtCall.first)
  })
})
