import type { Config, Payload } from 'payload'
import { describe, expect, test, vi } from 'vitest'

import billingPlugin, { useBillingPlugin } from '../src/plugin'
import type { PaymentProvider } from '../src/providers/types'

describe('billingPlugin provider wiring', () => {
  test('passes configuration to providers, initializes them, and retains their config', async () => {
    const providerA: PaymentProvider = {
      key: 'stub',
      onConfig: vi.fn((config) => {
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
})
