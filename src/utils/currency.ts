/**
 * Currency utility functions for payment processing
 */

// Common currency configurations
export const CURRENCY_CONFIG = {
  AUD: { name: 'Australian Dollar', decimals: 2, symbol: 'A$' },
  CAD: { name: 'Canadian Dollar', decimals: 2, symbol: 'C$' },
  CHF: { name: 'Swiss Franc', decimals: 2, symbol: 'Fr' },
  DKK: { name: 'Danish Krone', decimals: 2, symbol: 'kr' },
  EUR: { name: 'Euro', decimals: 2, symbol: '€' },
  GBP: { name: 'British Pound', decimals: 2, symbol: '£' },
  JPY: { name: 'Japanese Yen', decimals: 0, symbol: '¥' },
  NOK: { name: 'Norwegian Krone', decimals: 2, symbol: 'kr' },
  SEK: { name: 'Swedish Krona', decimals: 2, symbol: 'kr' },
  USD: { name: 'US Dollar', decimals: 2, symbol: '$' },
} as const

export type SupportedCurrency = keyof typeof CURRENCY_CONFIG

/**
 * Validates if a currency code is supported
 */
export function isSupportedCurrency(currency: string): currency is SupportedCurrency {
  return currency in CURRENCY_CONFIG
}

/**
 * Validates currency format (3-letter ISO code)
 */
export function isValidCurrencyCode(currency: string): boolean {
  return /^[A-Z]{3}$/.test(currency)
}

/**
 * Converts amount from cents to major currency unit
 */
export function fromCents(amount: number, currency: string): number {
  if (!isValidCurrencyCode(currency)) {
    throw new Error(`Invalid currency code: ${currency}`)
  }

  const config = CURRENCY_CONFIG[currency as SupportedCurrency]
  if (!config) {
    // Default to 2 decimals for unknown currencies
    return amount / 100
  }

  return config.decimals === 0 ? amount : amount / Math.pow(10, config.decimals)
}

/**
 * Converts amount from major currency unit to cents
 */
export function toCents(amount: number, currency: string): number {
  if (!isValidCurrencyCode(currency)) {
    throw new Error(`Invalid currency code: ${currency}`)
  }

  const config = CURRENCY_CONFIG[currency as SupportedCurrency]
  if (!config) {
    // Default to 2 decimals for unknown currencies
    return Math.round(amount * 100)
  }

  return config.decimals === 0 
    ? Math.round(amount) 
    : Math.round(amount * Math.pow(10, config.decimals))
}

/**
 * Formats amount for display with currency symbol
 */
export function formatAmount(amount: number, currency: string, options?: {
  showCode?: boolean
  showSymbol?: boolean
}): string {
  const { showCode = false, showSymbol = true } = options || {}
  
  if (!isValidCurrencyCode(currency)) {
    throw new Error(`Invalid currency code: ${currency}`)
  }

  const majorAmount = fromCents(amount, currency)
  const config = CURRENCY_CONFIG[currency as SupportedCurrency]
  
  let formatted = majorAmount.toFixed(config?.decimals ?? 2)
  
  if (showSymbol && config?.symbol) {
    formatted = `${config.symbol}${formatted}`
  }
  
  if (showCode) {
    formatted += ` ${currency}`
  }
  
  return formatted
}

/**
 * Gets currency information
 */
export function getCurrencyInfo(currency: string) {
  if (!isValidCurrencyCode(currency)) {
    throw new Error(`Invalid currency code: ${currency}`)
  }

  return CURRENCY_CONFIG[currency as SupportedCurrency] || {
    name: currency,
    decimals: 2,
    symbol: currency
  }
}

/**
 * Validates amount is positive and properly formatted
 */
export function validateAmount(amount: number): void {
  if (!Number.isFinite(amount)) {
    throw new Error('Amount must be a finite number')
  }
  
  if (amount <= 0) {
    throw new Error('Amount must be positive')
  }
  
  if (!Number.isInteger(amount)) {
    throw new Error('Amount must be an integer (in cents)')
  }
}