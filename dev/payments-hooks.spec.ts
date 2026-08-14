import { beforeEach, describe, expect, test, vi } from 'vitest'

import { createPaymentsCollection } from '../src/collections/payments'
import { billingPlugin } from '../src/plugin'
import type { BillingPluginConfig } from '../src/plugin/config'
import type { PaymentProvider } from '../src/providers/types'

const getHooks = (config: BillingPluginConfig = {}) => {
  const collection = createPaymentsCollection(config)

  return {
    afterChange: collection.hooks!.afterChange![0] as any,
    beforeChange: collection.hooks!.beforeChange![0] as any,
  }
}

const createPayload = () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }

  return {
    logger: {
      child: vi.fn(() => logger),
    },
    update: vi.fn(),
  } as any
}

const initializeBilling = async (
  payload: any,
  providers: PaymentProvider[],
) => {
  const config = billingPlugin({ providers })({})
  await config.onInit!(payload)
}

describe('payments beforeChange hook', () => {
  const testPaymentProvider: PaymentProvider = {
    key: 'test',
    initPayment: (_payload, payment) => {
      payment.providerId = `test_pay_${Date.now()}`
      payment.checkoutUrl = `https://example.test/checkout/${payment.providerId}`
      return payment
    },
  }

  test('uppercases currency in place on create', async () => {
    const payload = createPayload()
    await initializeBilling(payload, [testPaymentProvider])
    const data = { amount: 100, currency: 'eur', provider: 'test' }

    const result = await getHooks().beforeChange({
      data,
      operation: 'create',
      req: { payload },
    })

    expect(result).toBeUndefined()
    expect(data.currency).toBe('EUR')
  })

  test.each(['EURO', 'euro'])(
    'rejects invalid currency %s after coercion',
    async (currency) => {
      const data = { amount: 100, currency, provider: 'test' }

      await expect(
        getHooks().beforeChange({
          data,
          operation: 'create',
          req: { payload: createPayload() },
        }),
      ).rejects.toThrow('Currency must be a 3-letter ISO code')
    },
  )

  test('rejects fractional minor units', async () => {
    const data = { amount: 10.5, currency: 'EUR', provider: 'test' }

    await expect(
      getHooks().beforeChange({
        data,
        operation: 'create',
        req: { payload: createPayload() },
      }),
    ).rejects.toThrow('Amount must be an integer (in cents)')
  })

  test('allows zero through hook validation', async () => {
    const payload = createPayload()
    await initializeBilling(payload, [testPaymentProvider])
    const data = { amount: 0, currency: 'EUR', provider: 'test' }

    await expect(
      getHooks().beforeChange({ data, operation: 'create', req: { payload } }),
    ).resolves.toBeUndefined()
  })

  test('keeps provider mutations on the payment data', async () => {
    const payload = createPayload()
    await initializeBilling(payload, [testPaymentProvider])
    const data: Record<string, any> = {
      amount: 100,
      currency: 'EUR',
      provider: 'test',
    }

    await getHooks().beforeChange({
      data,
      operation: 'create',
      req: { payload },
    })

    expect(data.providerId).toMatch(/^test_pay_/)
    expect(data.checkoutUrl).toBe(
      `https://example.test/checkout/${data.providerId}`,
    )
  })

  test('reports when the billing singleton is not initialized', async () => {
    const data = { amount: 100, currency: 'EUR', provider: 'test' }

    await expect(
      getHooks().beforeChange({
        data,
        operation: 'create',
        req: { payload: createPayload() },
      }),
    ).rejects.toThrow('Billing plugin not initialized')
  })

  test('rejects a provider that is not registered', async () => {
    const payload = createPayload()
    await initializeBilling(payload, [testPaymentProvider])
    const data = { amount: 100, currency: 'EUR', provider: 'stripe' }

    await expect(
      getHooks().beforeChange({ data, operation: 'create', req: { payload } }),
    ).rejects.toThrow('Provider stripe not found.')
  })

  test.each([
    { expected: 4, originalDoc: { version: 3 } },
    { expected: 2, originalDoc: {} },
  ])(
    'sets the next version to $expected',
    async ({ expected, originalDoc }) => {
      const data: Record<string, any> = {}

      await getHooks().beforeChange({
        data,
        operation: 'update',
        originalDoc,
        req: { payload: createPayload() },
      })

      expect(data.version).toBe(expected)
    },
  )

  test('preserves an explicitly supplied version', async () => {
    const data = { version: 9 }

    await getHooks().beforeChange({
      data,
      operation: 'update',
      originalDoc: { version: 3 },
      req: { payload: createPayload() },
    })

    expect(data.version).toBe(9)
  })
})

describe('payments afterChange hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const runAfterChange = async ({
    config = {},
    doc = { id: 'pay1', invoice: 'inv1', status: 'succeeded' },
    operation = 'update',
    payload = createPayload(),
    previousDoc = { status: 'pending' },
  }: Record<string, any> = {}) => {
    await getHooks(config).afterChange({
      doc,
      operation,
      previousDoc,
      req: { payload },
    })
    return payload
  }

  test('marks a linked invoice paid when a payment succeeds', async () => {
    const payload = await runAfterChange()

    expect(payload.update).toHaveBeenCalledTimes(1)
    expect(payload.update).toHaveBeenCalledWith({
      collection: 'invoices',
      id: 'inv1',
      data: { status: 'paid' },
    })
  })

  test('uses the configured invoice collection slug', async () => {
    const payload = await runAfterChange({
      config: { collections: { invoices: 'bills' } },
    })

    expect(payload.update).toHaveBeenCalledWith({
      collection: 'bills',
      id: 'inv1',
      data: { status: 'paid' },
    })
  })

  test('does not rewrite the invoice when success status is unchanged', async () => {
    const payload = await runAfterChange({
      previousDoc: { status: 'succeeded' },
    })

    expect(payload.update).not.toHaveBeenCalled()
  })

  test('extracts an invoice id from a populated relationship', async () => {
    const payload = await runAfterChange({
      doc: { id: 'pay1', invoice: { id: 'inv1' }, status: 'succeeded' },
    })

    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inv1' }),
    )
  })

  test('does nothing without a linked invoice', async () => {
    const payload = await runAfterChange({
      doc: { id: 'pay1', status: 'succeeded' },
    })

    expect(payload.update).not.toHaveBeenCalled()
  })

  test('does not reject when updating the invoice fails', async () => {
    const payload = createPayload()
    payload.update.mockRejectedValue(new Error('database unavailable'))

    await expect(runAfterChange({ payload })).resolves.toBe(payload)
  })

  test('also treats paid as a successful payment status', async () => {
    const payload = await runAfterChange({
      doc: { id: 'pay1', invoice: 'inv1', status: 'paid' },
    })

    expect(payload.update).toHaveBeenCalledTimes(1)
  })
})
