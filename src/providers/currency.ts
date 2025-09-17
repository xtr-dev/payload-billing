/**
 * Currency utilities for payment processing
 */

// Currencies that don't use centesimal units (no decimal places)
const NON_CENTESIMAL_CURRENCIES = new Set([
  'BIF', // Burundian Franc
  'CLP', // Chilean Peso
  'DJF', // Djiboutian Franc
  'GNF', // Guinean Franc
  'JPY', // Japanese Yen
  'KMF', // Comorian Franc
  'KRW', // South Korean Won
  'MGA', // Malagasy Ariary
  'PYG', // Paraguayan Guaraní
  'RWF', // Rwandan Franc
  'UGX', // Ugandan Shilling
  'VND', // Vietnamese Đồng
  'VUV', // Vanuatu Vatu
  'XAF', // Central African CFA Franc
  'XOF', // West African CFA Franc
  'XPF', // CFP Franc
])

// Currencies that use 3 decimal places
const THREE_DECIMAL_CURRENCIES = new Set([
  'BHD', // Bahraini Dinar
  'IQD', // Iraqi Dinar
  'JOD', // Jordanian Dinar
  'KWD', // Kuwaiti Dinar
  'LYD', // Libyan Dinar
  'OMR', // Omani Rial
  'TND', // Tunisian Dinar
])

/**
 * Convert amount from smallest unit to decimal for display
 * @param amount - Amount in smallest unit (e.g., cents for USD)
 * @param currency - ISO 4217 currency code
 * @returns Formatted amount string for the payment provider
 */
export function formatAmountForProvider(amount: number, currency: string): string {
  const upperCurrency = currency.toUpperCase()

  if (NON_CENTESIMAL_CURRENCIES.has(upperCurrency)) {
    // No decimal places
    return amount.toString()
  }

  if (THREE_DECIMAL_CURRENCIES.has(upperCurrency)) {
    // 3 decimal places
    return (amount / 1000).toFixed(3)
  }

  // Default: 2 decimal places (most currencies)
  return (amount / 100).toFixed(2)
}

/**
 * Get the number of decimal places for a currency
 * @param currency - ISO 4217 currency code
 * @returns Number of decimal places
 */
export function getCurrencyDecimals(currency: string): number {
  const upperCurrency = currency.toUpperCase()

  if (NON_CENTESIMAL_CURRENCIES.has(upperCurrency)) {
    return 0
  }

  if (THREE_DECIMAL_CURRENCIES.has(upperCurrency)) {
    return 3
  }

  return 2
}

/**
 * Validate currency code format
 * @param currency - Currency code to validate
 * @returns True if valid ISO 4217 format
 */
export function isValidCurrencyCode(currency: string): boolean {
  return /^[A-Z]{3}$/.test(currency.toUpperCase())
}

/**
 * Validate amount is positive and within reasonable limits
 * @param amount - Amount to validate
 * @returns True if valid
 */
export function isValidAmount(amount: number): boolean {
  return Number.isInteger(amount) && amount > 0 && amount <= 99999999999 // Max ~999 million in major units
}