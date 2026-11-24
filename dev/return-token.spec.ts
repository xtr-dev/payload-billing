import type { Payload } from 'payload'
import type { Payment } from '../src/plugin/types/payments'

import { rm } from 'fs/promises'

import config, { vitestSqlitePath } from '@payload-config'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { testProvider } from '../src/providers/test'
import { fillReturnToken, generateReturnToken } from '../src/utils/returnToken'

let payload: Payload

afterAll(async () => {
  await payload.db.destroy?.()
  await rm(`${vitestSqlitePath()}`, { force: true })
  await rm(`${vitestSqlitePath()}-wal`, { force: true })
  await rm(`${vitestSqlitePath()}-shm`, { force: true })
})

beforeAll(async () => {
  payload = await getPayload({ config })
})

describe('fillReturnToken', () => {
  test('replaces every {returnToken} with the payment token', () => {
    expect(fillReturnToken('https://shop.example/thanks/{returnToken}?t={returnToken}', { returnToken: 'abc' }))
      .toBe('https://shop.example/thanks/abc?t=abc')
  })

  test('leaves the URL alone without a placeholder or without a token', () => {
    expect(fillReturnToken('https://shop.example/thanks', { returnToken: 'abc' })).toBe('https://shop.example/thanks')
    expect(fillReturnToken('https://shop.example/{returnToken}', {})).toBe('https://shop.example/{returnToken}')
    expect(fillReturnToken(undefined, { returnToken: 'abc' })).toBeUndefined()
  })

  test('generates distinct 32-character hex tokens', () => {
    const a = generateReturnToken()
    const b = generateReturnToken()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(a).not.toBe(b)
  })
})

describe('returnToken on payment create', () => {
  test('sets a token and puts it in the redirect URL before the provider sees it', async () => {
    const payment = (await payload.create({
      collection: 'payments',
      data: {
        amount: 1500,
        currency: 'EUR',
        provider: 'test',
        redirectUrl: 'https://shop.example/thanks?t={returnToken}',
      } as any,
    })) as unknown as Payment

    expect(payment.returnToken).toMatch(/^[0-9a-f]{32}$/)
    expect(payment.redirectUrl).toBe(`https://shop.example/thanks?t=${payment.returnToken}`)

    // What a host's return page does with the token from the URL
    const found = await payload.find({
      collection: 'payments',
      where: { returnToken: { equals: payment.returnToken } },
    })
    expect(found.docs.map((doc) => doc.id)).toEqual([payment.id])
  })

  test('sets a token even without a redirect URL', async () => {
    const payment = (await payload.create({
      collection: 'payments',
      data: { amount: 1500, currency: 'EUR', provider: 'test' } as any,
    })) as unknown as Payment

    expect(payment.returnToken).toMatch(/^[0-9a-f]{32}$/)
  })
})

test('the test provider fills {returnToken} in its configured returnUrl', async () => {
  const provider = testProvider({
    enabled: true,
    baseUrl: 'https://shop.example',
    returnUrl: '/thanks/{returnToken}',
  })!
  const payment: any = { amount: 1234, currency: 'EUR', returnToken: 'tok123' }
  await provider.initPayment(null as any, payment)

  const endpointConfig: any = { endpoints: [] }
  provider.onConfig!(endpointConfig, {} as any)
  const uiEndpoint = endpointConfig.endpoints.find((e: any) => e.path === '/payload-billing/test/payment/:id')
  const res: Response = await uiEndpoint.handler({ url: `/api/payload-billing/test/payment/${payment.providerId}` })
  const html = await res.text()

  expect(html).toContain('https://shop.example/thanks/tok123')
  expect(html).not.toContain('{returnToken}')
})
