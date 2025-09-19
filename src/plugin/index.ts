import { createInvoicesCollection, createPaymentsCollection, createRefundsCollection } from '../collections/index'
import type { BillingPluginConfig } from './config'
import type { Config, Payload } from 'payload'
import { createSingleton } from './singleton'
import type { PaymentProvider } from '../providers/index'

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
  ];

  (pluginConfig.providers || [])
    .filter(provider => provider.onConfig)
    .forEach(provider => provider.onConfig!(config, pluginConfig))

  const incomingOnInit = config.onInit
  config.onInit = async (payload) => {
    if (incomingOnInit) {
      await incomingOnInit(payload)
    }
    singleton.set(payload, {
      config: pluginConfig,
      providerConfig: (pluginConfig.providers || []).reduce(
        (record, provider) => {
          record[provider.key] = provider
          return record
        },
        {} as Record<string, PaymentProvider>
      )
    } satisfies BillingPlugin)
    await Promise.all((pluginConfig.providers || [])
      .filter(provider => provider.onInit)
      .map(provider => provider.onInit!(payload)))
  }

  return config
}
export default billingPlugin
