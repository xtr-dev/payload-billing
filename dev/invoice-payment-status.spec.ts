import { beforeEach, describe, expect, test, vi } from 'vitest'

import { createInvoicesCollection } from '../src/collections/invoices'

const createPayload = () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }

  return {
    findByID: vi.fn(),
    logger: {
      child: vi.fn(() => logger),
    },
    update: vi.fn(),
  } as any
}

describe('invoice afterChange payment settlement', () => {
  const hook = createInvoicesCollection({}).hooks!.afterChange![0] as any

  const runHook = async (paymentStatus: string) => {
    const payload = createPayload()
    payload.findByID.mockResolvedValue({ id: 'pay1', status: paymentStatus })

    await hook({
      doc: { id: 'inv1', payment: 'pay1', status: 'paid' },
      operation: 'update',
      previousDoc: { status: 'open' },
      req: { payload },
    })

    return payload
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test.each(['succeeded', 'failed', 'canceled', 'refunded', 'partially_refunded'])(
    'preserves a provider-reported %s payment',
    async (paymentStatus) => {
      const payload = await runHook(paymentStatus)

      expect(payload.update).not.toHaveBeenCalled()
    },
  )

  test.each(['pending', 'processing'])('settles a %s payment', async (paymentStatus) => {
    const payload = await runHook(paymentStatus)

    expect(payload.update).toHaveBeenCalledWith({
      collection: 'payments',
      id: 'pay1',
      data: { status: 'succeeded' },
    })
  })
})
