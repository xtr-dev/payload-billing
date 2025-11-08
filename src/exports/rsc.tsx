/**
 * React Server Components (RSC) and server-side utilities for the billing plugin
 * These components run on the server and can access server-side APIs and databases
 */

import React from 'react'

// Server component that can fetch data during server-side rendering
interface BillingServerStatsProps {
  payloadInstance?: unknown
}

export const BillingServerStats: React.FC<BillingServerStatsProps> = ({
  payloadInstance: _payloadInstance
}) => {
  // In a real implementation, this would fetch data from the database
  // const stats = await payloadInstance?.find({
  //   collection: 'payments',
  //   limit: 0,
  //   depth: 0
  // })

  return (
    <div className="billing-server-stats">
      <h3>Payment Statistics</h3>
      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-label">Total Payments</span>
          <span className="stat-value">-</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Successful</span>
          <span className="stat-value">-</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Pending</span>
          <span className="stat-value">-</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Failed</span>
          <span className="stat-value">-</span>
        </div>
      </div>
    </div>
  )
}

// Server-side utility functions
export const generateInvoiceNumber = () => {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `INV-${timestamp}-${random}`
}

export const calculateInvoiceTotal = (items: Array<{
  quantity: number
  unitAmount: number
}>, taxRate: number = 0) => {
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitAmount), 0)
  const taxAmount = Math.round(subtotal * taxRate)
  return {
    subtotal,
    taxAmount,
    total: subtotal + taxAmount
  }
}

// Server component for displaying invoice details
interface InvoiceDetailsProps {
  invoice?: {
    amount: number
    currency: string
    customer?: {
      email?: string
      name?: string
    }
    dueDate?: string
    items?: Array<{
      description: string
      quantity: number
      totalAmount: number
      unitAmount: number
    }>
    number: string
    status: string
  }
  readonly?: boolean
}

export const InvoiceDetails: React.FC<InvoiceDetailsProps> = ({ invoice, readonly = false }) => {
  if (!invoice) {
    return <div>No invoice data available</div>
  }

  return (
    <div className="invoice-details">
      <div className="invoice-header">
        <h3>Invoice {invoice.number}</h3>
        <span className={`status-badge status-${invoice.status}`}>
          {invoice.status}
        </span>
      </div>
      
      <div className="invoice-content">
        <div className="invoice-meta">
          <p><strong>Customer:</strong> {invoice.customer?.name || invoice.customer?.email}</p>
          <p><strong>Due Date:</strong> {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A'}</p>
          <p><strong>Amount:</strong> {invoice.currency} {(invoice.amount / 100).toFixed(2)}</p>
        </div>

        {invoice.items && invoice.items.length > 0 && (
          <div className="invoice-items">
            <h4>Items</h4>
            <table className="items-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Quantity</th>
                  <th>Unit Amount</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, index) => (
                  <tr key={index}>
                    <td>{item.description}</td>
                    <td>{item.quantity}</td>
                    <td>{invoice.currency} {(item.unitAmount / 100).toFixed(2)}</td>
                    <td>{invoice.currency} {(item.totalAmount / 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default {
  BillingServerStats,
  calculateInvoiceTotal,
  generateInvoiceNumber,
  InvoiceDetails,
}