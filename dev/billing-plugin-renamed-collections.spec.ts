// Guards the billingPlugin collection-graph contract when every collection is
// renamed through the object form of collections.{payments,invoices,refunds}.
// The only existing object-form assertions are invoices.extend (dev/int.spec.ts)
// and the test provider's /process path with a renamed payments slug
// (dev/test-provider-slug.spec.ts). Neither applies all three settings nor
// inspects the plugin-created slugs and relationTo values. Field names stay
// invoice / refunds / payment; this asserts registration slugs and relationTo
// only. Run directly (`vitest run dev/billing-plugin-renamed-collections.spec.ts`)
// — it needs no database.
import type { Config, Field } from 'payload'
import { describe, expect, test } from 'vitest'

import { billingPlugin } from '../src/index'

const emptyConfig = (): Config => ({ collections: [] }) as unknown as Config

const findCollection = (config: Config, slug: string) =>
  config.collections?.find((collection) => collection.slug === slug)

const relationTo = (config: Config, collectionSlug: string, fieldName: string) => {
  const field = findCollection(config, collectionSlug)?.fields.find(
    (candidate) => 'name' in candidate && candidate.name === fieldName,
  ) as (Field & { relationTo?: string }) | undefined
  return field?.relationTo
}

describe('billingPlugin renamed collections', () => {
  test('object-form slugs for payments, invoices and refunds are the registered collections and every relationTo, with no default slug remaining', () => {
    const result = billingPlugin({
      collections: {
        payments: { slug: 'orders' },
        invoices: { slug: 'bills' },
        refunds: { slug: 'credits' },
      },
    })(emptyConfig())

    expect(result.collections?.map((collection) => collection.slug)).toEqual([
      'orders',
      'bills',
      'credits',
    ])

    expect(relationTo(result, 'orders', 'invoice')).toBe('bills')
    expect(relationTo(result, 'orders', 'refunds')).toBe('credits')
    expect(relationTo(result, 'bills', 'payment')).toBe('orders')
    expect(relationTo(result, 'credits', 'payment')).toBe('orders')

    const used = [
      ...(result.collections?.map((collection) => collection.slug) ?? []),
      relationTo(result, 'orders', 'invoice'),
      relationTo(result, 'orders', 'refunds'),
      relationTo(result, 'bills', 'payment'),
      relationTo(result, 'credits', 'payment'),
    ]
    for (const defaultSlug of ['payments', 'invoices', 'refunds'] as const) {
      expect(used).not.toContain(defaultSlug)
    }
  })
})
