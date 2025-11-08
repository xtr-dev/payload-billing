import configPromise from '@payload-config'
import { getPayload } from 'payload'

export async function POST(request: Request) {
  try {
    const payload = await getPayload({
      config: configPromise,
    })

    const body = await request.json()
    const { amount, currency, description } = body

    if (!amount || !currency) {
      return Response.json(
        { success: false, error: 'Amount and currency are required' },
        { status: 400 }
      )
    }

    // Create a payment using the test provider
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
        },
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
