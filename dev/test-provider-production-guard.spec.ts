import { afterEach, describe, expect, test, vi } from 'vitest'

import { testProvider } from '../src/providers/test.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('testProvider production guard', () => {
  test('throws when enabled with NODE_ENV=production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => testProvider({ enabled: true })).toThrow(/production/i)
  })

  test('registers normally when enabled outside production', () => {
    vi.stubEnv('NODE_ENV', 'test')
    const provider = testProvider({ enabled: true })
    expect(provider?.key).toBe('test')
  })

  test('returns undefined when disabled, even in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(testProvider({ enabled: false })).toBeUndefined()
  })
})
