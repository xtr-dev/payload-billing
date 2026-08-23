// testProvider is what a user wires up before they have Stripe or Mollie credentials, so it is
// the first provider code that ever runs for most people, and until now none of it was tested:
// not the enabled:false contract, not initPayment's validation or the checkoutUrl it builds, not
// the four HTTP handlers onConfig registers. initPayment is synchronous and touches only its
// arguments, module state and process.env, so it needs no real payload instance or database.
// Handlers are pulled straight out of the endpoints array onConfig pushes to and called with a
// hand-built req, the same way dev/test-provider-slug.spec.ts drives /process. Run directly
// (`vitest run dev/test-provider.spec.ts`) — it needs no database.
//
// Out of scope, deliberately: the scenario-to-status mapping inside processTestPayment (the
// setTimeout-scheduled outcome of /process) needs faked timers and a real payload, which is a
// second step from the one this file covers.
import type { Payment } from '../src/plugin/types/payments'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { testProvider } from '../src/providers/test'

const ENV_KEYS = ['NEXT_PUBLIC_SERVER_URL', 'PAYLOAD_PUBLIC_SERVER_URL', 'SERVER_URL'] as const

let savedEnv: Record<string, string | undefined>

beforeEach(() => {
  savedEnv = {}
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = savedEnv[key]
    }
  }
})

function endpointsFor(provider: ReturnType<typeof testProvider>, pluginConfig: any = {}) {
  const config: any = { endpoints: [] }
  provider!.onConfig!(config, pluginConfig)
  const byPath: Record<string, any> = {}
  for (const endpoint of config.endpoints) {
    byPath[endpoint.path] = endpoint.handler
  }
  return byPath
}

describe('testProvider factory', () => {
  it('returns undefined when disabled, which is how a user turns it off in production', () => {
    expect(testProvider({ enabled: false })).toBeUndefined()
  })
})

describe('initPayment validation', () => {
  it('requires amount', () => {
    const provider = testProvider({ enabled: true })!
    expect(() => provider.initPayment(null as any, { currency: 'EUR' })).toThrow('Amount is required')
  })

  it('requires currency', () => {
    const provider = testProvider({ enabled: true })!
    expect(() => provider.initPayment(null as any, { amount: 1000 })).toThrow('Currency is required')
  })

  it('rejects a fractional amount', () => {
    const provider = testProvider({ enabled: true })!
    expect(() => provider.initPayment(null as any, { amount: 1.5, currency: 'EUR' })).toThrow(
      'Invalid amount: must be a non-negative integer within reasonable limits',
    )
  })

  it('rejects a negative amount', () => {
    const provider = testProvider({ enabled: true })!
    expect(() => provider.initPayment(null as any, { amount: -1, currency: 'EUR' })).toThrow(
      'Invalid amount: must be a non-negative integer within reasonable limits',
    )
  })

  it('rejects a currency that is not a 3-letter code', () => {
    const provider = testProvider({ enabled: true })!
    expect(() => provider.initPayment(null as any, { amount: 1000, currency: 'EURO' })).toThrow(
      'Invalid currency: must be a 3-letter ISO code',
    )
  })

  it('accepts a lowercase currency code, since isValidCurrencyCode uppercases before matching', () => {
    const provider = testProvider({ enabled: true })!
    expect(() => provider.initPayment(null as any, { amount: 1000, currency: 'eur' })).not.toThrow()
  })

  it('accepts a zero amount, since the guard is == null and isValidAmount(0) is true', () => {
    // The payments collection declares min: 1 on this same field (src/collections/payments.ts),
    // so provider and schema disagree about zero. Pinning this down here makes the provider's
    // answer documented rather than an accident of which file you happened to read.
    const provider = testProvider({ enabled: true })!
    expect(() => provider.initPayment(null as any, { amount: 0, currency: 'EUR' })).not.toThrow()
  })
})

describe('initPayment writes back', () => {
  it('sets providerId, checkoutUrl and providerData on the payment it was given', () => {
    const provider = testProvider({ enabled: true, baseUrl: 'https://shop.example' })!
    const payment: Partial<Payment> = { amount: 1999, currency: 'EUR' }
    const result = provider.initPayment(null as any, payment) as Payment

    expect(result.providerId).toMatch(/^test_pay_\d+_[a-z0-9]+$/)
    // Assigned from one variable in the source (paymentUrl) — a regression that splits them
    // would redirect the user somewhere other than where the record says.
    expect(result.checkoutUrl).toBe((result.providerData as any).raw.paymentUrl)
    expect((result.providerData as any).provider).toBe('test')
    // initPayment mutates its argument in place; the payments beforeChange hook discards
    // whatever initProviderPayment returns and relies on that mutation.
    expect(payment).toBe(result)
  })
})

describe('checkoutUrl construction', () => {
  it('uses customUiRoute directly when configured', () => {
    const provider = testProvider({ enabled: true, baseUrl: 'https://shop.example', customUiRoute: '/test-payment' })!
    const payment = provider.initPayment(null as any, { amount: 500, currency: 'EUR' }) as Payment
    expect(payment.checkoutUrl).toBe(`https://shop.example/test-payment/${payment.providerId}`)
  })

  it('falls back to the built-in /api endpoint when customUiRoute is unset', () => {
    // dev/payload.config.ts always sets customUiRoute, so this branch is otherwise never run.
    const provider = testProvider({ enabled: true, baseUrl: 'https://shop.example' })!
    const payment = provider.initPayment(null as any, { amount: 500, currency: 'EUR' }) as Payment
    expect(payment.checkoutUrl).toBe(`https://shop.example/api/payload-billing/test/payment/${payment.providerId}`)
  })
})

describe('baseUrl precedence', () => {
  it('prefers testConfig.baseUrl over every env var', () => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://next-public.example'
    process.env.PAYLOAD_PUBLIC_SERVER_URL = 'https://payload-public.example'
    process.env.SERVER_URL = 'https://server.example'
    const provider = testProvider({ enabled: true, baseUrl: 'https://config.example' })!
    const payment = provider.initPayment(null as any, { amount: 500, currency: 'EUR' }) as Payment
    expect(payment.checkoutUrl?.startsWith('https://config.example/')).toBe(true)
  })

  it('prefers NEXT_PUBLIC_SERVER_URL over the remaining env vars', () => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://next-public.example'
    process.env.PAYLOAD_PUBLIC_SERVER_URL = 'https://payload-public.example'
    process.env.SERVER_URL = 'https://server.example'
    const provider = testProvider({ enabled: true })!
    const payment = provider.initPayment(null as any, { amount: 500, currency: 'EUR' }) as Payment
    expect(payment.checkoutUrl?.startsWith('https://next-public.example/')).toBe(true)
  })

  it('prefers PAYLOAD_PUBLIC_SERVER_URL over SERVER_URL', () => {
    process.env.PAYLOAD_PUBLIC_SERVER_URL = 'https://payload-public.example'
    process.env.SERVER_URL = 'https://server.example'
    const provider = testProvider({ enabled: true })!
    const payment = provider.initPayment(null as any, { amount: 500, currency: 'EUR' }) as Payment
    expect(payment.checkoutUrl?.startsWith('https://payload-public.example/')).toBe(true)
  })

  it('falls back to SERVER_URL when it is the only one set', () => {
    process.env.SERVER_URL = 'https://server.example'
    const provider = testProvider({ enabled: true })!
    const payment = provider.initPayment(null as any, { amount: 500, currency: 'EUR' }) as Payment
    expect(payment.checkoutUrl?.startsWith('https://server.example/')).toBe(true)
  })

  it('falls back to http://localhost:3000 when nothing is set', () => {
    const provider = testProvider({ enabled: true })!
    const payment = provider.initPayment(null as any, { amount: 500, currency: 'EUR' }) as Payment
    expect(payment.checkoutUrl?.startsWith('http://localhost:3000/')).toBe(true)
  })
})

describe('/payload-billing/test/config', () => {
  it('defaults testModeIndicators to true and defaultDelay to 1000', async () => {
    const provider = testProvider({ enabled: true })!
    const { '/payload-billing/test/config': handler } = endpointsFor(provider)
    const response = await handler()
    const body = await response.json()

    expect(body.testModeIndicators).toEqual({
      showWarningBanners: true,
      showTestBadges: true,
      consoleWarnings: true,
    })
    expect(body.defaultDelay).toBe(1000)
  })

  it('lets showWarningBanners: false survive, which ?? permits and || would silently flip back to true', async () => {
    const provider = testProvider({ enabled: true, testModeIndicators: { showWarningBanners: false } })!
    const { '/payload-billing/test/config': handler } = endpointsFor(provider)
    const response = await handler()
    const body = await response.json()

    expect(body.testModeIndicators.showWarningBanners).toBe(false)
  })
})

describe('/payload-billing/test/status/:id and /payload-billing/test/payment/:id', () => {
  it('status: returns 404 for an unknown but well-formed id', async () => {
    const provider = testProvider({ enabled: true })!
    const { '/payload-billing/test/status/:id': handler } = endpointsFor(provider)
    const response = await handler({ url: '/api/payload-billing/test/status/test_pay_unknown' } as any)
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe('Payment session not found')
  })

  it('status: returns 400 for an id missing the test_pay_ prefix', async () => {
    const provider = testProvider({ enabled: true })!
    const { '/payload-billing/test/status/:id': handler } = endpointsFor(provider)
    const response = await handler({ url: '/api/payload-billing/test/status/pay_123' } as any)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Invalid payment ID format')
  })

  it('payment: returns 404 for an unknown but well-formed id', async () => {
    const provider = testProvider({ enabled: true })!
    const { '/payload-billing/test/payment/:id': handler } = endpointsFor(provider)
    const response = await handler({ url: '/api/payload-billing/test/payment/test_pay_unknown' } as any)
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe('Payment session not found')
  })

  it('payment: returns 400 for an id missing the test_pay_ prefix', async () => {
    const provider = testProvider({ enabled: true })!
    const { '/payload-billing/test/payment/:id': handler } = endpointsFor(provider)
    const response = await handler({ url: '/api/payload-billing/test/payment/pay_123' } as any)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Invalid payment ID format')
  })

  it('status: strips the query string before looking up the session', async () => {
    // The status handler extracts the id by splitting the raw URL on '/' then on '?'
    // (test.ts around the status handler). A well-formed-but-unknown id would 404 whether
    // or not the query string was stripped, so this drives a real session through instead —
    // only correct stripping finds it.
    const provider = testProvider({ enabled: true })!
    const { '/payload-billing/test/status/:id': statusHandler } = endpointsFor(provider)
    const payment = provider.initPayment(null as any, { amount: 500, currency: 'EUR' }) as Payment

    const response = await statusHandler({
      url: `/api/payload-billing/test/status/${payment.providerId}?foo=bar`,
    } as any)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('pending')
  })

  it('payment: strips the query string before looking up the session', async () => {
    // /payment/:id copies the same split-on-'/' then split-on-'?' extraction (test.ts around
    // the payment handler, not a shared helper). Its 404 for a well-formed unknown id still
    // 404s if '?foo=bar' is left on, because validatePaymentId only checks the test_pay_
    // prefix. A real session looked up as `${providerId}?foo=bar` is the matching pin —
    // only correct stripping finds it and returns the HTML checkout page.
    const provider = testProvider({ enabled: true })!
    const { '/payload-billing/test/payment/:id': paymentHandler } = endpointsFor(provider)
    const payment = provider.initPayment(null as any, { amount: 500, currency: 'EUR' }) as Payment

    const response = await paymentHandler({
      url: `/api/payload-billing/test/payment/${payment.providerId}?foo=bar`,
    } as any)
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/html')
    expect(html).toContain(`paymentId: '${payment.providerId}'`)
    expect(html).not.toContain(`${payment.providerId}?foo=bar`)
  })
})

describe('/payload-billing/test/process', () => {
  function fakePayload() {
    return {
      find: async () => ({ docs: [] }),
      update: async () => ({}),
    } as any
  }

  it('rejects a non-object body', async () => {
    const provider = testProvider({ enabled: true })!
    const { '/payload-billing/test/process': handler } = endpointsFor(provider)
    const response = await handler({ payload: fakePayload(), json: async () => 'not-an-object' } as any)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Request body must be a valid JSON object')
  })

  it('rejects a missing paymentId', async () => {
    const provider = testProvider({ enabled: true })!
    const { '/payload-billing/test/process': handler } = endpointsFor(provider)
    const response = await handler({
      payload: fakePayload(),
      json: async () => ({ scenarioId: 'instant-success', method: 'ideal' }),
    } as any)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('paymentId is required and must be a string')
  })

  it('rejects a missing scenarioId', async () => {
    const provider = testProvider({ enabled: true })!
    const { '/payload-billing/test/process': handler } = endpointsFor(provider)
    const response = await handler({
      payload: fakePayload(),
      json: async () => ({ paymentId: 'test_pay_1', method: 'ideal' }),
    } as any)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('scenarioId is required and must be a string')
  })

  it('rejects a missing method', async () => {
    const provider = testProvider({ enabled: true })!
    const { '/payload-billing/test/process': handler } = endpointsFor(provider)
    const response = await handler({
      payload: fakePayload(),
      json: async () => ({ paymentId: 'test_pay_1', scenarioId: 'instant-success' }),
    } as any)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('method is required and must be a string')
  })

  it('rejects a method outside the five valid payment methods', async () => {
    const provider = testProvider({ enabled: true })!
    const { '/payload-billing/test/process': handler } = endpointsFor(provider)
    const response = await handler({
      payload: fakePayload(),
      json: async () => ({ paymentId: 'test_pay_1', scenarioId: 'instant-success', method: 'bitcoin' }),
    } as any)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('method must be one of: ideal, creditcard, paypal, applepay, banktransfer')
  })

  it('rejects an unknown scenarioId for an existing session', async () => {
    const provider = testProvider({ enabled: true })!
    const { '/payload-billing/test/process': handler } = endpointsFor(provider)
    const payment = provider.initPayment(null as any, { amount: 500, currency: 'EUR' }) as Payment

    const response = await handler({
      payload: fakePayload(),
      json: async () => ({ paymentId: payment.providerId, scenarioId: 'nope', method: 'ideal' }),
    } as any)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Invalid scenario ID')
  })

  it('accepts a valid scenario, returning the scenario delay', async () => {
    const provider = testProvider({
      enabled: true,
      scenarios: [{ id: 'quick', name: 'Quick', description: 'quick', outcome: 'paid', delay: 5 }],
    })!
    const { '/payload-billing/test/process': handler } = endpointsFor(provider)
    const payment = provider.initPayment(null as any, { amount: 500, currency: 'EUR' }) as Payment

    // Gives processTestPayment a matching doc to update once its setTimeout fires, so the
    // background run this schedules settles cleanly instead of logging a "not found" error.
    const paymentDoc = { id: 1, providerId: payment.providerId, status: 'pending' }
    const payloadForTimer = {
      find: async () => ({ docs: [paymentDoc] }),
      update: async ({ data }: any) => Object.assign(paymentDoc, data),
    } as any

    const response = await handler({
      payload: payloadForTimer,
      json: async () => ({ paymentId: payment.providerId, scenarioId: 'quick', method: 'ideal' }),
    } as any)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ success: true, status: 'processing', delay: 5 })

    // Let the scheduled processTestPayment settle so no timer is left pending when this test
    // (or the file) finishes.
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
})
