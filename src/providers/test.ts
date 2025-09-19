import type { Payment } from '../plugin/types/payments'
import type { PaymentProvider, ProviderData } from '../plugin/types/index'
import type { BillingPluginConfig } from '../plugin/config'
import type { Payload } from 'payload'
import { handleWebhookError, logWebhookEvent } from './utils'
import { isValidAmount, isValidCurrencyCode } from './currency'

export type PaymentOutcome = 'paid' | 'failed' | 'cancelled' | 'expired' | 'pending'

export type PaymentMethod = 'ideal' | 'creditcard' | 'paypal' | 'applepay' | 'banktransfer'

export interface PaymentScenario {
  id: string
  name: string
  description: string
  outcome: PaymentOutcome
  delay?: number // Delay in milliseconds before processing
  method?: PaymentMethod
}

export interface TestProviderConfig {
  enabled: boolean
  scenarios?: PaymentScenario[]
  customUiRoute?: string
  testModeIndicators?: {
    showWarningBanners?: boolean
    showTestBadges?: boolean
    consoleWarnings?: boolean
  }
  defaultDelay?: number
  baseUrl?: string
}

export interface TestProviderConfigResponse {
  enabled: boolean
  scenarios: PaymentScenario[]
  methods: Array<{
    id: string
    name: string
    icon: string
  }>
  testModeIndicators: {
    showWarningBanners: boolean
    showTestBadges: boolean
    consoleWarnings: boolean
  }
  defaultDelay: number
  customUiRoute: string
}

// Properly typed session interface
export interface TestPaymentSession {
  id: string
  payment: Partial<Payment>
  scenario?: PaymentScenario
  method?: PaymentMethod
  createdAt: Date
  status: PaymentOutcome
}

// Use the proper BillingPluginConfig type

// Default payment scenarios
const DEFAULT_SCENARIOS: PaymentScenario[] = [
  {
    id: 'instant-success',
    name: 'Instant Success',
    description: 'Payment succeeds immediately',
    outcome: 'paid',
    delay: 0
  },
  {
    id: 'delayed-success',
    name: 'Delayed Success',
    description: 'Payment succeeds after a delay',
    outcome: 'paid',
    delay: 3000
  },
  {
    id: 'cancelled-payment',
    name: 'Cancelled Payment',
    description: 'User cancels the payment',
    outcome: 'cancelled',
    delay: 1000
  },
  {
    id: 'declined-payment',
    name: 'Declined Payment',
    description: 'Payment is declined by the provider',
    outcome: 'failed',
    delay: 2000
  },
  {
    id: 'expired-payment',
    name: 'Expired Payment',
    description: 'Payment expires before completion',
    outcome: 'expired',
    delay: 5000
  },
  {
    id: 'pending-payment',
    name: 'Pending Payment',
    description: 'Payment remains in pending state',
    outcome: 'pending',
    delay: 1500
  }
]

// Payment method configurations
const PAYMENT_METHODS: Record<PaymentMethod, { name: string; icon: string }> = {
  ideal: { name: 'iDEAL', icon: '🏦' },
  creditcard: { name: 'Credit Card', icon: '💳' },
  paypal: { name: 'PayPal', icon: '🅿️' },
  applepay: { name: 'Apple Pay', icon: '🍎' },
  banktransfer: { name: 'Bank Transfer', icon: '🏛️' }
}

// In-memory storage for test payment sessions
const testPaymentSessions = new Map<string, TestPaymentSession>()

export const testProvider = (testConfig: TestProviderConfig) => {
  if (!testConfig.enabled) {
    throw new Error('Test provider is disabled')
  }

  const scenarios = testConfig.scenarios || DEFAULT_SCENARIOS
  const baseUrl = testConfig.baseUrl || (process.env.PAYLOAD_PUBLIC_SERVER_URL || 'http://localhost:3000')
  const uiRoute = testConfig.customUiRoute || '/test-payment'

  // Log test mode warnings if enabled
  if (testConfig.testModeIndicators?.consoleWarnings !== false) {
    console.warn('🧪 [TEST PROVIDER] Payment system is running in test mode')
  }

  return {
    key: 'test',
    onConfig: (config, pluginConfig) => {
      // Register test payment UI endpoint
      config.endpoints = [
        ...(config.endpoints || []),
        {
          path: '/payload-billing/test/payment/:id',
          method: 'get',
          handler: async (req) => {
            // Extract payment ID from URL path
            const urlParts = req.url?.split('/') || []
            const paymentId = urlParts[urlParts.length - 1]
            if (!paymentId) {
              return new Response('Payment ID required', { status: 400 })
            }

            const session = testPaymentSessions.get(paymentId)
            if (!session) {
              return new Response('Payment session not found', { status: 404 })
            }

            // Generate test payment UI
            const html = generateTestPaymentUI(session, scenarios, uiRoute, baseUrl, testConfig)
            return new Response(html, {
              headers: { 'Content-Type': 'text/html' }
            })
          }
        },
        {
          path: '/payload-billing/test/config',
          method: 'get',
          handler: async (req) => {
            const response: TestProviderConfigResponse = {
              enabled: testConfig.enabled,
              scenarios: scenarios,
              methods: Object.entries(PAYMENT_METHODS).map(([id, method]) => ({
                id,
                name: method.name,
                icon: method.icon
              })),
              testModeIndicators: testConfig.testModeIndicators || {
                showWarningBanners: true,
                showTestBadges: true,
                consoleWarnings: true
              },
              defaultDelay: testConfig.defaultDelay || 1000,
              customUiRoute: uiRoute
            }
            return new Response(JSON.stringify(response), {
              headers: { 'Content-Type': 'application/json' }
            })
          }
        },
        {
          path: '/payload-billing/test/process',
          method: 'post',
          handler: async (req) => {
            try {
              const payload = req.payload
              const body = await req.json?.() || {}
              const { paymentId, scenarioId, method } = body as any

              const session = testPaymentSessions.get(paymentId)
              if (!session) {
                return new Response(JSON.stringify({ error: 'Payment session not found' }), {
                  status: 404,
                  headers: { 'Content-Type': 'application/json' }
                })
              }

              const scenario = scenarios.find(s => s.id === scenarioId)
              if (!scenario) {
                return new Response(JSON.stringify({ error: 'Invalid scenario' }), {
                  status: 400,
                  headers: { 'Content-Type': 'application/json' }
                })
              }

              // Update session with selected scenario and method
              session.scenario = scenario
              session.method = method
              session.status = 'pending'

              // Process payment after delay
              setTimeout(() => {
                processTestPayment(payload, session, pluginConfig).catch(async (error) => {
                  console.error('[Test Provider] Failed to process payment:', error)
                  session.status = 'failed'

                  // Also update the payment record in database
                  try {
                    const paymentsCollection = (typeof pluginConfig.collections?.payments === 'string'
                      ? pluginConfig.collections.payments
                      : 'payments') as any
                    const payments = await payload.find({
                      collection: paymentsCollection,
                      where: { providerId: { equals: session.id } },
                      limit: 1
                    })

                    if (payments.docs.length > 0) {
                      await payload.update({
                        collection: paymentsCollection,
                        id: payments.docs[0].id,
                        data: {
                          status: 'failed',
                          providerData: {
                            raw: { error: error.message, processedAt: new Date().toISOString() },
                            timestamp: new Date().toISOString(),
                            provider: 'test'
                          }
                        }
                      })
                    }
                  } catch (dbError) {
                    console.error('[Test Provider] Failed to update payment in database:', dbError)
                  }
                })
              }, scenario.delay || testConfig.defaultDelay || 1000)

              return new Response(JSON.stringify({
                success: true,
                status: 'processing',
                scenario: scenario.name,
                delay: scenario.delay || testConfig.defaultDelay || 1000
              }), {
                headers: { 'Content-Type': 'application/json' }
              })
            } catch (error) {
              return handleWebhookError('Test Provider', error, 'Failed to process test payment')
            }
          }
        },
        {
          path: '/payload-billing/test/status/:id',
          method: 'get',
          handler: async (req) => {
            // Extract payment ID from URL path
            const urlParts = req.url?.split('/') || []
            const paymentId = urlParts[urlParts.length - 1]
            if (!paymentId) {
              return new Response(JSON.stringify({ error: 'Payment ID required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
              })
            }

            const session = testPaymentSessions.get(paymentId)
            if (!session) {
              return new Response(JSON.stringify({ error: 'Payment session not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
              })
            }

            return new Response(JSON.stringify({
              status: session.status,
              scenario: session.scenario?.name,
              method: session.method ? PAYMENT_METHODS[session.method]?.name : undefined
            }), {
              headers: { 'Content-Type': 'application/json' }
            })
          }
        }
      ]
    },
    onInit: async (payload: Payload) => {
      logWebhookEvent('Test Provider', 'Test payment provider initialized')

      // Clean up old sessions periodically (older than 1 hour)
      setInterval(() => {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
        testPaymentSessions.forEach((session, id) => {
          if (session.createdAt < oneHourAgo) {
            testPaymentSessions.delete(id)
          }
        })
      }, 10 * 60 * 1000) // Clean every 10 minutes
    },
    initPayment: async (payload, payment) => {
      // Validate required fields
      if (!payment.amount) {
        throw new Error('Amount is required')
      }
      if (!payment.currency) {
        throw new Error('Currency is required')
      }

      // Validate amount
      if (!isValidAmount(payment.amount)) {
        throw new Error('Invalid amount: must be a positive integer within reasonable limits')
      }

      // Validate currency code
      if (!isValidCurrencyCode(payment.currency)) {
        throw new Error('Invalid currency: must be a 3-letter ISO code')
      }

      // Generate unique test payment ID
      const testPaymentId = `test_pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      // Create test payment session
      const session = {
        id: testPaymentId,
        payment: { ...payment },
        createdAt: new Date(),
        status: 'pending' as PaymentOutcome
      }

      testPaymentSessions.set(testPaymentId, session)

      // Set provider ID and data
      payment.providerId = testPaymentId
      const providerData: ProviderData = {
        raw: {
          id: testPaymentId,
          amount: payment.amount,
          currency: payment.currency,
          description: payment.description,
          status: 'pending',
          testMode: true,
          paymentUrl: `${baseUrl}/api/payload-billing/test/payment/${testPaymentId}`,
          scenarios: scenarios.map(s => ({ id: s.id, name: s.name, description: s.description })),
          methods: Object.entries(PAYMENT_METHODS).map(([key, value]) => ({
            id: key,
            name: value.name,
            icon: value.icon
          }))
        },
        timestamp: new Date().toISOString(),
        provider: 'test'
      }
      payment.providerData = providerData

      return payment
    },
  } satisfies PaymentProvider
}

// Helper function to process test payment based on scenario
async function processTestPayment(
  payload: Payload,
  session: TestPaymentSession,
  pluginConfig: BillingPluginConfig
): Promise<void> {
  try {
    if (!session.scenario) return

    // Map scenario outcome to payment status
    let finalStatus: Payment['status'] = 'pending'
    switch (session.scenario.outcome) {
      case 'paid':
        finalStatus = 'succeeded'
        break
      case 'failed':
        finalStatus = 'failed'
        break
      case 'cancelled':
        finalStatus = 'canceled'
        break
      case 'expired':
        finalStatus = 'canceled' // Treat expired as canceled
        break
      case 'pending':
        finalStatus = 'pending'
        break
    }

    // Update session status
    session.status = session.scenario.outcome

    // Find and update the payment in the database
    const paymentsCollection = (typeof pluginConfig.collections?.payments === 'string'
      ? pluginConfig.collections.payments
      : 'payments') as any
    const payments = await payload.find({
      collection: paymentsCollection,
      where: {
        providerId: {
          equals: session.id
        }
      },
      limit: 1
    })

    if (payments.docs.length > 0) {
      const payment = payments.docs[0]

      // Update payment with final status and provider data
      const updatedProviderData: ProviderData = {
        raw: {
          ...session.payment,
          id: session.id,
          status: session.scenario.outcome,
          scenario: session.scenario.name,
          method: session.method,
          processedAt: new Date().toISOString(),
          testMode: true
        },
        timestamp: new Date().toISOString(),
        provider: 'test'
      }

      await payload.update({
        collection: paymentsCollection,
        id: payment.id,
        data: {
          status: finalStatus,
          providerData: updatedProviderData
        }
      })

      logWebhookEvent('Test Provider', `Payment ${session.id} processed with outcome: ${session.scenario.outcome}`)
    }
  } catch (error) {
    console.error('[Test Provider] Failed to process payment:', error)
    session.status = 'failed'
  }
}

// Helper function to generate test payment UI
function generateTestPaymentUI(
  session: TestPaymentSession,
  scenarios: PaymentScenario[],
  uiRoute: string,
  baseUrl: string,
  testConfig: TestProviderConfig
): string {
  const payment = session.payment
  const testModeIndicators = testConfig.testModeIndicators || {}

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Payment - ${payment.description || 'Payment'}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        ${testModeIndicators.showWarningBanners !== false ? `
        .test-banner {
            background: linear-gradient(90deg, #ff6b6b, #ffa726);
            color: white;
            padding: 12px 20px;
            text-align: center;
            font-weight: 600;
            font-size: 14px;
        }
        ` : ''}
        .header {
            background: #f8f9fa;
            padding: 30px 40px 20px;
            border-bottom: 1px solid #e9ecef;
        }
        .title {
            font-size: 24px;
            font-weight: 700;
            color: #2c3e50;
            margin-bottom: 8px;
        }
        .amount {
            font-size: 32px;
            font-weight: 800;
            color: #27ae60;
            margin-bottom: 16px;
        }
        .description {
            color: #6c757d;
            font-size: 16px;
            line-height: 1.5;
        }
        .content { padding: 40px; }
        .section { margin-bottom: 30px; }
        .section-title {
            font-size: 18px;
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .payment-methods {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 12px;
            margin-bottom: 20px;
        }
        .method {
            border: 2px solid #e9ecef;
            border-radius: 8px;
            padding: 16px 12px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s;
            background: white;
        }
        .method:hover {
            border-color: #007bff;
            background: #f8f9ff;
        }
        .method.selected {
            border-color: #007bff;
            background: #007bff;
            color: white;
        }
        .method-icon { font-size: 24px; margin-bottom: 8px; }
        .method-name { font-size: 12px; font-weight: 500; }
        .scenarios {
            display: grid;
            gap: 12px;
            margin-bottom: 20px;
        }
        .scenario {
            border: 2px solid #e9ecef;
            border-radius: 8px;
            padding: 16px;
            cursor: pointer;
            transition: all 0.2s;
            background: white;
        }
        .scenario:hover {
            border-color: #28a745;
            background: #f8fff9;
        }
        .scenario.selected {
            border-color: #28a745;
            background: #28a745;
            color: white;
        }
        .scenario-name { font-weight: 600; margin-bottom: 4px; }
        .scenario-desc { font-size: 14px; opacity: 0.8; }
        .process-btn {
            width: 100%;
            background: linear-gradient(135deg, #007bff, #0056b3);
            color: white;
            border: none;
            padding: 16px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            margin-top: 20px;
        }
        .process-btn:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(0,123,255,0.3);
        }
        .process-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        .status {
            text-align: center;
            padding: 20px;
            border-radius: 8px;
            margin-top: 20px;
            font-weight: 600;
        }
        .status.processing { background: #fff3cd; color: #856404; }
        .status.success { background: #d4edda; color: #155724; }
        .status.error { background: #f8d7da; color: #721c24; }
        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #007bff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-right: 10px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        ${testModeIndicators.showTestBadges !== false ? `
        .test-badge {
            display: inline-block;
            background: #6c757d;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            margin-left: 8px;
        }
        ` : ''}
    </style>
</head>
<body>
    <div class="container">
        ${testModeIndicators.showWarningBanners !== false ? `
        <div class="test-banner">
            🧪 TEST MODE - This is a simulated payment for development purposes
        </div>
        ` : ''}

        <div class="header">
            <div class="title">
                Test Payment Checkout
                ${testModeIndicators.showTestBadges !== false ? '<span class="test-badge">Test</span>' : ''}
            </div>
            <div class="amount">${payment.currency?.toUpperCase()} ${payment.amount ? (payment.amount / 100).toFixed(2) : '0.00'}</div>
            ${payment.description ? `<div class="description">${payment.description}</div>` : ''}
        </div>

        <div class="content">
            <div class="section">
                <div class="section-title">
                    💳 Select Payment Method
                </div>
                <div class="payment-methods">
                    ${Object.entries(PAYMENT_METHODS).map(([key, method]) => `
                        <div class="method" data-method="${key}">
                            <div class="method-icon">${method.icon}</div>
                            <div class="method-name">${method.name}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="section">
                <div class="section-title">
                    🎭 Select Test Scenario
                </div>
                <div class="scenarios">
                    ${scenarios.map(scenario => `
                        <div class="scenario" data-scenario="${scenario.id}">
                            <div class="scenario-name">${scenario.name}</div>
                            <div class="scenario-desc">${scenario.description}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <button class="process-btn" id="processBtn" disabled>
                Process Test Payment
            </button>

            <div id="status" class="status" style="display: none;"></div>
        </div>
    </div>

    <script>
        let selectedMethod = null;
        let selectedScenario = null;

        // Payment method selection
        document.querySelectorAll('.method').forEach(method => {
            method.addEventListener('click', () => {
                document.querySelectorAll('.method').forEach(m => m.classList.remove('selected'));
                method.classList.add('selected');
                selectedMethod = method.dataset.method;
                updateProcessButton();
            });
        });

        // Scenario selection
        document.querySelectorAll('.scenario').forEach(scenario => {
            scenario.addEventListener('click', () => {
                document.querySelectorAll('.scenario').forEach(s => s.classList.remove('selected'));
                scenario.classList.add('selected');
                selectedScenario = scenario.dataset.scenario;
                updateProcessButton();
            });
        });

        function updateProcessButton() {
            const btn = document.getElementById('processBtn');
            btn.disabled = !selectedMethod || !selectedScenario;
        }

        // Process payment
        document.getElementById('processBtn').addEventListener('click', async () => {
            const btn = document.getElementById('processBtn');
            const status = document.getElementById('status');

            btn.disabled = true;
            btn.innerHTML = '<span class="loading"></span>Processing...';

            try {
                const response = await fetch('/api/payload-billing/test/process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        paymentId: '${session.id}',
                        scenarioId: selectedScenario,
                        method: selectedMethod
                    })
                });

                const result = await response.json();

                if (result.success) {
                    status.className = 'status processing';
                    status.style.display = 'block';
                    status.innerHTML = \`<span class="loading"></span>Processing payment with \${result.scenario}...\`;

                    // Poll for status updates
                    setTimeout(() => pollStatus(), result.delay || 1000);
                } else {
                    throw new Error(result.error || 'Failed to process payment');
                }
            } catch (error) {
                status.className = 'status error';
                status.style.display = 'block';
                status.textContent = 'Error: ' + error.message;
                btn.disabled = false;
                btn.textContent = 'Process Test Payment';
            }
        });

        async function pollStatus() {
            try {
                const response = await fetch('/api/payload-billing/test/status/${session.id}');
                const result = await response.json();

                const status = document.getElementById('status');
                const btn = document.getElementById('processBtn');

                if (result.status === 'paid') {
                    status.className = 'status success';
                    status.textContent = '✅ Payment successful!';
                    setTimeout(() => {
                        window.location.href = '${baseUrl}/success';
                    }, 2000);
                } else if (result.status === 'failed' || result.status === 'cancelled' || result.status === 'expired') {
                    status.className = 'status error';
                    status.textContent = \`❌ Payment \${result.status}\`;
                    btn.disabled = false;
                    btn.textContent = 'Try Again';
                } else if (result.status === 'pending') {
                    status.className = 'status processing';
                    status.innerHTML = '<span class="loading"></span>Payment is still pending...';
                    setTimeout(() => pollStatus(), 2000);
                }
            } catch (error) {
                console.error('Failed to poll status:', error);
            }
        }

        ${testModeIndicators.consoleWarnings !== false ? `
        console.warn('🧪 TEST MODE: This is a simulated payment interface for development purposes');
        ` : ''}
    </script>
</body>
</html>`
}
