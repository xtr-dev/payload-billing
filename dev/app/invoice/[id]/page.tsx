'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

interface InvoiceItem {
  description: string
  quantity: number
  unitAmount: number
  id?: string
}

interface Customer {
  name: string
  email: string
  phone?: string
  company?: string
  taxId?: string
  billingAddress?: {
    line1: string
    line2?: string
    city: string
    state?: string
    postalCode: string
    country: string
  }
}

interface Invoice {
  id: string
  invoiceNumber: string
  customer: Customer
  currency: string
  items: InvoiceItem[]
  subtotal: number
  taxAmount?: number
  total: number
  status: string
  customMessage?: string
  issuedAt?: string
  dueDate?: string
  createdAt: string
}

export default function InvoiceViewPage() {
  const params = useParams()
  const invoiceId = params.id as string
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    fetchInvoice()
  }, [invoiceId])

  const fetchInvoice = async () => {
    try {
      const response = await fetch(`/api/demo/invoice/${invoiceId}`)
      const data = await response.json()

      if (data.success) {
        setInvoice(data.invoice)
      } else {
        setError(data.error || 'Failed to load invoice')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-slate-600 text-lg">Loading invoice...</div>
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="text-red-600 text-5xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">Invoice Not Found</h1>
            <p className="text-slate-600 mb-6">{error || 'The requested invoice could not be found.'}</p>
            <a
              href="/"
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Back to Demo
            </a>
          </div>
        </div>
      </div>
    )
  }

  const formatCurrency = (amount: number) => {
    return `${invoice.currency.toUpperCase()} ${(amount / 100).toFixed(2)}`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 print:bg-white print:py-0">
      <div className="max-w-4xl mx-auto px-4">
        {/* Print Button - Hidden when printing */}
        <div className="mb-6 flex justify-end print:hidden">
          <button
            onClick={handlePrint}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
              />
            </svg>
            Print Invoice
          </button>
        </div>

        {/* Invoice Container */}
        <div className="bg-white rounded-lg shadow-lg print:shadow-none print:rounded-none">
          <div className="p-8 md:p-12">
            {/* Header */}
            <div className="mb-8 pb-8 border-b-2 border-slate-200">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h1 className="text-4xl font-bold text-slate-800 mb-2">INVOICE</h1>
                  <p className="text-slate-600">Invoice #{invoice.invoiceNumber}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-blue-600 mb-1">
                    @xtr-dev/payload-billing
                  </div>
                  <p className="text-slate-600 text-sm">Test Provider Demo</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                {/* Bill To */}
                <div>
                  <h2 className="text-sm font-semibold text-slate-500 uppercase mb-3">Bill To</h2>
                  <div className="text-slate-800">
                    <p className="font-semibold text-lg">{invoice.customer.name}</p>
                    {invoice.customer.company && (
                      <p className="text-slate-600">{invoice.customer.company}</p>
                    )}
                    <p className="text-slate-600">{invoice.customer.email}</p>
                    {invoice.customer.phone && (
                      <p className="text-slate-600">{invoice.customer.phone}</p>
                    )}
                    {invoice.customer.billingAddress && (
                      <div className="mt-2 text-slate-600">
                        <p>{invoice.customer.billingAddress.line1}</p>
                        {invoice.customer.billingAddress.line2 && (
                          <p>{invoice.customer.billingAddress.line2}</p>
                        )}
                        <p>
                          {invoice.customer.billingAddress.city}
                          {invoice.customer.billingAddress.state && `, ${invoice.customer.billingAddress.state}`} {invoice.customer.billingAddress.postalCode}
                        </p>
                        <p>{invoice.customer.billingAddress.country}</p>
                      </div>
                    )}
                    {invoice.customer.taxId && (
                      <p className="mt-2 text-slate-600">Tax ID: {invoice.customer.taxId}</p>
                    )}
                  </div>
                </div>

                {/* Invoice Details */}
                <div className="text-right md:text-left">
                  <h2 className="text-sm font-semibold text-slate-500 uppercase mb-3">Invoice Details</h2>
                  <div className="space-y-2 text-slate-800">
                    <div className="flex justify-between md:justify-start md:gap-4">
                      <span className="text-slate-600">Status:</span>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          invoice.status === 'paid'
                            ? 'bg-green-100 text-green-800'
                            : invoice.status === 'open'
                              ? 'bg-blue-100 text-blue-800'
                              : invoice.status === 'void'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {invoice.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex justify-between md:justify-start md:gap-4">
                      <span className="text-slate-600">Issued:</span>
                      <span className="font-medium">
                        {formatDate(invoice.issuedAt || invoice.createdAt)}
                      </span>
                    </div>
                    {invoice.dueDate && (
                      <div className="flex justify-between md:justify-start md:gap-4">
                        <span className="text-slate-600">Due:</span>
                        <span className="font-medium">{formatDate(invoice.dueDate)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Custom Message */}
            {invoice.customMessage && (
              <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="text-sm font-semibold text-blue-900 uppercase mb-2">Message</h3>
                <p className="text-blue-800 whitespace-pre-wrap">{invoice.customMessage}</p>
              </div>
            )}

            {/* Line Items Table */}
            <div className="mb-8">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-slate-300">
                    <th className="text-left py-3 text-slate-700 font-semibold">Description</th>
                    <th className="text-right py-3 text-slate-700 font-semibold w-24">Qty</th>
                    <th className="text-right py-3 text-slate-700 font-semibold w-32">Unit Price</th>
                    <th className="text-right py-3 text-slate-700 font-semibold w-32">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item, index) => (
                    <tr key={item.id || index} className="border-b border-slate-200">
                      <td className="py-4 text-slate-800">{item.description}</td>
                      <td className="py-4 text-right text-slate-800">{item.quantity}</td>
                      <td className="py-4 text-right text-slate-800">
                        {formatCurrency(item.unitAmount)}
                      </td>
                      <td className="py-4 text-right text-slate-800 font-medium">
                        {formatCurrency(item.unitAmount * item.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end mb-8">
              <div className="w-full md:w-80">
                <div className="space-y-3">
                  <div className="flex justify-between py-2 text-slate-700">
                    <span>Subtotal:</span>
                    <span className="font-medium">{formatCurrency(invoice.subtotal)}</span>
                  </div>
                  {invoice.taxAmount !== undefined && invoice.taxAmount > 0 && (
                    <div className="flex justify-between py-2 text-slate-700">
                      <span>Tax:</span>
                      <span className="font-medium">{formatCurrency(invoice.taxAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-3 border-t-2 border-slate-300 text-lg font-bold text-slate-900">
                    <span>Total:</span>
                    <span>{formatCurrency(invoice.total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-8 border-t border-slate-200 text-center text-slate-500 text-sm">
              <p>Thank you for your business!</p>
              <p className="mt-2">
                This is a demo invoice generated by @xtr-dev/payload-billing plugin
              </p>
            </div>
          </div>
        </div>

        {/* Back Button - Hidden when printing */}
        <div className="mt-6 text-center print:hidden">
          <a
            href="/"
            className="inline-block text-blue-600 hover:text-blue-700 font-semibold transition-colors"
          >
            ← Back to Demo
          </a>
        </div>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }
          @page {
            margin: 1cm;
          }
        }
      `}</style>
    </div>
  )
}
