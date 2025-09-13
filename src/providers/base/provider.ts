import type { CreatePaymentOptions, Payment, PaymentProvider, Refund, WebhookEvent } from '../../types'

export abstract class BasePaymentProvider implements PaymentProvider {
  abstract name: string

  protected formatAmount(amount: number, currency: string): number {
    this.validateAmount(amount)
    this.validateCurrency(currency)
    return amount
  }
  protected log(level: 'error' | 'info' | 'warn', message: string, data?: Record<string, unknown>): void {
    const logData = {
      message,
      provider: this.name,
      ...data,
    }
    
    console[level](`[${this.name.toUpperCase()}]`, logData)
  }
  protected validateAmount(amount: number): void {
    if (amount <= 0 || !Number.isInteger(amount)) {
      throw new Error('Amount must be a positive integer in cents')
    }
  }
  protected validateCurrency(currency: string): void {
    if (!currency || currency.length !== 3) {
      throw new Error('Currency must be a valid 3-letter ISO currency code')
    }
  }
  abstract cancelPayment(id: string): Promise<Payment>

  abstract createPayment(options: CreatePaymentOptions): Promise<Payment>

  abstract handleWebhook(request: Request, signature?: string): Promise<WebhookEvent>

  abstract refundPayment(id: string, amount?: number): Promise<Refund>

  abstract retrievePayment(id: string): Promise<Payment>
}

export function createProviderRegistry() {
  const providers = new Map<string, PaymentProvider>()

  return {
    register(provider: PaymentProvider): void {
      providers.set(provider.name, provider)
    },

    get(name: string): PaymentProvider | undefined {
      return providers.get(name)
    },

    getAll(): PaymentProvider[] {
      return Array.from(providers.values())
    },

    has(name: string): boolean {
      return providers.has(name)
    }
  }
}

export const providerRegistry = createProviderRegistry()