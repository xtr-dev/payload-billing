import { describe, expect, it, vi } from 'vitest'
import type { CollectionConfig, Config } from 'payload'
import { billingPlugin } from '../src/plugin/index'

describe('billingPlugin disabled configuration', () => {
  it('keeps collection schemas while disabling behavior and admin views', () => {
    const onConfig = vi.fn()
    const onInit = vi.fn()
    const existingOnInit = vi.fn()
    const hostCollection = { slug: 'articles', fields: [] } as CollectionConfig
    const config = {
      collections: [hostCollection],
      onInit: existingOnInit,
    } as Config

    const result = billingPlugin({
      disabled: true,
      providers: [{
        key: 'disabled-provider',
        initPayment: vi.fn(),
        onConfig,
        onInit,
      }],
    })(config)

    expect(result.collections?.[0]).toBe(hostCollection)
    expect(result.collections?.slice(1).map(collection => collection.slug)).toEqual([
      'payments',
      'invoices',
      'refunds',
    ])

    for (const collection of result.collections?.slice(1) || []) {
      expect(collection.fields.length).toBeGreaterThan(0)
      expect(collection.admin?.hidden).toBe(true)
      expect(collection.endpoints).toEqual([])
      expect(collection.hooks).toEqual({})
    }

    expect(result.onInit).toBe(existingOnInit)
    expect(onConfig).not.toHaveBeenCalled()
    expect(onInit).not.toHaveBeenCalled()
  })

  it('honors collection extensions before disabling their behavior', () => {
    const result = billingPlugin({
      collections: {
        payments: {
          slug: 'charges',
          extend: collection => ({
            ...collection,
            endpoints: [{ method: 'get', path: '/custom', handler: vi.fn() }],
            fields: [...collection.fields, { name: 'reference', type: 'text' }],
          }),
        },
      },
      disabled: true,
    })({} as Config)

    const payments = result.collections?.find(collection => collection.slug === 'charges')
    expect(payments?.fields.some(field => 'name' in field && field.name === 'reference')).toBe(true)
    expect(payments?.endpoints).toEqual([])
    expect(payments?.hooks).toEqual({})
    expect(payments?.admin?.hidden).toBe(true)
  })
})
