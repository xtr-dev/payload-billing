import { sanitizeConfig } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import type { CollectionConfig, Config } from 'payload'
import { billingPlugin } from '../src/plugin/index'

// sanitizeConfig only needs enough of a db adapter to satisfy its shape checks;
// it never calls into it for this synchronous sanitization pass.
const stubDb = { defaultIDType: 'text', init: () => ({}) } as any

describe('billingPlugin disabled configuration', () => {
  it('keeps collection schemas while disabling behavior and admin views', () => {
    const onConfig = vi.fn()
    const onInit = vi.fn()
    const existingOnInit = vi.fn()
    const hostCollection = { slug: 'articles', fields: [] } as CollectionConfig
    const config = {
      collections: [hostCollection],
      onInit: existingOnInit,
    } as unknown as Config

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
      expect(collection.endpoints).toBe(false)
      expect(collection.hooks).toEqual({})
      expect(collection.access).toBeDefined()

      for (const operation of ['admin', 'create', 'delete', 'read', 'readVersions', 'unlock', 'update'] as const) {
        const access = collection.access?.[operation]
        expect(typeof access).toBe('function')
        if (typeof access === 'function') {
          expect(access({} as never)).toBe(false)
        }
      }
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
    expect(payments?.endpoints).toBe(false)
    expect(payments?.hooks).toEqual({})
    expect(payments?.access?.create?.({} as never)).toBe(false)
    expect(payments?.admin?.hidden).toBe(true)
  })

  it('registers no endpoints and no admin access once Payload sanitizes an auth- and upload-enabled extension', async () => {
    const result = billingPlugin({
      collections: {
        payments: {
          slug: 'payments',
          // Mirrors the scenario that motivated this follow-up: a host extends the
          // generated collection with `auth`, which is how login/refresh/reset-password
          // endpoints and admin access get added by sanitizeCollection.
          extend: collection => ({
            ...collection,
            auth: true,
          }),
        },
        invoices: {
          slug: 'invoices',
          extend: collection => ({
            ...collection,
            upload: true,
          }),
        },
      },
      disabled: true,
    })({
      collections: [{ slug: 'users', auth: true, fields: [] }],
    } as unknown as Config)

    const sanitized = await sanitizeConfig({
      ...result,
      admin: { user: 'users' },
      secret: 'test',
      db: stubDb as Config['db'],
    } as Config)

    for (const slug of ['payments', 'invoices', 'refunds']) {
      const collection = sanitized.collections.find(c => c.slug === slug)
      expect(collection?.endpoints).toBe(false)
      expect(collection?.access?.admin?.({} as never)).toBe(false)
    }
  })
})
