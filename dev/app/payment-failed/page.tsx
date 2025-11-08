'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function PaymentFailedContent() {
  const searchParams = useSearchParams()
  const paymentId = searchParams.get('paymentId')
  const reason = searchParams.get('reason') || 'unknown'
  const amount = searchParams.get('amount')
  const currency = searchParams.get('currency')

  const getReasonText = (reason: string) => {
    switch (reason) {
      case 'failed':
        return 'Payment was declined'
      case 'cancelled':
        return 'Payment was cancelled'
      case 'expired':
        return 'Payment session expired'
      default:
        return 'Payment could not be completed'
    }
  }

  const getReasonDescription = (reason: string) => {
    switch (reason) {
      case 'failed':
        return 'The payment provider declined the transaction. This is a simulated failure for testing purposes.'
      case 'cancelled':
        return 'The payment was cancelled before completion. You can try again with a different test scenario.'
      case 'expired':
        return 'The payment session timed out. Please create a new payment to try again.'
      default:
        return 'An unexpected error occurred during payment processing.'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-600 to-orange-700 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-red-600 to-orange-600 p-8 text-white text-center">
          <div className="mb-4">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto">
              <svg
                className="w-12 h-12 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
          </div>
          <h1 className="text-4xl font-bold mb-2">Payment {reason.charAt(0).toUpperCase() + reason.slice(1)}</h1>
          <p className="text-red-100 text-lg">
            {getReasonText(reason)}
          </p>
        </div>

        <div className="p-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
            <h2 className="font-semibold text-red-900 mb-3 text-lg">
              What Happened?
            </h2>
            <p className="text-red-800 mb-4">
              {getReasonDescription(reason)}
            </p>

            <div className="space-y-3 pt-4 border-t border-red-200">
              {paymentId && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Payment ID:</span>
                  <code className="bg-red-100 text-red-800 px-3 py-1 rounded font-mono text-sm">
                    {paymentId}
                  </code>
                </div>
              )}
              {amount && currency && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Amount:</span>
                  <span className="text-red-900 font-bold text-xl">
                    {currency.toUpperCase()} {(parseInt(amount) / 100).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Status:</span>
                <span className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-semibold capitalize">
                  {reason}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-slate-800 text-lg">Try Again</h3>

            <div className="grid gap-3">
              <Link
                href="/"
                className="flex items-center justify-between p-4 border-2 border-red-300 bg-red-50 rounded-lg hover:border-red-500 hover:bg-red-100 transition-all group cursor-pointer"
              >
                <div>
                  <div className="font-semibold text-red-800 group-hover:text-red-900">
                    🔄 Try Another Payment
                  </div>
                  <div className="text-sm text-red-700">
                    Create a new test payment with different scenario
                  </div>
                </div>
                <svg
                  className="w-5 h-5 text-red-500 group-hover:text-red-700"
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
                    💳 View Payment History
                  </div>
                  <div className="text-sm text-slate-600">
                    Check all payments in admin
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
            </div>
          </div>

          <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>💡 Testing Tip:</strong> This failure was simulated using the test provider.
              Try selecting a different test scenario like "Instant Success" or "Delayed Success"
              to see a successful payment flow.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PaymentFailedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-red-600 to-orange-700 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    }>
      <PaymentFailedContent />
    </Suspense>
  )
}
