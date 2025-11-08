import configPromise from '@payload-config'
import { getPayload } from 'payload'

export async function POST(request: Request) {
  try {
    const payload = await getPayload({
      config: configPromise,
    })

    const body = await request.json()
    const { amount, currency, description, message, customerName, customerEmail, customerCompany } = body

    // eslint-disable-next-line no-console
    console.log('Received payment request:', { amount, currency, customerName, customerEmail, customerCompany })

    if (!amount || !currency) {
      return Response.json(
        { success: false, error: 'Amount and currency are required' },
        { status: 400 }
      )
    }

    if (!customerName || !customerEmail) {
      // eslint-disable-next-line no-console
      console.log('Missing customer info:', { customerName, customerEmail })
      return Response.json(
        { success: false, error: 'Customer name and email are required' },
        { status: 400 }
      )
    }

    // Create a payment first using the test provider
    const payment = await payload.create({
      collection: 'payments',
      data: {
        provider: 'test',
        amount,
        currency,
        description: description || 'Demo payment',
        status: 'pending',
        metadata: {
          source: 'demo-ui',
          createdAt: new Date().toISOString(),
          customMessage: message, // Store the custom message in metadata
        },
      },
    })

    // Create an invoice linked to the payment
    // The invoice's afterChange hook will automatically link the payment back to the invoice
    const invoice = await payload.create({
      collection: 'invoices',
      data: {
        payment: payment.id, // Link to the payment
        customerInfo: {
          name: customerName,
          email: customerEmail,
          company: customerCompany,
        },
        billingAddress: {
          line1: '123 Demo Street',
          city: 'Demo City',
          state: 'DC',
          postalCode: '12345',
          country: 'US',
        },
        currency,
        items: [
          {
            description: description || 'Demo payment',
            quantity: 1,
            unitAmount: amount,
          },
        ],
        taxAmount: 0,
        status: 'open',
      },
    })

    return Response.json({
      success: true,
      payment: {
        id: payment.providerId, // Use the test provider ID for the UI
        paymentId: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        description: payment.description,
        invoiceId: invoice.id,
      },
    })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to create payment:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create payment',
      },
      { status: 500 }
    )
  }
}
