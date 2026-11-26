import type { PayloadRequest, TaskConfig } from 'payload'
import type { BillingPluginConfig } from './config'
import type { Refund } from './types/index'
import * as core from '../providers/refunds'

/** Payload jobs task that sends one reserved refund to the provider (`processRefund`). */
export const REFUND_TASK_SLUG = 'billingProcessRefund'
/** Payload jobs task that runs `processPendingRefunds` and then `syncOpenRefunds`. */
export const REFUND_SWEEP_TASK_SLUG = 'billingRefundSweep'

/**
 * `req.context` key that stops the refunds collection from queueing a refund job, set by
 * `refundPayment`, which sends the refund itself right after creating it.
 */
export const SKIP_REFUND_JOB_CONTEXT = 'payloadBillingSkipRefundJob'

export interface RefundJobsConfig {
  /** Jobs queue both tasks run in. Default `'default'`. */
  queue?: string
  /**
   * Cron for the sweep task, which retries refunds left `pending` (e.g. by a network error) and
   * polls refunds the provider is still processing. `false` registers the task unscheduled.
   * Default every 5 minutes.
   */
  sweepSchedule?: false | string
}

export const resolveRefundJobs = (
  pluginConfig: BillingPluginConfig,
): null | Required<RefundJobsConfig> => {
  const option = pluginConfig.refundJobs
  if (!option) {
    return null
  }
  const settings = option === true ? {} : option
  return {
    queue: settings.queue ?? 'default',
    sweepSchedule: settings.sweepSchedule ?? '*/5 * * * *',
  }
}

type RefundTask = TaskConfig<{
  input: { refundId: Refund['id'] }
  output: { status?: Refund['status'] }
}>
type SweepTask = TaskConfig<{ input: object; output: { processed?: number } }>

export function createRefundTasks(
  pluginConfig: BillingPluginConfig,
): TaskConfig<any>[] {
  const jobs = resolveRefundJobs(pluginConfig)
  if (!jobs) {
    return []
  }
  const processTask: RefundTask = {
    slug: REFUND_TASK_SLUG,
    handler: async ({ input, req }) => {
      // A disabled plugin keeps its tasks registered (so the jobs schema stays) but sends nothing
      if (pluginConfig.disabled) {
        return { output: {} }
      }
      const refund = await core.processRefund(
        req.payload,
        pluginConfig,
        input.refundId,
      )
      return { output: { status: refund.status } }
    },
    // json keeps the id's type (number on SQL adapters, string on MongoDB)
    inputSchema: [{ name: 'refundId', type: 'json', required: true }],
    label: 'Billing: send refund to provider',
    outputSchema: [{ name: 'status', type: 'text' }],
  }
  const sweepTask: SweepTask = {
    slug: REFUND_SWEEP_TASK_SLUG,
    handler: async ({ req }) => {
      if (pluginConfig.disabled) {
        return { output: {} }
      }
      const processed = await core.processPendingRefunds(
        req.payload,
        pluginConfig,
      )
      await core.syncOpenRefunds(req.payload, pluginConfig)
      return { output: { processed: processed.length } }
    },
    label: 'Billing: send pending refunds and poll open ones',
    outputSchema: [{ name: 'processed', type: 'number' }],
    ...(jobs.sweepSchedule && !pluginConfig.disabled
      ? { schedule: [{ cron: jobs.sweepSchedule, queue: jobs.queue }] }
      : {}),
  }
  return [processTask, sweepTask]
}

/**
 * Queue the job that sends `refund` to the provider, when refund jobs are enabled and the
 * refund is a reservation the plugin should send. Passing `req` writes the job in the same
 * transaction as the refund, so the job exists exactly when the reservation has committed,
 * which `processRefund`'s verify step relies on.
 */
export async function queueRefundJob(
  req: PayloadRequest,
  pluginConfig: BillingPluginConfig,
  refund: Refund,
): Promise<void> {
  const jobs = resolveRefundJobs(pluginConfig)
  if (!jobs || req.context?.[SKIP_REFUND_JOB_CONTEXT]) {
    return
  }
  if (refund.providerId || refund.status !== 'pending' || refund.manual) {
    return
  }
  await req.payload.jobs.queue({
    input: { refundId: refund.id },
    queue: jobs.queue,
    req,
    task: REFUND_TASK_SLUG as never,
  } as never)
}
