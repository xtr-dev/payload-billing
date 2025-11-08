'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function PaymentSuccessContent() {
  const searchParams = useSearchParams()
  const paymentId = searchParams.get('paymentId')
  const amount = searchParams.get('amount')
  const currency = searchParams.get('currency')

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-600 to-emerald-700 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-8 text-white text-center">
          <div className="mb-4">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto">
              <svg
                className="w-12 h-12 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>
          <h1 className="text-4xl font-bold mb-2">Payment Successful!</h1>
          <p className="text-green-100 text-lg">
            Your test payment has been processed successfully
          </p>
        </div>

        <div className="p-8">
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
            <h2 className="font-semibold text-green-900 mb-4 text-lg">
              Payment Details
            </h2>
            <div className="space-y-3">
              {paymentId && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Payment ID:</span>
                  <code className="bg-green-100 text-green-800 px-3 py-1 rounded font-mono text-sm">
                    {paymentId}
                  </code>
                </div>
              )}
              {amount && currency && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Amount:</span>
                  <span className="text-green-900 font-bold text-xl">
                    {currency.toUpperCase()} {(parseInt(amount) / 100).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Status:</span>
                <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-semibold">
                  Succeeded
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Provider:</span>
                <span className="text-slate-900 font-medium">Test Provider</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-slate-800 text-lg">What's Next?</h3>

            <div className="grid gap-3">
              <Link
                href="/"
                className="flex items-center justify-between p-4 border-2 border-slate-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all group cursor-pointer"
              >
                <div>
                  <div className="font-semibold text-slate-800 group-hover:text-green-700">
                    🏠 Back to Demo
                  </div>
                  <div className="text-sm text-slate-600">
                    Try another test payment
                  </div>
                </div>
                <svg
                  className="w-5 h-5 text-slate-400 group-hover:text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>

              <Link
                href="/admin/collections/payments"
                className="flex items-center justify-between p-4 border-2 border-slate-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all group cursor-pointer"
              >
                <div>
                  <div className="font-semibold text-slate-800 group-hover:text-blue-700">
                    💳 View All Payments
                  </div>
                  <div className="text-sm text-slate-600">
                    Check payment history in admin
                  </div>
                </div>
                <svg
                  className="w-5 h-5 text-slate-400 group-hover:text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>

              <Link
                href="/admin/collections/invoices"
                className="flex items-center justify-between p-4 border-2 border-slate-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all group cursor-pointer"
              >
                <div>
                  <div className="font-semibold text-slate-800 group-hover:text-purple-700">
                    🧾 View Invoices
                  </div>
                  <div className="text-sm text-slate-600">
                    Check invoices in admin
                  </div>
                </div>
                <svg
                  className="w-5 h-5 text-slate-400 group-hover:text-purple-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>
            </div>
          </div>

          <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>💡 Demo Tip:</strong> This was a simulated payment using the test provider.
              In production, you would integrate with real providers like Stripe or Mollie.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-green-600 to-emerald-700 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  )
}
