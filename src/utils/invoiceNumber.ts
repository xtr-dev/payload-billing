export const generateInvoiceNumber = (): string => {
  return `INV-${Date.now()}`
}
