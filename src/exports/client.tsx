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

// Test mode indicator components
export const TestModeWarningBanner: React.FC<{ visible?: boolean }> = ({ visible = true }) => {
  if (!visible) return null

  return (
    <div style={{
      background: 'linear-gradient(90deg, #ff6b6b, #ffa726)',
      color: 'white',
      padding: '12px 20px',
      textAlign: 'center',
      fontWeight: 600,
      fontSize: '14px',
      marginBottom: '20px',
      borderRadius: '4px'
    }}>
      🧪 TEST MODE - Payment system is running in test mode for development
    </div>
  )
}

export const TestModeBadge: React.FC<{ visible?: boolean }> = ({ visible = true }) => {
  if (!visible) return null

  return (
    <span style={{
      display: 'inline-block',
      background: '#6c757d',
      color: 'white',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 600,
      textTransform: 'uppercase',
      marginLeft: '8px'
    }}>
      Test
    </span>
  )
}

export const TestPaymentControls: React.FC<{
  paymentId?: string
  onScenarioSelect?: (scenario: string) => void
  onMethodSelect?: (method: string) => void
}> = ({ paymentId, onScenarioSelect, onMethodSelect }) => {
  const [selectedScenario, setSelectedScenario] = React.useState('')
  const [selectedMethod, setSelectedMethod] = React.useState('')

  const scenarios = [
    { id: 'instant-success', name: 'Instant Success', description: 'Payment succeeds immediately' },
    { id: 'delayed-success', name: 'Delayed Success', description: 'Payment succeeds after delay' },
    { id: 'cancelled-payment', name: 'Cancelled Payment', description: 'User cancels payment' },
    { id: 'declined-payment', name: 'Declined Payment', description: 'Payment declined' },
    { id: 'expired-payment', name: 'Expired Payment', description: 'Payment expires' },
    { id: 'pending-payment', name: 'Pending Payment', description: 'Payment stays pending' }
  ]

  const methods = [
    { id: 'ideal', name: 'iDEAL', icon: '🏦' },
    { id: 'creditcard', name: 'Credit Card', icon: '💳' },
    { id: 'paypal', name: 'PayPal', icon: '🅿️' },
    { id: 'applepay', name: 'Apple Pay', icon: '🍎' },
    { id: 'banktransfer', name: 'Bank Transfer', icon: '🏛️' }
  ]

  return (
    <div style={{ border: '1px solid #e9ecef', borderRadius: '8px', padding: '16px', margin: '16px 0' }}>
      <h4 style={{ marginBottom: '12px', color: '#2c3e50' }}>🧪 Test Payment Controls</h4>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>Payment Method:</label>
        <select
          value={selectedMethod}
          onChange={(e) => {
            setSelectedMethod(e.target.value)
            onMethodSelect?.(e.target.value)
          }}
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
        >
          <option value="">Select payment method...</option>
          {methods.map(method => (
            <option key={method.id} value={method.id}>
              {method.icon} {method.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>Test Scenario:</label>
        <select
          value={selectedScenario}
          onChange={(e) => {
            setSelectedScenario(e.target.value)
            onScenarioSelect?.(e.target.value)
          }}
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
        >
          <option value="">Select test scenario...</option>
          {scenarios.map(scenario => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.name} - {scenario.description}
            </option>
          ))}
        </select>
      </div>

      {paymentId && (
        <div style={{ marginTop: '12px', padding: '8px', background: '#f8f9fa', borderRadius: '4px' }}>
          <small style={{ color: '#6c757d' }}>
            Payment ID: <code>{paymentId}</code>
          </small>
        </div>
      )}
    </div>
  )
}

export default {
  BillingDashboardWidget,
  formatCurrency,
  getPaymentStatusColor,
  PaymentStatusBadge,
  TestModeWarningBanner,
  TestModeBadge,
  TestPaymentControls,
}