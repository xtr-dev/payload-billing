// The Mollie provider builds its webhook URL from the environment only when no webhookUrl is
// configured, and only then may it log the NEXT_PUBLIC_SERVER_URL warning.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const client = { payments: { create: vi.fn() } }
vi.mock('@mollie/api-client', () => ({ default: () => client }))

import { mollieProvider } from '../src/providers/mollie'
import { resetServerUrlWarning } from '../src/providers/serverUrl'

const ENV_KEYS = ['PAYLOAD_SERVER_URL', 'PAYLOAD_PUBLIC_SERVER_URL', 'SERVER_URL', 'NEXT_PUBLIC_SERVER_URL'] as const
let savedEnv: Record<string, string | undefined>
const warn = vi.fn()
// The plugin logger is a child of payload.logger; capture its warnings
const payload: any = { logger: { child: () => ({ debug() {}, error() {}, info() {}, warn }) } }

beforeEach(() => {
  vi.clearAllMocks()
  resetServerUrlWarning()
  savedEnv = {}
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
  client.payments.create.mockResolvedValue({ id: 'tr_1', _links: { checkout: { href: 'https://mollie.example/c' } } })
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

async function createPayment(config: { webhookUrl?: string }) {
  const provider = mollieProvider({ apiKey: 'test_key', redirectUrl: 'https://shop.example/thanks', ...config })
  await provider.onInit(payload)
  await provider.initPayment(payload, { amount: 1000, currency: 'EUR' } as any)
  return client.payments.create.mock.calls[0]?.[0]
}

describe('Mollie webhook URL', () => {
  test('a configured webhookUrl is used and NEXT_PUBLIC_SERVER_URL is not read', async () => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://build-time.example'
    const request = await createPayment({ webhookUrl: 'https://shop.example/hook' })
    expect(request.webhookUrl).toBe('https://shop.example/hook')
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('NEXT_PUBLIC_SERVER_URL'))
  })

  test('without webhookUrl, a runtime variable wins over NEXT_PUBLIC_SERVER_URL', async () => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://build-time.example'
    process.env.PAYLOAD_SERVER_URL = 'https://runtime.example'
    const request = await createPayment({})
    expect(request.webhookUrl).toBe('https://runtime.example/api/payload-billing/mollie/webhook')
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('NEXT_PUBLIC_SERVER_URL'))
  })

  test('without webhookUrl, falling back to NEXT_PUBLIC_SERVER_URL logs a warning', async () => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://build-time.example'
    const request = await createPayment({})
    expect(request.webhookUrl).toBe('https://build-time.example/api/payload-billing/mollie/webhook')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('NEXT_PUBLIC_SERVER_URL'))
  })
})
