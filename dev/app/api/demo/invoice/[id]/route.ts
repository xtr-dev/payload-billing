import configPromise from '@payload-config'
import { getPayload } from 'payload'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const payload = await getPayload({
      config: configPromise,
    })

    const { id: invoiceId } = await params

    if (!invoiceId) {
      return Response.json(
        { success: false, error: 'Invoice ID is required' },
        { status: 400 }
      )
    }

    // Fetch the invoice
    const invoice = await payload.findByID({
      collection: 'invoices',
      id: invoiceId,
    })

    if (!invoice) {
      return Response.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      )
    }

    // The dev config has no customers collection or customer relationship -
    // invoices carry customerInfo/billingAddress directly.
    let customerInfo = null

    if (invoice.customerInfo) {
      customerInfo = {
        name: invoice.customerInfo.name,
        email: invoice.customerInfo.email,
        phone: invoice.customerInfo.phone,
        company: invoice.customerInfo.company,
        taxId: invoice.customerInfo.taxId,
        billingAddress: invoice.billingAddress,
      }
    }

    // Default customer if neither is available
    if (!customerInfo) {
      customerInfo = {
        name: 'Unknown Customer',
        email: 'unknown@example.com',
      }
    }

    // Calculate subtotal from items (or use stored subtotal)
    const subtotal = invoice.subtotal || invoice.items?.reduce((sum: number, item: any) => {
      return sum + (item.unitAmount * item.quantity)
    }, 0) || 0

    const taxAmount = invoice.taxAmount || 0
    const total = invoice.amount || (subtotal + taxAmount)

    // Prepare the response
    const invoiceData = {
      id: invoice.id,
      invoiceNumber: invoice.number,
      customer: customerInfo,
      currency: invoice.currency,
      items: invoice.items || [],
      subtotal,
      taxAmount,
      total,
      status: invoice.status,
      customMessage: invoice.customMessage,
      dueDate: invoice.dueDate,
      createdAt: invoice.createdAt,
    }

    return Response.json({
      success: true,
      invoice: invoiceData,
    })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to fetch invoice:', error)
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch invoice',
      },
      { status: 500 }
    )
  }
}
