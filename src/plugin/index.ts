import { createInvoicesCollection, createPaymentsCollection, createRefundsCollection } from '@/collections'
import type { BillingPluginConfig } from '@/plugin/config'
import type { Config, Payload } from 'payload'
import { createSingleton } from '@/plugin/singleton'
import type { PaymentProvider } from '@/providers'

const singleton = createSingleton(Symbol('billingPlugin'))

type BillingPlugin = {
  config: BillingPluginConfig
  providerConfig: {
    [key: string]: PaymentProvider
  }
}

export const useBillingPlugin = (payload: Payload) => singleton.get(payload) as BillingPlugin

export const billingPlugin = (pluginConfig: BillingPluginConfig = {}) => (config: Config): Config => {
  if (pluginConfig.disabled) {
    return config
  }

  config.collections = [
    ...(config.collections || []),
    createPaymentsCollection(pluginConfig),
    createInvoicesCollection(pluginConfig),
    createRefundsCollection(pluginConfig),
  ]

  const incomingOnInit = config.onInit
  config.onInit = async (payload) => {
    if (incomingOnInit) {
      await incomingOnInit(payload)
    }
    singleton.set(payload, {
      config: pluginConfig,
      providerConfig: (pluginConfig.providers || []).reduce(
        (acc, val) => {
          acc[val.key] = val
          return acc
        },
        {} as Record<string, PaymentProvider>
      )
    } satisfies BillingPlugin)
    console.log('Billing plugin initialized', singleton.get(payload))
    await Promise.all((pluginConfig.providers || []).map(p => p.onInit(payload)))
  }

  return config
}
export default billingPlugin
