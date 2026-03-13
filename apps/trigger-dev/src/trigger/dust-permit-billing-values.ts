const PAP_ACCOUNT_RE = /Account Number:\s*(IV\d+)/i;
const PAP_AMOUNT_RE = /Amount:\s*(\$[\d,]+\.\d{2})/i;
const PAP_CONFIRMATION_RE = /Confirmation ID:\s*(\d+)/i;
const PAP_PAYMENT_DATE_RE = /Payment Date:\s*([^\r\n]+)/i;
const PAP_CARD_LAST_FOUR_RE = /Account Last Four:\s*(\d{4})/i;
const PAP_SUBTOTAL_RE = /(?:^|[\r\n])Sub Total:\s*(\$[\d,]+\.\d{2})/im;
const PAP_TOTAL_RE = /(?:^|[\r\n])Total:\s*(\$[\d,]+\.\d{2})/im;

export interface PointAndPayBillingDetails {
  cardLastFour?: string;
  confirmationId?: string;
  invoiceNumber: string;
  paymentDate?: string;
  permitCost: string;
}

export function extractPointAndPayBillingDetails(
  bodyText: string
): PointAndPayBillingDetails | null {
  const invoiceNumber = bodyText.match(PAP_ACCOUNT_RE)?.[1];
  if (!invoiceNumber) {
    return null;
  }

  const subtotal = bodyText.match(PAP_SUBTOTAL_RE)?.[1];
  const total = bodyText.match(PAP_TOTAL_RE)?.[1];
  const amount = bodyText.match(PAP_AMOUNT_RE)?.[1];

  return {
    cardLastFour: bodyText.match(PAP_CARD_LAST_FOUR_RE)?.[1],
    confirmationId: bodyText.match(PAP_CONFIRMATION_RE)?.[1],
    invoiceNumber,
    paymentDate: bodyText.match(PAP_PAYMENT_DATE_RE)?.[1]?.trim(),
    permitCost: subtotal ?? total ?? amount ?? "Unknown",
  };
}
