import type { Config } from 'payload'
import { createInvoicesCollection, createPaymentsCollection, createRefundsCollection } from '@/collections'
import type { BillingPluginConfig } from '@/plugin/config'

export const billingPlugin = (pluginConfig: BillingPluginConfig = {}) => (config: Config): Config => {
  if (pluginConfig.disabled) {
    return config
  }

  // Initialize collections
  if (!config.collections) {
    config.collections = []
  }

  config.collections.push(
    createPaymentsCollection(pluginConfig),
    createInvoicesCollection(pluginConfig),
    createRefundsCollection(pluginConfig),
  )

  // Initialize endpoints
  if (!config.endpoints) {
    config.endpoints = []
  }

  config.endpoints?.push(
    // Webhook endpoints
    {
      handler: (_req) => {
        try {
          const provider = null
          if (!provider) {
            return Response.json({ error: 'Provider not found' }, { status: 404 })
          }

          // TODO: Process webhook event and update database

          return Response.json({ received: true })
        } catch (error) {
          // TODO: Use proper logger instead of console
          // eslint-disable-next-line no-console
          console.error('[BILLING] Webhook error:', error)
          return Response.json({ error: 'Webhook processing failed' }, { status: 400 })
        }
      },
      method: 'post',
      path: '/billing/webhooks/:provider'
    },
  )

  // Initialize providers and onInit hook
  const incomingOnInit = config.onInit

  config.onInit = async (payload) => {
    // Execute any existing onInit functions first
    if (incomingOnInit) {
      await incomingOnInit(payload)
    }

  }

  return config
}
export default billingPlugin
