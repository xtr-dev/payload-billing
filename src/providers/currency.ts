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

// ISO 4217 List One (Current Currency & Funds), published 2026-01-01 by the
// ISO 4217 Maintenance Agency: https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html
const ISO_4217_CURRENCY_CODES = new Set([
  'AED', 'AFN', 'ALL', 'AMD', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT',
  'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BOV', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD',
  'CAD', 'CDF', 'CHE', 'CHF', 'CHW', 'CLF', 'CLP', 'CNY', 'COP', 'COU', 'CRC', 'CUP',
  'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD', 'FKP',
  'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF',
  'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR',
  'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD',
  'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN',
  'MXV', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'OMR', 'PAB', 'PEN',
  'PGK', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR', 'RON', 'RSD', 'RUB', 'RWF', 'SAR', 'SBD',
  'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP',
  'SZL', 'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX',
  'USD', 'USN', 'UYI', 'UYU', 'UYW', 'UZS', 'VED', 'VES', 'VND', 'VUV', 'WST', 'XAD',
  'XAF', 'XAG', 'XAU', 'XBA', 'XBB', 'XBC', 'XBD', 'XCD', 'XCG', 'XDR', 'XOF', 'XPD',
  'XPF', 'XPT', 'XSU', 'XTS', 'XUA', 'XXX', 'YER', 'ZAR', 'ZMW', 'ZWG',
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
 * Validate a currency code against ISO 4217's current currency and fund list.
 * @param currency - Currency code to validate
 * @returns True if the code is a current ISO 4217 code
 */
export function isValidCurrencyCode(currency: string): boolean {
  return ISO_4217_CURRENCY_CODES.has(currency.toUpperCase())
}

/**
 * Validate amount is non-negative and within reasonable limits
 * @param amount - Amount to validate
 * @returns True if valid
 */
export function isValidAmount(amount: number): boolean {
  return Number.isInteger(amount) && amount >= 0 && amount <= 99999999999 // Max ~999 million in major units
}
