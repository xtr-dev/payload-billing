import configPromise from '@payload-config'
import { getPayload } from 'payload'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const payload = await getPayload({
      config: configPromise,
    })

    const { id: paymentProviderId } = await params

    if (!paymentProviderId) {
      return Response.json(
        { success: false, error: 'Payment ID is required' },
        { status: 400 }
      )
    }

    // Find payment by providerId (the test provider uses this format)
    const payments = await payload.find({
      collection: 'payments',
      where: {
        providerId: {
          equals: paymentProviderId,
        },
      },
      limit: 1,
    })

    if (!payments.docs.length) {
      return Response.json(
        { success: false, error: 'Payment not found' },
        { status: 404 }
      )
    }

    const payment = payments.docs[0]

    return Response.json({
      success: true,
      payment: {
        id: payment.id,
        providerId: payment.providerId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        description: payment.description,
        invoice: payment.invoice,
        metadata: payment.metadata,
      },
    })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to fetch payment:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch payment',
      },
      { status: 500 }
    )
  }
}
