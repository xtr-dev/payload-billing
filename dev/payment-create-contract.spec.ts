import type { Payload } from 'payload'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import os from 'node:os'
import path from 'node:path'
import { buildConfig, getPayload } from 'payload'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Payment } from '../src/index'
import billingPlugin from '../src/plugin'
import { testProvider } from '../src/providers'
import { testEmailAdapter } from './helpers/testEmailAdapter'

const dirname = path.dirname(fileURLToPath(import.meta.url))
// Own sqlite so a parallel getPayload spec cannot SQLITE_BUSY this file.
const sqlitePath = path.join(
  os.tmpdir(),
  `payload-billing-payment-create-contract-${process.pid}.sqlite`,
)

if (!process.env.ROOT_DIR) {
  process.env.ROOT_DIR = dirname
}

let payload: Payload
let createBeforeInitError: unknown

beforeAll(async () => {
  const config = await buildConfig({
    collections: [],
    db: sqliteAdapter({
      client: {
        url: `file:${sqlitePath}`,
      },
    }),
    email: testEmailAdapter,
    graphQL: {
      disable: true,
    },
    // Host onInit runs before billingPlugin stores providers on the payload instance.
    onInit: async (initPayload) => {
      try {
        await initPayload.create({
          collection: 'payments',
          data: {
            provider: 'test',
            amount: 5000,
            currency: 'USD',
            description: 'before-init',
            status: 'pending',
          } as any,
        })
      } catch (error) {
        createBeforeInitError = error
      }
    },
    plugins: [
      billingPlugin({
        providers: [testProvider({ enabled: true })],
      }),
    ],
    secret: 'test-secret_key',
    typescript: {
      autoGenerate: false,
    },
  })

  payload = await getPayload({ config })
})

afterAll(async () => {
  await payload.db.destroy?.()
})

describe('billingPlugin + testProvider payment create', () => {
  test('stores the integer amount as given and uppercases currency', async () => {
    const payment = (await payload.create({
      collection: 'payments',
      data: {
        provider: 'test',
        amount: 5000,
        currency: 'usd',
        description: 'x',
        status: 'pending',
      } as any,
    })) as unknown as Payment

    expect(payment.amount).toBe(5000)
    expect(Number.isInteger(payment.amount)).toBe(true)
    expect(payment.currency).toBe('USD')
    expect(payment.providerId).toMatch(/^test_pay_/)
    expect(typeof payment.checkoutUrl).toBe('string')
    expect(payment.checkoutUrl?.length).toBeGreaterThan(0)
    expect(payment.status).toBe('pending')
  })

  test('refuses a create with no currency rather than storing a defaulted code', async () => {
    await expect(
      payload.create({
        collection: 'payments',
        data: {
          provider: 'test',
          amount: 424242,
          description: 'no-currency',
          status: 'pending',
        } as any,
      }),
    ).rejects.toThrow(/required|currency/i)

    const stored = await payload.find({
      collection: 'payments',
      where: {
        amount: {
          equals: 424242,
        },
      },
    })
    expect(stored.totalDocs).toBe(0)
  })

  test('creating a payment before onInit throws Billing plugin not initialized', async () => {
    expect(createBeforeInitError).toBeInstanceOf(Error)
    expect((createBeforeInitError as Error).message).toMatch(/Billing plugin not initialized/)

    const stored = await payload.find({
      collection: 'payments',
      where: {
        description: {
          equals: 'before-init',
        },
      },
    })
    expect(stored.totalDocs).toBe(0)
  })
})
