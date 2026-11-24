import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getServerUrlFromEnv, resetServerUrlWarning } from '../src/providers/serverUrl'

const ENV_KEYS = ['PAYLOAD_SERVER_URL', 'PAYLOAD_PUBLIC_SERVER_URL', 'SERVER_URL', 'NEXT_PUBLIC_SERVER_URL'] as const

let savedEnv: Record<string, string | undefined>

beforeEach(() => {
  savedEnv = {}
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
  resetServerUrlWarning()
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

describe('getServerUrlFromEnv', () => {
  it('returns undefined and does not warn when nothing is set', () => {
    const warn = vi.fn()
    expect(getServerUrlFromEnv(warn)).toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
  })

  it('checks PAYLOAD_SERVER_URL, PAYLOAD_PUBLIC_SERVER_URL, SERVER_URL, then NEXT_PUBLIC_SERVER_URL', () => {
    const warn = vi.fn()
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://next-public.example'
    process.env.SERVER_URL = 'https://server.example'
    expect(getServerUrlFromEnv(warn)).toBe('https://server.example')

    process.env.PAYLOAD_PUBLIC_SERVER_URL = 'https://payload-public.example'
    expect(getServerUrlFromEnv(warn)).toBe('https://payload-public.example')

    process.env.PAYLOAD_SERVER_URL = 'https://payload-runtime.example'
    expect(getServerUrlFromEnv(warn)).toBe('https://payload-runtime.example')

    // A runtime variable was set every time, so the build-time value was never used
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns once when it falls back to NEXT_PUBLIC_SERVER_URL', () => {
    const warn = vi.fn()
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://next-public.example'

    expect(getServerUrlFromEnv(warn)).toBe('https://next-public.example')
    expect(getServerUrlFromEnv(warn)).toBe('https://next-public.example')

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('PAYLOAD_SERVER_URL')
  })
})
