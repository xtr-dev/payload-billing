import type { 
  CreatePaymentOptions, 
  Payment, 
  PaymentStatus, 
  Refund, 
  TestProviderConfig,
  WebhookEvent
} from '../../types';

import { 
  RefundStatus
} from '../../types'
import { BasePaymentProvider } from '../base/provider'

interface TestPaymentData {
  delayMs?: number
  failAfterMs?: number
  simulateFailure?: boolean
}

export class TestPaymentProvider extends BasePaymentProvider {
  private config: TestProviderConfig
  private payments = new Map<string, Payment>()
  private refunds = new Map<string, Refund>()
  name = 'test'

  constructor(config: TestProviderConfig) {
    super()
    this.config = config
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async cancelPayment(id: string): Promise<Payment> {
    const payment = this.payments.get(id)
    if (!payment) {
      throw new Error(`Payment ${id} not found`)
    }

    if (payment.status === 'succeeded') {
      throw new Error('Cannot cancel a succeeded payment')
    }

    const canceledPayment = {
      ...payment,
      status: 'canceled' as PaymentStatus,
      updatedAt: new Date().toISOString()
    }

    this.payments.set(id, canceledPayment)
    
    this.log('info', 'Payment canceled', { paymentId: id })
    
    return canceledPayment
  }

  clearStoredData(): void {
    this.payments.clear()
    this.refunds.clear()
    this.log('info', 'Test data cleared')
  }

  async createPayment(options: CreatePaymentOptions): Promise<Payment> {
    const testData = options.metadata?.test as TestPaymentData || {}
    const delay = testData.delayMs ?? this.config.defaultDelay ?? 0
    
    if (delay > 0) {
      await this.sleep(delay)
    }

    const shouldFail = testData.simulateFailure ?? 
      (this.config.simulateFailures && Math.random() < (this.config.failureRate ?? 0.1))

    const paymentId = `test_pay_${Date.now()}_${Math.random().toString(36).substring(7)}`
    
    const payment: Payment = {
      id: paymentId,
      amount: options.amount,
      createdAt: new Date().toISOString(),
      currency: options.currency,
      customer: options.customer,
      description: options.description,
      metadata: options.metadata,
      provider: this.name,
      providerData: {
        autoCompleted: this.config.autoComplete,
        delayApplied: delay,
        simulatedFailure: shouldFail,
        testMode: true
      },
      status: shouldFail ? 'failed' : (this.config.autoComplete ? 'succeeded' : 'pending'),
      updatedAt: new Date().toISOString()
    }

    this.payments.set(paymentId, payment)
    
    this.log('info', 'Payment created', {
      amount: options.amount,
      currency: options.currency,
      paymentId,
      status: payment.status
    })

    // Simulate async status updates if configured
    if (testData.failAfterMs && !shouldFail) {
      setTimeout(() => {
        const updatedPayment = { ...payment, status: 'failed' as PaymentStatus, updatedAt: new Date().toISOString() }
        this.payments.set(paymentId, updatedPayment)
        this.log('info', 'Payment failed after delay', { paymentId })
      }, testData.failAfterMs)
    }

    return payment
  }

  getAllPayments(): Payment[] {
    return Array.from(this.payments.values())
  }

  getAllRefunds(): Refund[] {
    return Array.from(this.refunds.values())
  }

  // Test-specific methods
  getStoredPayment(id: string): Payment | undefined {
    return this.payments.get(id)
  }

  getStoredRefund(id: string): Refund | undefined {
    return this.refunds.get(id)
  }

  async handleWebhook(request: Request, signature?: string): Promise<WebhookEvent> {
    if (!this.config.enabled) {
      throw new Error('Test provider is not enabled')
    }

    // For test provider, we'll simulate webhook events
    const body = await request.text()
    let eventData: Record<string, unknown>

    try {
      eventData = JSON.parse(body)
    } catch (error) {
      throw new Error('Invalid JSON in webhook body')
    }

    const event: WebhookEvent = {
      id: `test_evt_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type: (eventData.type as string) || 'payment.status_changed',
      data: eventData,
      provider: this.name,
      verified: true // Test provider always considers webhooks verified
    }

    this.log('info', 'Webhook received', {
      type: event.type,
      dataKeys: Object.keys(event.data),
      eventId: event.id
    })

    return event
  }

  async refundPayment(id: string, amount?: number): Promise<Refund> {
    const payment = this.payments.get(id)
    if (!payment) {
      throw new Error(`Payment ${id} not found`)
    }

    if (payment.status !== 'succeeded') {
      throw new Error('Can only refund succeeded payments')
    }

    const refundAmount = amount ?? payment.amount
    if (refundAmount > payment.amount) {
      throw new Error('Refund amount cannot exceed payment amount')
    }

    const refundId = `test_ref_${Date.now()}_${Math.random().toString(36).substring(7)}`
    
    const refund: Refund = {
      id: refundId,
      amount: refundAmount,
      createdAt: new Date().toISOString(),
      currency: payment.currency,
      paymentId: id,
      providerData: {
        autoCompleted: this.config.autoComplete,
        testMode: true
      },
      status: this.config.autoComplete ? 'succeeded' : 'pending'
    }

    this.refunds.set(refundId, refund)

    // Update payment status
    const newPaymentStatus: PaymentStatus = refundAmount === payment.amount ? 'refunded' : 'partially_refunded'
    const updatedPayment = {
      ...payment,
      status: newPaymentStatus,
      updatedAt: new Date().toISOString()
    }
    this.payments.set(id, updatedPayment)

    this.log('info', 'Refund created', {
      amount: refundAmount,
      paymentId: id,
      refundId,
      status: refund.status
    })

    return refund
  }

  async retrievePayment(id: string): Promise<Payment> {
    const payment = this.payments.get(id)
    if (!payment) {
      throw new Error(`Payment ${id} not found`)
    }
    return payment
  }
}