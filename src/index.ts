import type { Config } from 'payload'

import type { BillingPluginConfig } from './types'

import { createCustomersCollection } from './collections/customers'
import { createInvoicesCollection } from './collections/invoices'
import { createPaymentsCollection } from './collections/payments'
import { createRefundsCollection } from './collections/refunds'
import { providerRegistry } from './providers/base/provider'
import { TestPaymentProvider } from './providers/test/provider'

export * from './providers/base/provider'
export * from './providers/test/provider'
export * from './types'

export const billingPlugin = (pluginConfig: BillingPluginConfig = {}) => (config: Config): Config => {
  if (pluginConfig.disabled) {
    return config
  }

  // Initialize collections
  if (!config.collections) {
    config.collections = []
  }

  config.collections.push(
    createPaymentsCollection(pluginConfig.collections?.payments || 'payments'),
    createCustomersCollection(pluginConfig.collections?.customers || 'customers'),
    createInvoicesCollection(pluginConfig.collections?.invoices || 'invoices'),
    createRefundsCollection(pluginConfig.collections?.refunds || 'refunds'),
  )

  // Initialize endpoints
  if (!config.endpoints) {
    config.endpoints = []
  }

  config.endpoints?.push(
    // Webhook endpoints
    {
      handler: async (req) => {
        try {
          const provider = providerRegistry.get(req.routeParams?.provider as string)
          if (!provider) {
            return Response.json({ error: 'Provider not found' }, { status: 404 })
          }

          const signature = req.headers.get('stripe-signature') || 
                          req.headers.get('x-mollie-signature')

          const event = await provider.handleWebhook(req as unknown as Request, signature || '')
          
          // TODO: Process webhook event and update database
          
          return Response.json({ eventId: event.id, received: true })
        } catch (error) {
          console.error('[BILLING] Webhook error:', error)
          return Response.json({ error: 'Webhook processing failed' }, { status: 400 })
        }
      },
      method: 'post',
      path: '/billing/webhooks/:provider'
    },
    // Health check endpoint
    {
      handler: async () => {
        const providers = providerRegistry.getAll().map(p => ({
          name: p.name,
          status: 'active'
        }))
        
        return Response.json({
          providers,
          status: 'ok',
          version: '0.1.0'
        })
      },
      method: 'get',
      path: '/billing/health'
    }
  )

  // Initialize providers and onInit hook
  const incomingOnInit = config.onInit

  config.onInit = async (payload) => {
    // Execute any existing onInit functions first
    if (incomingOnInit) {
      await incomingOnInit(payload)
    }

    // Initialize payment providers
    initializeProviders(pluginConfig)
    
    // Log initialization
    console.log('[BILLING] Plugin initialized with providers:', 
      providerRegistry.getAll().map(p => p.name).join(', ')
    )
  }

  return config
}

function initializeProviders(config: BillingPluginConfig) {
  // Initialize test provider if enabled
  if (config.providers?.test?.enabled) {
    const testProvider = new TestPaymentProvider(config.providers.test)
    providerRegistry.register(testProvider)
  }

  // TODO: Initialize Stripe provider
  // TODO: Initialize Mollie provider
}

// Utility function to get payment provider
export function getPaymentProvider(name: string) {
  const provider = providerRegistry.get(name)
  if (!provider) {
    throw new Error(`Payment provider '${name}' not found`)
  }
  return provider
}

// Utility function to list available providers
export function getAvailableProviders() {
  return providerRegistry.getAll().map(p => ({
    name: p.name,
    // Add provider-specific info here
  }))
}

export default billingPlugin