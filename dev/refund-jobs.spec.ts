// The refundJobs option: a refund created outside refundPayment (admin panel, REST, a Local API
// create) used to stay a `pending` reservation until the host ran processRefund or a sweep
// itself. With refundJobs on, that create queues a Payload job that sends it, refundPayment
// (which sends the refund itself) queues none, and a scheduled sweep task retries the rest.
// Own sqlite so a parallel getPayload spec cannot SQLITE_BUSY this file.
import type { Config, Payload } from 'payload'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildConfig, getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Payment, Refund } from '../src/index'

import {
  REFUND_SWEEP_TASK_SLUG,
  REFUND_TASK_SLUG,
  billingPlugin,
  refundPayment,
} from '../src/index'
import { testProvider } from '../src/providers'
import { testEmailAdapter } from './helpers/testEmailAdapter'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const sqlitePath = path.join(
  os.tmpdir(),
  `payload-billing-refund-jobs-${process.pid}.sqlite`,
)

if (!process.env.ROOT_DIR) {
  process.env.ROOT_DIR = dirname
}

const emptyConfig = (): Config => ({ collections: [] }) as unknown as Config

describe('refundJobs config', () => {
  test('registers no jobs unless enabled', () => {
    expect(billingPlugin({})(emptyConfig()).jobs).toBeUndefined()
  })

  test('registers the refund task and a sweep scheduled every 5 minutes on the default queue', () => {
    const tasks = billingPlugin({ refundJobs: true })(emptyConfig()).jobs?.tasks
    expect(tasks?.map((task) => task.slug)).toEqual([
      REFUND_TASK_SLUG,
      REFUND_SWEEP_TASK_SLUG,
    ])
    expect(tasks?.[1].schedule).toEqual([
      { cron: '*/5 * * * *', queue: 'default' },
    ])
  })

  test('takes a queue and sweep schedule, or no schedule, and keeps tasks the host already has', () => {
    const config = emptyConfig()
    config.jobs = { tasks: [{ slug: 'hostTask', handler: () => ({ output: {} }) }] }
    const tasks = billingPlugin({
      refundJobs: { queue: 'billing', sweepSchedule: '0 * * * *' },
    })(config).jobs?.tasks
    expect(tasks?.map((task) => task.slug)).toEqual([
      'hostTask',
      REFUND_TASK_SLUG,
      REFUND_SWEEP_TASK_SLUG,
    ])
    expect(tasks?.[2].schedule).toEqual([{ cron: '0 * * * *', queue: 'billing' }])

    const unscheduled = billingPlugin({ refundJobs: { sweepSchedule: false } })(
      emptyConfig(),
    ).jobs?.tasks
    expect(unscheduled?.[1].schedule).toBeUndefined()
  })

  test('a disabled plugin keeps the tasks registered (schema stays) but unscheduled', () => {
    const tasks = billingPlugin({ disabled: true, refundJobs: true })(
      emptyConfig(),
    ).jobs?.tasks
    expect(tasks?.map((task) => task.slug)).toEqual([
      REFUND_TASK_SLUG,
      REFUND_SWEEP_TASK_SLUG,
    ])
    expect(tasks?.[1].schedule).toBeUndefined()
  })
})

describe('refunds sent through the jobs queue', () => {
  let payload: Payload

  beforeAll(async () => {
    const config = await buildConfig({
      db: sqliteAdapter({ client: { url: `file:${sqlitePath}` } }),
      email: testEmailAdapter,
      graphQL: { disable: true },
      plugins: [
        billingPlugin({
          providers: [testProvider({ enabled: true })],
          refundJobs: true,
        }),
      ],
      secret: 'test-secret_key',
      typescript: { autoGenerate: false },
    })
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    try {
      await payload.db.destroy?.()
    } finally {
      await Promise.all([
        rm(sqlitePath, { force: true }),
        rm(`${sqlitePath}-wal`, { force: true }),
        rm(`${sqlitePath}-shm`, { force: true }),
      ])
    }
  })

  const paidPayment = async (amount = 5000) => {
    const created = (await payload.create({
      collection: 'payments',
      data: { amount, currency: 'EUR', provider: 'test' } as any,
    })) as unknown as Payment
    return (await payload.update({
      id: created.id,
      collection: 'payments',
      data: { status: 'succeeded' } as any,
    })) as unknown as Payment
  }

  const refundJobsFor = async (refundId: Refund['id']) =>
    (
      await payload.find({
        collection: 'payload-jobs' as any,
        pagination: false,
        where: { taskSlug: { equals: REFUND_TASK_SLUG } },
      })
    ).docs.filter((job: any) => String(job.input?.refundId) === String(refundId))

  const reload = async (refundId: Refund['id']) =>
    (await payload.findByID({
      id: refundId,
      collection: 'refunds',
      depth: 0,
    })) as unknown as Refund

  test('a refund created like the admin panel does is queued, and running the queue sends it', async () => {
    const payment = await paidPayment()
    const reserved = (await payload.create({
      collection: 'refunds',
      data: { amount: 2000, currency: 'EUR', payment: payment.id } as any,
    })) as unknown as Refund
    expect(reserved.status).toBe('pending')
    expect(reserved.providerId).toBeFalsy()
    expect(await refundJobsFor(reserved.id)).toHaveLength(1)

    await payload.jobs.run({ queue: 'default' })

    const sent = await reload(reserved.id)
    expect(sent.providerId).toMatch(/^test_re_/)
    expect(sent.status).toBe('succeeded')
    const reloadedPayment = (await payload.findByID({
      id: payment.id,
      collection: 'payments',
      depth: 0,
    })) as unknown as Payment
    expect(reloadedPayment.status).toBe('partially_refunded')
  })

  test('the queued job still runs the over-refund check before calling the provider', async () => {
    const payment = await paidPayment(1000)
    const queued = (await payload.create({
      collection: 'refunds',
      data: { amount: 1000, currency: 'EUR', payment: payment.id } as any,
    })) as unknown as Refund
    // A competing refund reserves the whole payment after the create-time check passed
    // (written below the hooks, as a concurrent request would have committed it)
    await payload.db.create({
      collection: 'refunds',
      data: {
        amount: 1000,
        currency: 'EUR',
        payment: payment.id,
        providerId: `re_competing_${payment.id}`,
        status: 'processing',
      },
    })

    await payload.jobs.run({ queue: 'default' })

    const verified = await reload(queued.id)
    expect(verified.status).toBe('failed')
    expect(verified.providerId).toBeFalsy()
    expect(verified.failureReason).toMatch(/Exceeds the refundable amount/)
  })

  test('refundPayment sends the refund itself and queues no job', async () => {
    const payment = await paidPayment()
    const refund = await refundPayment(payload, { amount: 1000, paymentId: payment.id })
    expect(refund.status).toBe('succeeded')
    expect(await refundJobsFor(refund.id)).toHaveLength(0)
  })

  test('recorded (providerId) and manual refunds are not queued; clearing manual queues it', async () => {
    const payment = await paidPayment()
    const recorded = (await payload.create({
      collection: 'refunds',
      data: {
        amount: 500,
        currency: 'EUR',
        payment: payment.id,
        providerId: `re_recorded_${payment.id}`,
        status: 'succeeded',
      } as any,
    })) as unknown as Refund
    expect(await refundJobsFor(recorded.id)).toHaveLength(0)

    const manual = (await payload.create({
      collection: 'refunds',
      data: { amount: 500, currency: 'EUR', manual: true, payment: payment.id } as any,
    })) as unknown as Refund
    expect(await refundJobsFor(manual.id)).toHaveLength(0)

    await payload.update({ id: manual.id, collection: 'refunds', data: { manual: false } as any })
    expect(await refundJobsFor(manual.id)).toHaveLength(1)

    await payload.jobs.run({ queue: 'default' })
    expect((await reload(manual.id)).status).toBe('succeeded')
  })

  test('the sweep task sends a pending refund whose job is gone', async () => {
    const payment = await paidPayment()
    const reserved = (await payload.create({
      collection: 'refunds',
      data: { amount: 700, currency: 'EUR', payment: payment.id } as any,
    })) as unknown as Refund
    await payload.delete({
      collection: 'payload-jobs' as any,
      where: { taskSlug: { equals: REFUND_TASK_SLUG } },
    })

    await payload.jobs.queue({ input: {}, task: REFUND_SWEEP_TASK_SLUG as never } as never)
    await payload.jobs.run({ queue: 'default' })

    const sent = await reload(reserved.id)
    expect(sent.status).toBe('succeeded')
    expect(sent.providerId).toMatch(/^test_re_/)
  })
})
