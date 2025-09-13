/**
 * Structured logging utilities for the billing plugin
 */

export type LogLevel = 'debug' | 'error' | 'info' | 'warn'

export interface LogContext {
  [key: string]: unknown
  amount?: number
  currency?: string
  customerId?: string
  invoiceId?: string
  paymentId?: string
  provider?: string
  refundId?: string
  webhookId?: string
}

export interface Logger {
  debug(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
}

/**
 * Creates a structured logger with consistent formatting
 */
export function createLogger(namespace: string = 'BILLING'): Logger {
  const log = (level: LogLevel, message: string, context: LogContext = {}) => {
    const timestamp = new Date().toISOString()
    const logData = {
      level: level.toUpperCase(),
      message,
      namespace,
      timestamp,
      ...context,
    }

    // Use console methods based on log level
    const consoleMethod = console[level] || console.log
    consoleMethod(`[${namespace}] ${message}`, logData)
  }

  return {
    debug: (message: string, context?: LogContext) => log('debug', message, context),
    error: (message: string, context?: LogContext) => log('error', message, context),
    info: (message: string, context?: LogContext) => log('info', message, context),
    warn: (message: string, context?: LogContext) => log('warn', message, context),
  }
}

/**
 * Default logger instance for the plugin
 */
export const logger = createLogger('BILLING')

/**
 * Creates a provider-specific logger
 */
export function createProviderLogger(providerName: string): Logger {
  return createLogger(`BILLING:${providerName.toUpperCase()}`)
}

/**
 * Log payment operations with consistent structure
 */
export function logPaymentOperation(
  operation: string,
  paymentId: string,
  provider: string,
  context?: LogContext
) {
  logger.info(`Payment ${operation}`, {
    operation,
    paymentId,
    provider,
    ...context,
  })
}

/**
 * Log webhook events with consistent structure
 */
export function logWebhookEvent(
  provider: string,
  eventType: string,
  webhookId: string,
  context?: LogContext
) {
  logger.info(`Webhook received`, {
    eventType,
    provider,
    webhookId,
    ...context,
  })
}

/**
 * Log errors with consistent structure
 */
export function logError(
  error: Error,
  operation: string,
  context?: LogContext
) {
  logger.error(`Operation failed: ${operation}`, {
    error: error.message,
    operation,
    stack: error.stack,
    ...context,
  })
}