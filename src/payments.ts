import type { Payload } from 'payload'
import type { Payment } from './plugin/types/payments'
import { defaults } from './plugin/config'
import { extractSlug, toPayloadId } from './plugin/utils'
import { getProvider } from './providers/refunds'
import { billing } from './refunds'
import { createContextLogger } from './utils/logger'

/**
 * Fetch a payment's current state from its provider and apply it through the same code path
 * as the provider's webhook: the status update (with its version check and refund-status
 * guard), the invoice update on success and the refund sync. Meant for reconciling payments
 * whose webhook never arrived, from a cron job or a thank-you page recheck.
 *
 * Returns the payment as stored afterwards. That payment may be unchanged: when the status
 * write was refused (a concurrent webhook won the version check, or the payment had already
 * settled), a warning is logged and the stored payment is returned as it is. Compare its
 * status with what you expected rather than treating a resolved promise as "reconciled".
 *
 * Safe to run next to the webhook: the status write is version-checked, marking the invoice
 * paid is idempotent, and refunds are matched by their provider refund id.
 *
 * Throws when the payment does not exist, has no provider payment id yet, or its provider
 * does not support syncing (currently only Mollie does).
 */
export async function syncPaymentFromProvider(payload: Payload, paymentId: Payment['id']): Promise<Payment> {
  const pluginConfig = billing(payload)
  const paymentsSlug = extractSlug(pluginConfig.collections?.payments, defaults.paymentsCollection)
  const load = async () =>
    (await payload.findByID({ collection: paymentsSlug, depth: 0, id: toPayloadId(paymentId) })) as Payment

  const payment = await load()
  if (!payment.providerId) {
    throw new Error(`Payment ${payment.id} has no provider payment id yet; nothing to sync`)
  }
  const provider = getProvider(pluginConfig, payment.provider)
  if (!provider?.syncPayment) {
    throw new Error(`Provider "${payment.provider}" does not support syncing a payment`)
  }
  const updated = await provider.syncPayment(payload, pluginConfig, payment)
  if (!updated) {
    createContextLogger(payload, 'Payment Sync').warn(
      `Payment ${payment.id} was not updated from ${payment.provider}; returning it as stored`,
    )
  }
  return load()
}
