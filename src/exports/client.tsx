/**
 * Client-side components and utilities for the billing plugin
 * These components run in the browser and have access to React hooks and client-side APIs
 */

'use client'

import React from 'react'

// Example client component that could be used in the admin dashboard
export const BillingDashboardWidget: React.FC = () => {
  return (
    <div className="billing-dashboard-widget">
      <h3>Billing Overview</h3>
      <p>Payment statistics and recent transactions will be displayed here.</p>
    </div>
  )
}

// Client-side utilities
export const formatCurrency = (amount: number, currency: string) => {
  return new Intl.NumberFormat('en-US', {
    currency: currency.toUpperCase(),
    style: 'currency',
  }).format(amount / 100)
}

export const getPaymentStatusColor = (status: string) => {
  switch (status) {
    case 'canceled':
      return 'gray'
    case 'failed':
      return 'red'
    case 'pending':
      return 'yellow'
    case 'succeeded':
      return 'green'
    default:
      return 'blue'
  }
}

// Example of a client component for payment status display
export const PaymentStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const color = getPaymentStatusColor(status)
  
  return (
    <span 
      className={`payment-status-badge payment-status-${status}`}
      style={{ 
        backgroundColor: color,
        borderRadius: '4px',
        color: 'white',
        fontSize: '12px',
        padding: '2px 8px'
      }}
    >
      {status.toUpperCase()}
    </span>
  )
}

export default {
  BillingDashboardWidget,
  formatCurrency,
  getPaymentStatusColor,
  PaymentStatusBadge,
}