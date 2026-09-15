import type { Config, Payload } from 'payload'
import { describe, expect, test } from 'vitest'

import billingPlugin from '../src/plugin'

// billingPlugin only touches the parts of Config and Payload it reads or
// writes, so a plain object literal stands in for both - no Payload
// instance and no database needed for these tests.
const makeConfig = (overrides: Partial<Config> = {}): Config =>
  ({ collections: [], ...overrides }) as Config

describe('billingPlugin onInit chaining', () => {
  test("preserves and awaits a pre-existing config.onInit before the plugin's own onInit work", async () => {
    const calls: string[] = []
    const baseConfig = makeConfig({
      onInit: async () => {
        // Forces a microtask suspension so the test can tell an awaited
        // incomingOnInit apart from a fire-and-forget call: without this
        // yield, both orderings produce the same synchronous call sequence
        // regardless of whether src/plugin/index.ts awaits the promise.
        await Promise.resolve()
        calls.push('host')
      },
    })

    const result = billingPlugin({
      providers: [
        {
          key: 'p',
          onInit: async () => {
            calls.push('provider')
          },
          initPayment: () => ({}),
        },
      ],
    })(baseConfig)

    await result.onInit!({} as Payload)

    expect(calls).toEqual(['host', 'provider'])
  })

  test('does not throw when the incoming config has no onInit', async () => {
    const baseConfig = makeConfig()

    const result = billingPlugin()(baseConfig)

    await expect(result.onInit!({} as Payload)).resolves.not.toThrow()
  })
})
