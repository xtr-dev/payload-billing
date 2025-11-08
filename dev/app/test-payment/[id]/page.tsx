'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface PaymentMethod {
  id: string
  name: string
  icon: string
}

interface Scenario {
  id: string
  name: string
  description: string
  outcome: string
  delay?: number
}

interface TestProviderConfig {
  enabled: boolean
  scenarios: Scenario[]
  methods: PaymentMethod[]
  testModeIndicators: {
    showWarningBanners: boolean
    showTestBadges: boolean
    consoleWarnings: boolean
  }
  defaultDelay: number
  customUiRoute: string
}

interface PaymentSession {
  id: string
  amount: number
  currency: string
  description?: string
}

export default function TestPaymentPage() {
  const params = useParams()
  const router = useRouter()
  const paymentId = params.id as string

  const [config, setConfig] = useState<TestProviderConfig | null>(null)
  const [session, setSession] = useState<PaymentSession | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null)
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [status, setStatus] = useState<{
    type: 'idle' | 'processing' | 'success' | 'error'
    message: string
  }>({ type: 'idle', message: '' })

  useEffect(() => {
    // Load test provider config
    fetch('/api/payload-billing/test/config')
      .then((res) => res.json())
      .then((data) => {
        setConfig(data)
        if (data.testModeIndicators?.consoleWarnings) {
          console.warn('[Test Provider] 🧪 TEST MODE: This is a simulated payment interface')
        }
      })
      .catch((err) => {
        console.error('Failed to load test provider config:', err)
      })

    // Load payment session (mock data for demo)
    setSession({
      id: paymentId,
      amount: 2500,
      currency: 'USD',
      description: 'Demo payment for testing the billing plugin',
    })
  }, [paymentId])

  const handleProcessPayment = async () => {
    if (!selectedMethod || !selectedScenario) return

    setProcessing(true)
    setStatus({ type: 'processing', message: 'Initiating payment...' })

    try {
      const response = await fetch('/api/payload-billing/test/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId,
          scenarioId: selectedScenario,
          method: selectedMethod,
        }),
      })

      const result = await response.json()

      if (result.success) {
        const scenario = config?.scenarios.find((s) => s.id === selectedScenario)
        setStatus({
          type: 'processing',
          message: `Processing payment with ${scenario?.name}...`,
        })

        // Poll for status updates
        setTimeout(() => pollStatus(), result.delay || 1000)
      } else {
        throw new Error(result.error || 'Failed to process payment')
      }
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'An error occurred',
      })
      setProcessing(false)
    }
  }

  const pollStatus = async () => {
    try {
      const response = await fetch(`/api/payload-billing/test/status/${paymentId}`)
      const result = await response.json()

      if (result.status === 'paid') {
        setStatus({ type: 'success', message: '✅ Payment successful!' })
        setTimeout(() => {
          const params = new URLSearchParams({
            paymentId: paymentId,
            amount: session.amount.toString(),
            currency: session.currency,
          })
          router.push(`/payment-success?${params.toString()}`)
        }, 2000)
      } else if (['failed', 'cancelled', 'expired'].includes(result.status)) {
        setStatus({ type: 'error', message: `❌ Payment ${result.status}` })
        setTimeout(() => {
          const params = new URLSearchParams({
            paymentId: paymentId,
            amount: session.amount.toString(),
            currency: session.currency,
            reason: result.status,
          })
          router.push(`/payment-failed?${params.toString()}`)
        }, 2000)
      } else if (result.status === 'pending') {
        setStatus({ type: 'processing', message: 'Payment is still pending...' })
        setTimeout(() => pollStatus(), 2000)
      }
    } catch (error) {
      console.error('[Test Provider] Failed to poll status:', error)
      setStatus({ type: 'error', message: 'Failed to check payment status' })
      setProcessing(false)
    }
  }

  if (!config || !session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8">
          <div className="animate-pulse">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
          {config.testModeIndicators.showWarningBanners && (
            <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-6 py-3 text-center font-semibold">
              🧪 TEST MODE - This is a simulated payment for development purposes
            </div>
          )}

          <div className="bg-slate-50 px-8 py-6 border-b border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl font-bold text-slate-800">Test Payment Checkout</h1>
              {config.testModeIndicators.showTestBadges && (
                <span className="bg-slate-600 text-white px-3 py-1 rounded text-xs font-bold uppercase">
                  Test
                </span>
              )}
            </div>
            <div className="text-3xl font-bold text-green-600 mb-3">
              {session.currency.toUpperCase()} {(session.amount / 100).toFixed(2)}
            </div>
            {session.description && (
              <p className="text-slate-600 text-base">{session.description}</p>
            )}
          </div>

          <div className="p-8">
            {/* Payment Methods */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                💳 Select Payment Method
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {config.methods.map((method) => (
                  <button
                    key={method.id}
                    onClick={() => setSelectedMethod(method.id)}
                    disabled={processing}
                    className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                      selectedMethod === method.id
                        ? 'border-blue-500 bg-blue-500 text-white shadow-lg'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div className="text-2xl mb-2">{method.icon}</div>
                    <div className="text-sm font-medium">{method.name}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Test Scenarios */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                🎭 Select Test Scenario
              </h2>
              <div className="space-y-3">
                {config.scenarios.map((scenario) => (
                  <button
                    key={scenario.id}
                    onClick={() => setSelectedScenario(scenario.id)}
                    disabled={processing}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-all cursor-pointer ${
                      selectedScenario === scenario.id
                        ? 'border-green-500 bg-green-500 text-white shadow-lg'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-green-300 hover:bg-green-50'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div className="font-semibold mb-1">{scenario.name}</div>
                    <div className={`text-sm ${selectedScenario === scenario.id ? 'text-white/90' : 'text-slate-600'}`}>
                      {scenario.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Process Button */}
            <button
              onClick={handleProcessPayment}
              disabled={!selectedMethod || !selectedScenario || processing}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold py-4 rounded-lg transition-all hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none cursor-pointer"
            >
              {processing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span>
                  Processing...
                </span>
              ) : (
                'Process Test Payment'
              )}
            </button>

            {/* Status Message */}
            {status.type !== 'idle' && (
              <div
                className={`mt-6 p-4 rounded-lg text-center font-semibold ${
                  status.type === 'processing'
                    ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                    : status.type === 'success'
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                {status.type === 'processing' && (
                  <span className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-800 mr-2"></span>
                )}
                {status.message}
              </div>
            )}
          </div>
        </div>

        {/* Info Card */}
        <div className="mt-6 bg-white/10 backdrop-blur-sm text-white rounded-lg p-6">
          <h3 className="font-semibold mb-2">💡 Demo Information</h3>
          <p className="text-sm text-white/90">
            This is a custom test payment UI for the @xtr-dev/payload-billing plugin. Select a
            payment method and scenario to simulate different payment outcomes. The payment will be
            processed according to the selected scenario.
          </p>
        </div>
      </div>
    </div>
  )
}
