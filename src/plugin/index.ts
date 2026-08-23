import { createInvoicesCollection, createPaymentsCollection, createRefundsCollection } from '../collections/index'
import type { BillingPluginConfig } from './config'
import type { CollectionConfig, Config, Payload } from 'payload'
import { createSingleton } from './singleton'
import type { PaymentProvider } from '../providers/index'

const singleton = createSingleton(Symbol.for('@xtr-dev/payload-billing'))

type BillingPlugin = {
  config: BillingPluginConfig
  providerConfig: {
    [key: string]: PaymentProvider
  }
}

export const useBillingPlugin = (payload: Payload) => singleton.get(payload) as BillingPlugin | undefined

const disableCollectionBehavior = (collection: CollectionConfig): CollectionConfig => ({
  ...collection,
  access: {
    admin: () => false,
    create: () => false,
    delete: () => false,
    read: () => false,
    readVersions: () => false,
    unlock: () => false,
    update: () => false,
  },
  admin: {
    ...collection.admin,
    hidden: true,
  },
  endpoints: false,
  hooks: {},
})

export const billingPlugin = (pluginConfig: BillingPluginConfig = {}) => (config: Config): Config => {
  const billingCollections = [
    createPaymentsCollection(pluginConfig),
    createInvoicesCollection(pluginConfig),
    createRefundsCollection(pluginConfig),
  ]

  config.collections = [
    ...(config.collections || []),
    ...billingCollections.map(collection => pluginConfig.disabled
      ? disableCollectionBehavior(collection)
      : collection),
  ]

  if (pluginConfig.disabled) {
    return config
  }

  (pluginConfig.providers || [])
    .filter(provider => provider?.onConfig)
    .forEach(provider => provider?.onConfig!(config, pluginConfig))

  const incomingOnInit = config.onInit
  config.onInit = async (payload) => {
    if (incomingOnInit) {
      await incomingOnInit(payload)
    }
    singleton.set(payload, {
      config: pluginConfig,
      providerConfig: (pluginConfig.providers || []).filter(Boolean).reduce(
        (record, provider) => {
          record[provider!.key] = provider as PaymentProvider
          return record
        },
        {} as Record<string, PaymentProvider>
      )
    } satisfies BillingPlugin)
    await Promise.all((pluginConfig.providers || [])
      .filter(provider => provider?.onInit)
      .map(provider => provider?.onInit!(payload)))
  }

  return config
}
export default billingPlugin
