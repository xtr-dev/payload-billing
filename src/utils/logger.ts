import type { Payload } from 'payload'

let pluginLogger: any = null

/**
 * Get or create the plugin logger instance
 * Uses PAYLOAD_BILLING_LOG_LEVEL environment variable to configure log level
 * Defaults to 'info' if not set
 */
export function getPluginLogger(payload: Payload) {
  if (!pluginLogger && payload.logger) {
    const logLevel = process.env.PAYLOAD_BILLING_LOG_LEVEL || 'info'

    pluginLogger = payload.logger.child({
      level: logLevel,
      plugin: '@xtr-dev/payload-billing'
    })

    // Log the configured log level on first initialization
    pluginLogger.info(`Logger initialized with level: ${logLevel}`)
  }

  // Fallback to console if logger not available (shouldn't happen in normal operation)
  if (!pluginLogger) {
    return {
      debug: (...args: any[]) => console.log('[BILLING DEBUG]', ...args),
      info: (...args: any[]) => console.log('[BILLING INFO]', ...args),
      warn: (...args: any[]) => console.warn('[BILLING WARN]', ...args),
      error: (...args: any[]) => console.error('[BILLING ERROR]', ...args),
    }
  }

  return pluginLogger
}

/**
 * Create a context-specific logger for a particular operation
 */
export function createContextLogger(payload: Payload, context: string) {
  const logger = getPluginLogger(payload)

  return {
    debug: (message: string, ...args: any[]) => logger.debug(`[${context}] ${message}`, ...args),
    info: (message: string, ...args: any[]) => logger.info(`[${context}] ${message}`, ...args),
    warn: (message: string, ...args: any[]) => logger.warn(`[${context}] ${message}`, ...args),
    error: (message: string, ...args: any[]) => logger.error(`[${context}] ${message}`, ...args),
  }
}