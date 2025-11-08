'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function HomePage() {
  const [paymentId, setPaymentId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [customerName, setCustomerName] = useState<string>('Demo Customer')
  const [customerEmail, setCustomerEmail] = useState<string>('demo@example.com')
  const [customerCompany, setCustomerCompany] = useState<string>('Demo Company')
  const [message, setMessage] = useState<string>('')

  const createDemoPayment = async () => {
    setLoading(true)
    setError('')

    // Validate required fields
    if (!customerName || !customerEmail) {
      setError('Customer name and email are required')
      setLoading(false)
      return
    }

    try {
      const requestBody = {
        amount: 2500,
        currency: 'USD',
        description: 'Demo payment from custom UI',
        customerName,
        customerEmail,
        customerCompany: customerCompany || undefined,
        message: message || undefined,
      }

      console.log('Sending payment request:', requestBody)

      const response = await fetch('/api/demo/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const data = await response.json()

      if (data.success) {
        setPaymentId(data.payment.id)
      } else {
        setError(data.error || 'Failed to create payment')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-8 text-white">
            <h1 className="text-4xl font-bold mb-2">Billing Plugin Demo</h1>
            <p className="text-blue-100">
              Test the @xtr-dev/payload-billing plugin with the test provider
            </p>
          </div>

          <div className="p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-slate-800 mb-4">
                🎮 Interactive Demo
              </h2>
              <p className="text-slate-600 mb-6">
                This demo shows how to integrate the billing plugin into your application. Click
                the button below to create a test payment and see the custom payment UI in action.
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
                <h3 className="font-semibold text-slate-800 mb-4">
                  Create Test Payment
                </h3>

                {!paymentId ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="customerName" className="block text-sm font-medium text-slate-700 mb-2">
                          Customer Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          id="customerName"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="John Doe"
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor="customerEmail" className="block text-sm font-medium text-slate-700 mb-2">
                          Customer Email <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          id="customerEmail"
                          value={customerEmail}
                          onChange={(e) => setCustomerEmail(e.target.value)}
                          placeholder="john@example.com"
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="customerCompany" className="block text-sm font-medium text-slate-700 mb-2">
                        Company Name (Optional)
                      </label>
                      <input
                        type="text"
                        id="customerCompany"
                        value={customerCompany}
                        onChange={(e) => setCustomerCompany(e.target.value)}
                        placeholder="Acme Corporation"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label htmlFor="message" className="block text-sm font-medium text-slate-700 mb-2">
                        Custom Message (Optional)
                      </label>
                      <textarea
                        id="message"
                        rows={3}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Enter a message to include in the invoice..."
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        This message will be added to the invoice using collection extension options
                      </p>
                    </div>

                    <button
                      onClick={createDemoPayment}
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {loading ? 'Creating Payment...' : 'Create Demo Payment'}
                    </button>

                    {error && (
                      <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg">
                        {error}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-2 text-green-800 font-semibold mb-2">
                        <span>✓</span>
                        <span>Payment Created Successfully!</span>
                      </div>
                      <p className="text-sm text-green-700">
                        Payment ID: <code className="bg-green-100 px-2 py-1 rounded">{paymentId}</code>
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <Link
                        href={`/test-payment/${paymentId}`}
                        className="bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg transition-all inline-block cursor-pointer"
                      >
                        Go to Payment Page →
                      </Link>
                      <button
                        onClick={() => {
                          setPaymentId('')
                          setError('')
                          setCustomerName('Demo Customer')
                          setCustomerEmail('demo@example.com')
                          setCustomerCompany('Demo Company')
                          setMessage('')
                        }}
                        className="bg-slate-200 text-slate-700 px-6 py-3 rounded-lg font-semibold hover:bg-slate-300 transition-all cursor-pointer"
                      >
                        Create Another
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mb-8">
              <h2 className="text-2xl font-bold text-slate-800 mb-4">
                📚 Quick Links
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <Link
                  href="/admin/collections/payments"
                  className="p-4 border-2 border-slate-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all cursor-pointer"
                >
                  <div className="font-semibold text-slate-800 mb-1">💳 Payments</div>
                  <div className="text-sm text-slate-600">View all payment transactions</div>
                </Link>

                <Link
                  href="/admin/collections/invoices"
                  className="p-4 border-2 border-slate-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all cursor-pointer"
                >
                  <div className="font-semibold text-slate-800 mb-1">🧾 Invoices</div>
                  <div className="text-sm text-slate-600">Manage invoices and billing</div>
                </Link>

                <Link
                  href="/admin/collections/refunds"
                  className="p-4 border-2 border-slate-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all cursor-pointer"
                >
                  <div className="font-semibold text-slate-800 mb-1">🔄 Refunds</div>
                  <div className="text-sm text-slate-600">Process and track refunds</div>
                </Link>

                <Link
                  href="/admin/collections/customers"
                  className="p-4 border-2 border-slate-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all cursor-pointer"
                >
                  <div className="font-semibold text-slate-800 mb-1">👥 Customers</div>
                  <div className="text-sm text-slate-600">Manage customer information</div>
                </Link>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h2 className="text-xl font-bold text-slate-800 mb-3">
                💡 About This Demo
              </h2>
              <div className="space-y-3 text-slate-700">
                <p>
                  This demo application showcases the <code className="bg-blue-100 px-2 py-1 rounded">@xtr-dev/payload-billing</code> plugin
                  for PayloadCMS 3.x with the following features:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Test payment provider with customizable scenarios</li>
                  <li>Custom payment UI page with modern design</li>
                  <li>Customer relationship management with auto-sync</li>
                  <li>Invoice generation with line items and tax calculation</li>
                  <li>Refund processing and tracking</li>
                  <li>Sample data seeding for quick testing</li>
                </ul>
                <p className="pt-2">
                  The test provider allows you to simulate different payment outcomes including
                  success, failure, cancellation, and more - perfect for development and testing!
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
