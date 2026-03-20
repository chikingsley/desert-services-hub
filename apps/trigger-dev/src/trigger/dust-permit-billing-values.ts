const PAP_ACCOUNT_RE = /Account Number:\s*(IV\d+)/i;
const PAP_AMOUNT_RE = /Amount:\s*(\$[\d,]+\.\d{2})/i;
const PAP_CONFIRMATION_RE = /Confirmation ID:\s*(\d+)/i;
const PAP_PAYMENT_DATE_RE = /Payment Date:\s*([^\r\n]+)/i;
const PAP_CARD_LAST_FOUR_RE = /Account Last Four:\s*(\d{4})/i;
const PAP_SUBTOTAL_RE = /(?:^|[\r\n])Sub Total:\s*(\$[\d,]+\.\d{2})/im;
const PAP_TOTAL_RE = /(?:^|[\r\n])Total:\s*(\$[\d,]+\.\d{2})/im;
const PIMA_RECORD_RE = /record number\s+([A-Z0-9-]+)/i;
const PIMA_AMOUNT_RE =
  /one-time payment of\s*(\$[\d,]+\.\d{2})\s+that was scheduled/i;
const PIMA_PAYMENT_DATE_RE = /scheduled with a date of\s*([0-9/]+)/i;
const PIMA_CARD_LAST_FOUR_RE = /ending\s*X{0,4}(\d{4})/i;
const PIMA_CONFIRMATION_RE =
  /confirmation number for this payment is\s*([A-Z0-9]+)/i;
const ADEQ_FEE_TO_SCHEDULE: Record<number, number> = {
  570: 1070,
  1130: 1630,
  4120: 4870,
  6870: 7870,
  10310: 11_560,
  16490: 18_490,
};

export interface PointAndPayBillingDetails {
  cardLastFour?: string;
  confirmationId?: string;
  invoiceNumber: string;
  paymentDate?: string;
  permitCost: string;
}

export interface ManualBillingDetailsInput {
  cardLastFour?: string | null;
  cardholderName?: string | null;
  confirmationId?: string | null;
  invoiceDate?: string | null;
  invoiceNumber?: string | null;
  paymentDate?: string | null;
  paymentMethod?: string | null;
  paymentMovedFromInvoiceNumber?: string | null;
  permitCost?: string | null;
  vendorName?: string | null;
}

export interface ResolvedBillingDraftDetails {
  cardLastFour?: string;
  cardholderName: string;
  confirmationId?: string;
  invoiceDate?: string;
  invoiceNumber: string;
  paymentDate?: string;
  paymentMethod: string;
  paymentMovedFromInvoiceNumber?: string;
  permitCost: string;
  vendorName: string;
}

function parseDollarAmount(amount: string): number | null {
  const cleaned = amount.replace(/[$,]/g, "");
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(num) : null;
}

export function lookupBillingScheduleValue(
  permitCost: string
): string | null {
  const countyFee = parseDollarAmount(permitCost);
  if (countyFee == null) {
    return null;
  }

  const directSchedule = ADEQ_FEE_TO_SCHEDULE[countyFee];
  if (directSchedule != null) {
    return `$${directSchedule.toLocaleString("en-US")}`;
  }

  for (const [baseFeeText, baseSchedule] of Object.entries(ADEQ_FEE_TO_SCHEDULE)) {
    const baseFee = Number.parseInt(baseFeeText, 10);
    if (countyFee !== baseFee * 2) {
      continue;
    }

    const adminFee = baseSchedule - baseFee;
    const expeditedSchedule = countyFee + adminFee;
    return `$${expeditedSchedule.toLocaleString("en-US")}`;
  }

  return null;
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

function extractPimaBillingDetails(
  bodyText: string
): PointAndPayBillingDetails | null {
  const invoiceNumber = bodyText.match(PIMA_RECORD_RE)?.[1];
  if (!invoiceNumber) {
    return null;
  }

  return {
    cardLastFour: bodyText.match(PIMA_CARD_LAST_FOUR_RE)?.[1],
    confirmationId: bodyText.match(PIMA_CONFIRMATION_RE)?.[1],
    invoiceNumber,
    paymentDate: bodyText.match(PIMA_PAYMENT_DATE_RE)?.[1]?.trim(),
    permitCost: bodyText.match(PIMA_AMOUNT_RE)?.[1] ?? "Unknown",
  };
}

export function extractBillingEmailDetails(
  bodyText: string
): PointAndPayBillingDetails | null {
  return (
    extractPointAndPayBillingDetails(bodyText) ??
    extractPimaBillingDetails(bodyText)
  );
}

function nonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveBillingDraftDetails(params: {
  overrides?: ManualBillingDetailsInput | null;
  parsedPaymentDetails?: PointAndPayBillingDetails | null;
}): ResolvedBillingDraftDetails {
  const parsed = params.parsedPaymentDetails;
  const overrides = params.overrides ?? {};

  const invoiceNumber =
    nonEmpty(overrides.invoiceNumber) ?? nonEmpty(parsed?.invoiceNumber);
  if (!invoiceNumber) {
    throw new Error("Manual billing details require invoiceNumber");
  }

  const permitCost =
    nonEmpty(overrides.permitCost) ?? nonEmpty(parsed?.permitCost);
  if (!permitCost) {
    throw new Error("Manual billing details require permitCost");
  }

  const cardLastFour =
    nonEmpty(overrides.cardLastFour) ?? nonEmpty(parsed?.cardLastFour);
  const cardholderName =
    nonEmpty(overrides.cardholderName) ??
    (cardLastFour
      ? `Company Card (ending ${cardLastFour})`
      : "Company Card");

  return {
    cardLastFour,
    cardholderName,
    confirmationId:
      nonEmpty(overrides.confirmationId) ?? nonEmpty(parsed?.confirmationId),
    invoiceDate: nonEmpty(overrides.invoiceDate),
    invoiceNumber,
    paymentDate:
      nonEmpty(overrides.paymentDate) ?? nonEmpty(parsed?.paymentDate),
    paymentMethod: nonEmpty(overrides.paymentMethod) ?? "Credit Card",
    paymentMovedFromInvoiceNumber: nonEmpty(
      overrides.paymentMovedFromInvoiceNumber
    ),
    permitCost,
    vendorName: nonEmpty(overrides.vendorName) ?? "Maricopa County ADEQ",
  };
}
