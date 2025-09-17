/**
 * Request context utilities for tracking webhook vs manual operations
 */

// Symbol for storing webhook context in the request object
const WEBHOOK_CONTEXT_SYMBOL = Symbol('billingWebhookContext')

export interface WebhookContext {
  isWebhookUpdate: boolean
  provider?: string
  webhookType?: string
  timestamp: string
  metadata?: Record<string, any>
}

/**
 * Mark a request as coming from a webhook
 */
export function markRequestAsWebhook(
  req: any,
  provider: string,
  webhookType: string = 'payment_update',
  metadata?: Record<string, any>
): void {
  const context: WebhookContext = {
    isWebhookUpdate: true,
    provider,
    webhookType,
    timestamp: new Date().toISOString(),
    metadata
  }

  // Store context in request object using symbol to avoid conflicts
  req[WEBHOOK_CONTEXT_SYMBOL] = context
}

/**
 * Check if a request is from a webhook
 */
export function isWebhookRequest(req: any): boolean {
  const context = req[WEBHOOK_CONTEXT_SYMBOL] as WebhookContext | undefined
  return context?.isWebhookUpdate === true
}

/**
 * Get webhook context from request
 */
export function getWebhookContext(req: any): WebhookContext | null {
  return req[WEBHOOK_CONTEXT_SYMBOL] as WebhookContext || null
}