import type { Payload } from 'payload'
import { pino } from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const LOG_LEVEL_ENV = 'PAYLOAD_BILLING_LOG_LEVEL'
const ORIGINAL_LOG_LEVEL = process.env[LOG_LEVEL_ENV]
const PLUGIN_BINDINGS = { plugin: '@xtr-dev/payload-billing' }

function makeSink() {
  const lines: Array<Record<string, unknown>> = []
  const stream = {
    write(line: string) {
      lines.push(JSON.parse(line))
    },
    flush() {},
  }
  return { lines, stream }
}

// Builds a fake host Payload whose logger.child is a REAL pino child creator,
// bound to a pino parent running at `hostLevel` (Payload's own logger is a pino
// instance, typically at info). pino's child(bindings, options) takes the
// child's level from the second argument and ignores a `level` key inside the
// bindings, so asserting which records actually reach the sink pins the
// contract that PAYLOAD_BILLING_LOG_LEVEL sets verbosity rather than a field.
function hostPayload(hostLevel: string) {
  const { lines, stream } = makeSink()
  const host = pino({ level: hostLevel }, stream)
  const childSpy = vi.fn(host.child.bind(host))
  const payload = { logger: { child: childSpy } } as unknown as Payload
  return { lines, payload, childSpy }
}

describe('getPluginLogger / createContextLogger log level', () => {
  beforeEach(() => {
    // getPluginLogger caches the child logger in module state, so each case
    // re-imports the module through a fresh registry.
    vi.resetModules()
  })

  afterEach(() => {
    if (ORIGINAL_LOG_LEVEL === undefined) {
      delete process.env[LOG_LEVEL_ENV]
    } else {
      process.env[LOG_LEVEL_ENV] = ORIGINAL_LOG_LEVEL
    }
  })

  it('emits a debug line when PAYLOAD_BILLING_LOG_LEVEL=debug even though the host logs at info', async () => {
    process.env[LOG_LEVEL_ENV] = 'debug'
    const { lines, payload, childSpy } = hostPayload('info')
    const { createContextLogger } = await import('../src/utils/logger')

    createContextLogger(payload, 'Payment Update').debug('Transactions not supported')

    expect(childSpy).toHaveBeenCalledWith(PLUGIN_BINDINGS, { level: 'debug' })

    const debugLine = lines.find((line) => line.msg === '[Payment Update] Transactions not supported')
    expect(debugLine).toBeDefined()
    expect(debugLine).toMatchObject({
      level: 20,
      plugin: '@xtr-dev/payload-billing',
    })
  })

  it('drops debug lines when PAYLOAD_BILLING_LOG_LEVEL is unset, so the child inherits the host level', async () => {
    delete process.env[LOG_LEVEL_ENV]
    const { lines, payload, childSpy } = hostPayload('info')
    const { createContextLogger } = await import('../src/utils/logger')

    createContextLogger(payload, 'Payment Update').debug('Transactions not supported')

    expect(childSpy).toHaveBeenCalledWith(PLUGIN_BINDINGS, { level: 'info' })
    expect(lines.some((line) => line.msg === '[Payment Update] Transactions not supported')).toBe(false)
  })

  it('silences info lines when PAYLOAD_BILLING_LOG_LEVEL=error', async () => {
    process.env[LOG_LEVEL_ENV] = 'error'
    const { lines, payload, childSpy } = hostPayload('info')
    const { createContextLogger } = await import('../src/utils/logger')

    createContextLogger(payload, 'Invoices Collection').info('Invoice created')

    expect(childSpy).toHaveBeenCalledWith(PLUGIN_BINDINGS, { level: 'error' })
    expect(lines.some((line) => line.msg === '[Invoices Collection] Invoice created')).toBe(false)
  })
})