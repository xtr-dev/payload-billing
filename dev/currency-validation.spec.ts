import { describe, expect, test } from 'vitest'

import { createInvoicesCollection } from '../src/collections/invoices'
import { createPaymentsCollection } from '../src/collections/payments'
import { createRefundsCollection } from '../src/collections/refunds'
import { isValidCurrencyCode } from '../src/providers/currency'

describe('ISO 4217 currency validation', () => {
  test('accepts current ISO 4217 codes case-insensitively', () => {
    expect(isValidCurrencyCode('eur')).toBe(true)
    expect(isValidCurrencyCode('XAD')).toBe(true)
    expect(isValidCurrencyCode('XXX')).toBe(true)
  })

  test.each(['ABC', 'ZZZ', 'EURO'])('rejects a code outside the ISO 4217 list: %s', (currency) => {
    expect(isValidCurrencyCode(currency)).toBe(false)
  })

  test.each([
    ['payments', createPaymentsCollection],
    ['invoices', createInvoicesCollection],
    ['refunds', createRefundsCollection],
  ] as const)('%s rejects an unassigned currency code before creating a record', async (_name, createCollection) => {
    const hook = createCollection({}).hooks?.beforeChange?.[0]

    await expect(Promise.resolve().then(() => hook?.({
      data: { amount: 100, currency: 'abc' },
      operation: 'create',
      req: {},
    } as never))).rejects.toThrow('Currency must be a valid ISO 4217 code')
  })
})
