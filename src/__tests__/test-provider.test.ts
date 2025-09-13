import type { TestProviderConfig} from '../types';

import { TestPaymentProvider } from '../providers/test/provider'
import { PaymentStatus } from '../types'

describe('TestPaymentProvider', () => {
  let provider: TestPaymentProvider
  let config: TestProviderConfig

  beforeEach(() => {
    config = {
      autoComplete: true,
      defaultDelay: 0,
      enabled: true,
    }
    provider = new TestPaymentProvider(config)
  })

  afterEach(() => {
    provider.clearStoredData()
  })

  describe('createPayment', () => {
    it('should create a payment with succeeded status when autoComplete is true', async () => {
      const payment = await provider.createPayment({
        amount: 2000,
        currency: 'USD',
        description: 'Test payment',
      })

      expect(payment).toMatchObject({
        amount: 2000,
        currency: 'USD',
        description: 'Test payment',
        provider: 'test',
        status: 'succeeded',
      })
      expect(payment.id).toBeDefined()
      expect(payment.createdAt).toBeDefined()
      expect(payment.updatedAt).toBeDefined()
      expect(payment.providerData?.testMode).toBe(true)
    })

    it('should create a payment with pending status when autoComplete is false', async () => {
      config.autoComplete = false
      provider = new TestPaymentProvider(config)

      const payment = await provider.createPayment({
        amount: 1500,
        currency: 'EUR',
      })

      expect(payment).toMatchObject({
        amount: 1500,
        currency: 'EUR',
        status: 'pending',
      })
    })

    it('should create a failed payment when simulateFailure is true', async () => {
      const payment = await provider.createPayment({
        amount: 1000,
        currency: 'USD',
        metadata: {
          test: { simulateFailure: true },
        },
      })

      expect(payment.status).toBe('failed')
      expect(payment.providerData?.simulatedFailure).toBe(true)
    })

    it('should apply delay when specified', async () => {
      const startTime = Date.now()
      
      await provider.createPayment({
        amount: 1000,
        currency: 'USD',
        metadata: {
          test: { delayMs: 100 },
        },
      })

      const endTime = Date.now()
      expect(endTime - startTime).toBeGreaterThanOrEqual(100)
    })

    it('should store payment data', async () => {
      const payment = await provider.createPayment({
        amount: 2000,
        currency: 'USD',
      })

      const stored = provider.getStoredPayment(payment.id)
      expect(stored).toEqual(payment)
    })
  })

  describe('retrievePayment', () => {
    it('should retrieve an existing payment', async () => {
      const payment = await provider.createPayment({
        amount: 2000,
        currency: 'USD',
      })

      const retrieved = await provider.retrievePayment(payment.id)
      expect(retrieved).toEqual(payment)
    })

    it('should throw error for non-existent payment', async () => {
      await expect(provider.retrievePayment('non-existent')).rejects.toThrow(
        'Payment non-existent not found'
      )
    })
  })

  describe('cancelPayment', () => {
    it('should cancel a pending payment', async () => {
      config.autoComplete = false
      provider = new TestPaymentProvider(config)

      const payment = await provider.createPayment({
        amount: 2000,
        currency: 'USD',
      })

      const canceled = await provider.cancelPayment(payment.id)
      expect(canceled.status).toBe('canceled')
      expect(canceled.updatedAt).not.toBe(payment.updatedAt)
    })

    it('should not cancel a succeeded payment', async () => {
      const payment = await provider.createPayment({
        amount: 2000,
        currency: 'USD',
      })

      await expect(provider.cancelPayment(payment.id)).rejects.toThrow(
        'Cannot cancel a succeeded payment'
      )
    })

    it('should throw error for non-existent payment', async () => {
      await expect(provider.cancelPayment('non-existent')).rejects.toThrow(
        'Payment non-existent not found'
      )
    })
  })

  describe('refundPayment', () => {
    it('should create a full refund for succeeded payment', async () => {
      const payment = await provider.createPayment({
        amount: 2000,
        currency: 'USD',
      })

      const refund = await provider.refundPayment(payment.id)
      
      expect(refund).toMatchObject({
        amount: 2000,
        currency: 'USD',
        paymentId: payment.id,
        status: 'succeeded',
      })
      expect(refund.id).toBeDefined()
      expect(refund.createdAt).toBeDefined()

      // Check payment status is updated
      const updatedPayment = await provider.retrievePayment(payment.id)
      expect(updatedPayment.status).toBe('refunded')
    })

    it('should create a partial refund', async () => {
      const payment = await provider.createPayment({
        amount: 2000,
        currency: 'USD',
      })

      const refund = await provider.refundPayment(payment.id, 1000)
      
      expect(refund.amount).toBe(1000)
      
      // Check payment status is updated to partially_refunded
      const updatedPayment = await provider.retrievePayment(payment.id)
      expect(updatedPayment.status).toBe('partially_refunded')
    })

    it('should not refund a non-succeeded payment', async () => {
      config.autoComplete = false
      provider = new TestPaymentProvider(config)

      const payment = await provider.createPayment({
        amount: 2000,
        currency: 'USD',
      })

      await expect(provider.refundPayment(payment.id)).rejects.toThrow(
        'Can only refund succeeded payments'
      )
    })

    it('should not refund more than payment amount', async () => {
      const payment = await provider.createPayment({
        amount: 2000,
        currency: 'USD',
      })

      await expect(provider.refundPayment(payment.id, 3000)).rejects.toThrow(
        'Refund amount cannot exceed payment amount'
      )
    })
  })

  describe('handleWebhook', () => {
    it('should handle webhook event', async () => {
      const mockRequest = {
        text: () => Promise.resolve(JSON.stringify({
          type: 'payment.succeeded',
          data: { paymentId: 'test_pay_123' }
        }))
      } as Request

      const event = await provider.handleWebhook(mockRequest)

      expect(event).toMatchObject({
        type: 'payment.succeeded',
        data: { paymentId: 'test_pay_123' },
        provider: 'test',
        verified: true,
      })
      expect(event.id).toBeDefined()
    })

    it('should throw error for invalid JSON', async () => {
      const mockRequest = {
        text: () => Promise.resolve('invalid json')
      } as Request

      await expect(provider.handleWebhook(mockRequest)).rejects.toThrow(
        'Invalid JSON in webhook body'
      )
    })

    it('should throw error when provider is disabled', async () => {
      config.enabled = false
      provider = new TestPaymentProvider(config)

      const mockRequest = {
        text: () => Promise.resolve('{}')
      } as Request

      await expect(provider.handleWebhook(mockRequest)).rejects.toThrow(
        'Test provider is not enabled'
      )
    })
  })

  describe('data management', () => {
    it('should clear all stored data', async () => {
      await provider.createPayment({ amount: 1000, currency: 'USD' })
      
      expect(provider.getAllPayments()).toHaveLength(1)
      
      provider.clearStoredData()
      
      expect(provider.getAllPayments()).toHaveLength(0)
      expect(provider.getAllRefunds()).toHaveLength(0)
    })

    it('should return all payments and refunds', async () => {
      const payment1 = await provider.createPayment({ amount: 1000, currency: 'USD' })
      const payment2 = await provider.createPayment({ amount: 2000, currency: 'EUR' })
      const refund = await provider.refundPayment(payment1.id)

      const payments = provider.getAllPayments()
      const refunds = provider.getAllRefunds()

      expect(payments).toHaveLength(2)
      expect(refunds).toHaveLength(1)
      expect(refunds[0]).toEqual(refund)
    })
  })
})