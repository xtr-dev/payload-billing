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

    // Get customer info - either from relationship or direct fields
    let customerInfo = null

    if (invoice.customer) {
      // Try to fetch from customer relationship
      try {
        const customerData = await payload.findByID({
          collection: 'customers',
          id: typeof invoice.customer === 'object' ? invoice.customer.id : invoice.customer,
        })
        customerInfo = {
          name: customerData.name,
          email: customerData.email,
          phone: customerData.phone,
          company: customerData.company,
          taxId: customerData.taxId,
          billingAddress: customerData.address,
        }
      } catch (error) {
        // Customer not found or collection doesn't exist
        console.error('Failed to fetch customer:', error)
      }
    }

    // Fall back to direct customerInfo fields if no customer relationship
    if (!customerInfo && invoice.customerInfo) {
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
      invoiceNumber: invoice.number || invoice.invoiceNumber,
      customer: customerInfo,
      currency: invoice.currency,
      items: invoice.items || [],
      subtotal,
      taxAmount,
      total,
      status: invoice.status,
      customMessage: invoice.customMessage,
      issuedAt: invoice.issuedAt,
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
