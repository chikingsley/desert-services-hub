/**
 * Email Trigger Parsers & Cost Breakdown
 *
 * Data parsing functions used by job handlers AFTER triage dispatch.
 * Detection/classification is handled by the unified triage system.
 */

import { DUST_PERMIT_TIERS } from "@lib/db/types";
import type {
  CostBreakdown,
  DustPermitEmailTrigger,
  MaricopaIssuedData,
  PointAndPayData,
} from "./types";

// ============================================================================
// Parser Regexes
// ============================================================================

const POINT_AND_PAY_INVOICE_RE = /Account Number:\s*(IV\d+)/i;
const POINT_AND_PAY_COUNTY_INVOICE_NUMBER_RE = /Invoice Number:\s*(\d+)/i;
const POINT_AND_PAY_PRODUCT_LINE_RE =
  /Product:\s*Invoices\s*-\s*Account Number:\s*(IV\d+)\s*-\s*Amount:\s*(\$[\d,]+\.\d{2})/i;
const POINT_AND_PAY_SUBTOTAL_RE = /^[ \t]*Sub Total:\s*(\$[\d,]+\.\d{2})/im;
const POINT_AND_PAY_TOTAL_RE = /^[ \t]*Total:\s*(\$[\d,]+\.\d{2})/im;
const POINT_AND_PAY_AMOUNT_RE = /Amount:\s*(\$[\d,]+\.\d{2})/i;
const POINT_AND_PAY_CONFIRMATION_RE = /Confirmation ID:\s*(\d+)/i;
const POINT_AND_PAY_CARD_RE = /Account Last Four:\s*(\d{4})/i;
const POINT_AND_PAY_DATE_RE = /Payment Date:\s*([^\r\n]+)/i;
const POINT_AND_PAY_PHONE_RE = /Customer Phone Number:\s*\(?([\d() -]+)\)?/i;
const MARICOPA_PERMIT_NUMBER_RE = /application\s+(D\d{7})/i;
const MARICOPA_FACILITY_ID_RE = /Facility ID#?:\s*(F\d+)/i;
const MARICOPA_FACILITY_NAME_RE =
  /Facility Name:\s*(.+?)(?=\s*Facility Address|\r?\n|$)/i;
const MARICOPA_SUBJECT_FACILITY_NAME_RE =
  /Dust Permit Issued\s*--\s*(.+?)(?:,|$)/i;
const MARICOPA_FACILITY_ADDRESS_RE =
  /Facility Address:\s*(.+?)(?=\s*Dust control|\r?\n|$)/i;
const DUST_PERMIT_ISSUED_SUBJECT_RE = /\bdust permit issued\b/i;
const POINT_AND_PAY_SENDER_RE = /@pointandpay\.com$/i;
const MARICOPA_SENDER_RE = /@maricopa\.gov$/i;

export function detectDustPermitEmailTrigger(
  fromEmail: string,
  subject: string,
  bodyText?: string
): DustPermitEmailTrigger | null {
  const sender = fromEmail.trim();
  const body = bodyText ?? "";

  if (POINT_AND_PAY_SENDER_RE.test(sender)) {
    return "pointandpay_payment";
  }

  if (MARICOPA_SENDER_RE.test(sender)) {
    return DUST_PERMIT_ISSUED_SUBJECT_RE.test(subject)
      ? "maricopa_issued"
      : null;
  }

  if (
    POINT_AND_PAY_INVOICE_RE.test(body) &&
    POINT_AND_PAY_CONFIRMATION_RE.test(body)
  ) {
    return "pointandpay_payment";
  }

  if (
    DUST_PERMIT_ISSUED_SUBJECT_RE.test(subject) ||
    (MARICOPA_PERMIT_NUMBER_RE.test(body) && MARICOPA_FACILITY_ID_RE.test(body))
  ) {
    return "maricopa_issued";
  }

  return null;
}

// ============================================================================
// Parsers
// ============================================================================

export function parsePointAndPayEmail(body: string): PointAndPayData {
  const invoiceMatch = body.match(POINT_AND_PAY_INVOICE_RE);
  const countyInvoiceMatch = body.match(POINT_AND_PAY_COUNTY_INVOICE_NUMBER_RE);
  const confirmationMatch = body.match(POINT_AND_PAY_CONFIRMATION_RE);
  const cardMatch = body.match(POINT_AND_PAY_CARD_RE);
  const dateMatch = body.match(POINT_AND_PAY_DATE_RE);
  const phoneMatch = body.match(POINT_AND_PAY_PHONE_RE);

  const invoiceNumber = invoiceMatch?.[1] ?? null;
  const countyInvoiceNumber = countyInvoiceMatch?.[1] ?? null;

  let amount: string | null = null;

  if (invoiceNumber) {
    const productLineRe = new RegExp(
      POINT_AND_PAY_PRODUCT_LINE_RE.source,
      "gi"
    );
    let sum = 0;
    let count = 0;
    for (const match of body.matchAll(productLineRe)) {
      if (match[1] !== invoiceNumber) {
        continue;
      }
      const parsed = parseDollarAmount(match[2] ?? null);
      if (parsed == null) {
        continue;
      }
      sum += parsed;
      count += 1;
    }

    if (count > 0) {
      amount = formatUSD(Math.round(sum * 100) / 100);
    }
  }

  if (!amount) {
    const subTotalMatch = body.match(POINT_AND_PAY_SUBTOTAL_RE);
    const totalMatch = body.match(POINT_AND_PAY_TOTAL_RE);
    const amountMatch = body.match(POINT_AND_PAY_AMOUNT_RE);
    amount = subTotalMatch?.[1] ?? totalMatch?.[1] ?? amountMatch?.[1] ?? null;
  }

  return {
    invoiceNumber,
    countyInvoiceNumber,
    amount,
    confirmationId: confirmationMatch?.[1] ?? null,
    cardLastFour: cardMatch?.[1] ?? null,
    paymentDate: dateMatch?.[1]?.trim() ?? null,
    customerPhone: phoneMatch?.[1]?.trim() ?? null,
  };
}

export function parseMaricopaIssuedEmail(
  body: string,
  subject: string
): MaricopaIssuedData {
  const permitMatch = body.match(MARICOPA_PERMIT_NUMBER_RE);
  const facilityIdMatch = body.match(MARICOPA_FACILITY_ID_RE);
  const facilityNameMatch = body.match(MARICOPA_FACILITY_NAME_RE);
  const subjectNameMatch = subject.match(MARICOPA_SUBJECT_FACILITY_NAME_RE);
  const facilityName =
    facilityNameMatch?.[1]?.trim() ?? subjectNameMatch?.[1]?.trim() ?? null;
  const addressMatch = body.match(MARICOPA_FACILITY_ADDRESS_RE);

  return {
    permitNumber: permitMatch?.[1] ?? null,
    facilityId: facilityIdMatch?.[1] ?? null,
    facilityName,
    facilityAddress: addressMatch?.[1]?.trim() ?? null,
  };
}

// ============================================================================
// Job Handler Types
// ============================================================================

// ============================================================================
// Cost Breakdown
// ============================================================================

export function formatUSD(amount: number): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export function parseDollarAmount(str: string | null): number | null {
  if (!str) {
    return null;
  }
  const cleaned = str.replace(/[,$]/g, "");
  const num = Number.parseFloat(cleaned);
  return Number.isNaN(num) ? null : num;
}

export function computeCostBreakdown(
  adeqFeeStr: string | null,
  isAccelerated: boolean
): CostBreakdown | null {
  const adeqFee = parseDollarAmount(adeqFeeStr);
  if (adeqFee == null || adeqFee <= 0) {
    return null;
  }

  const baseFee = isAccelerated ? adeqFee / 2 : adeqFee;

  const tier = DUST_PERMIT_TIERS.find((t) => t.adeqFee === baseFee);
  if (!tier) {
    return null;
  }

  return {
    permitCost: formatUSD(adeqFee),
    adminFee: formatUSD(tier.filingFee),
    scheduleValue: formatUSD(adeqFee + tier.filingFee),
    isAccelerated,
  };
}
