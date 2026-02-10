/**
 * Email Trigger Tests — Detection, parsing, and cost breakdown for dust permit notifications.
 *
 * Run: bun test apps/workers/notifications/lib/email-triggers.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  computeCostBreakdown,
  detectDustPermitEmailTrigger,
  parseMaricopaIssuedEmail,
  parsePointAndPayEmail,
} from "./email-triggers";

// ============================================================================
// Sample Email Bodies
// ============================================================================

/** Production-format PointAndPay body (CRLF line endings from htmlToText) */
const POINTANDPAY_BODY_CRLF = [
  "Your Maricopa County Air Quality Department payment has been authorized and will be processed soon.",
  "",
  "Please see below for the details of your payment:",
  "",
  "Product: Invoices - Account Number: IV087334 - Amount: $1,130.00",
  "",
  "",
  "Sub Total: $1,130.00",
  "",
  "Fee: $0.00",
  "",
  "Total: $1,130.00",
  "~~~~~~~~~~~~~~~~~~~~~~",
  "",
  "Payment Details:",
  "",
  "Confirmation ID: 190018295",
  "",
  "Invoice Number: 87334",
  "",
  "Facility Name:",
  "",
  "Company Name:",
  "",
  "Payment Date: 01/14/2026 09:06 AM US Mountain Time",
  "",
  "Account Last Four: 8113",
  "",
  "Customer Phone Number: (304) 405-2446",
  "",
  "~~~~~~~~~~~~~~~~~~~~~~~",
  "Thank you.",
].join("\r\n");

/** Same body with LF-only line endings (for comparison) */
const POINTANDPAY_BODY_LF = POINTANDPAY_BODY_CRLF.replace(/\r\n/g, "\n");

/** PointAndPay with a smaller tier amount */
const POINTANDPAY_BODY_SMALL = POINTANDPAY_BODY_CRLF.replace(
  /IV087334/g,
  "IV099001"
)
  .replace(/\$1,130\.00/g, "$570.00")
  .replace("190018295", "190099001")
  .replace("8113", "4242")
  .replace("(304) 405-2446", "(602) 555-1234")
  .replace("01/14/2026 09:06 AM US Mountain Time", "02/05/2026 02:30 PM US Mountain Time");

/** PointAndPay with the largest tier */
const POINTANDPAY_BODY_LARGE = POINTANDPAY_BODY_CRLF.replace(
  /IV087334/g,
  "IV100200"
)
  .replace(/\$1,130\.00/g, "$16,490.00")
  .replace("190018295", "190100200")
  .replace("8113", "9999");

/** Maricopa issued email — clean \n format (as in test-trigger.ts) */
const MARICOPA_BODY_LF = `Dust Permit Issued -- Lexington 420 - Northern Pkwy Logistics Bldg. D,

The Maricopa County Air Quality dust control permit application D0064501 has been processed and approved.

Facility ID#: F055909
Facility Name: Lexington 420 - Northern Pkwy Logistics Bldg. D
Facility Address: Section 31, 3N, 1W GLENDALE, AZ 85355

Dust control permits require daily dust logs, and when applicable a list of all Rule 310 certified employees and a list of subcontractors working under your permit.

Thank you,
Maricopa County Air Quality Department
AQPermits@maricopa.gov
602-506-6010`;

/** Maricopa issued email — CRLF format (production) */
const MARICOPA_BODY_CRLF = MARICOPA_BODY_LF.replace(/\n/g, "\r\n");

/** Maricopa issued email — concatenated fields (htmlToText edge case) */
const MARICOPA_BODY_CONCAT = `Dust Permit Issued -- Lexington 420 - Northern Pkwy Logistics Bldg. D,

The Maricopa County Air Quality dust control permit application D0064501 has been processed and approved.

Facility ID#: F055909Facility Name: Lexington 420 - Northern Pkwy Logistics Bldg. DFacility Address: Section 31, 3N, 1W GLENDALE, AZ 85355Dust control permits require daily dust logs, and when applicable a list of all Rule 310 certified employees.

Thank you,
Maricopa County Air Quality Department`;

const MARICOPA_SUBJECT =
  "Dust Permit Issued -- Lexington 420 - Northern Pkwy Logistics Bldg. D,";

/** Maricopa email with different permit/facility data */
const MARICOPA_BODY_ALT = `The Maricopa County Air Quality dust control permit application D0061234 has been processed and approved.

Facility ID#: F042100
Facility Name: Cactus Storage Phase 2
Facility Address: 10200 N 99th Ave PEORIA, AZ 85345

Dust control permits require daily dust logs.`;

const MARICOPA_SUBJECT_ALT = "Dust Permit Issued -- Cactus Storage Phase 2,";

// ============================================================================
// Detection
// ============================================================================

describe("detectDustPermitEmailTrigger", () => {
  test("direct PointAndPay sender", () => {
    expect(
      detectDustPermitEmailTrigger(
        "noreply@pointandpay.com",
        "Payment confirmation"
      )
    ).toBe("pointandpay_payment");
  });

  test("direct PointAndPay sender (case insensitive)", () => {
    expect(
      detectDustPermitEmailTrigger(
        "NoReply@PointAndPay.com",
        "Your payment receipt"
      )
    ).toBe("pointandpay_payment");
  });

  test("direct Maricopa issued", () => {
    expect(
      detectDustPermitEmailTrigger("no-reply@maricopa.gov", MARICOPA_SUBJECT)
    ).toBe("maricopa_issued");
  });

  test("Maricopa sender with wrong subject → null", () => {
    expect(
      detectDustPermitEmailTrigger(
        "no-reply@maricopa.gov",
        "Your invoice is ready"
      )
    ).toBeNull();
  });

  test("forwarded PointAndPay (body match)", () => {
    expect(
      detectDustPermitEmailTrigger(
        "chi@desertservices.net",
        "FW: Payment confirmation",
        POINTANDPAY_BODY_CRLF
      )
    ).toBe("pointandpay_payment");
  });

  test("forwarded Maricopa issued (body match)", () => {
    expect(
      detectDustPermitEmailTrigger(
        "chi@desertservices.net",
        "FW: Dust Permit",
        MARICOPA_BODY_CRLF
      )
    ).toBe("maricopa_issued");
  });

  test("unrelated email → null", () => {
    expect(
      detectDustPermitEmailTrigger(
        "someone@example.com",
        "Hello world",
        "Nothing relevant here"
      )
    ).toBeNull();
  });

  test("no body, unknown sender → null", () => {
    expect(
      detectDustPermitEmailTrigger("random@company.org", "Meeting reminder")
    ).toBeNull();
  });
});

// ============================================================================
// PointAndPay Parsing
// ============================================================================

describe("parsePointAndPayEmail", () => {
  test("parses all fields from CRLF body", () => {
    const data = parsePointAndPayEmail(POINTANDPAY_BODY_CRLF);
    expect(data.invoiceNumber).toBe("IV087334");
    expect(data.amount).toBe("$1,130.00");
    expect(data.confirmationId).toBe("190018295");
    expect(data.cardLastFour).toBe("8113");
    expect(data.paymentDate).toBe(
      "01/14/2026 09:06 AM US Mountain Time"
    );
    expect(data.customerPhone).toBeTruthy();
  });

  test("parses all fields from LF body", () => {
    const data = parsePointAndPayEmail(POINTANDPAY_BODY_LF);
    expect(data.invoiceNumber).toBe("IV087334");
    expect(data.amount).toBe("$1,130.00");
    expect(data.confirmationId).toBe("190018295");
    expect(data.cardLastFour).toBe("8113");
    expect(data.paymentDate).toBe(
      "01/14/2026 09:06 AM US Mountain Time"
    );
  });

  test("parses smaller tier amount ($570)", () => {
    const data = parsePointAndPayEmail(POINTANDPAY_BODY_SMALL);
    expect(data.invoiceNumber).toBe("IV099001");
    expect(data.amount).toBe("$570.00");
    expect(data.confirmationId).toBe("190099001");
    expect(data.cardLastFour).toBe("4242");
    expect(data.paymentDate).toBe(
      "02/05/2026 02:30 PM US Mountain Time"
    );
  });

  test("parses large tier amount ($16,490)", () => {
    const data = parsePointAndPayEmail(POINTANDPAY_BODY_LARGE);
    expect(data.invoiceNumber).toBe("IV100200");
    expect(data.amount).toBe("$16,490.00");
    expect(data.confirmationId).toBe("190100200");
    expect(data.cardLastFour).toBe("9999");
  });

  test("empty body → all null", () => {
    const data = parsePointAndPayEmail("");
    expect(data.invoiceNumber).toBeNull();
    expect(data.amount).toBeNull();
    expect(data.confirmationId).toBeNull();
    expect(data.cardLastFour).toBeNull();
    expect(data.paymentDate).toBeNull();
    expect(data.customerPhone).toBeNull();
  });
});

// ============================================================================
// Maricopa Issued Parsing
// ============================================================================

describe("parseMaricopaIssuedEmail", () => {
  test("parses clean LF format", () => {
    const data = parseMaricopaIssuedEmail(MARICOPA_BODY_LF, MARICOPA_SUBJECT);
    expect(data.permitNumber).toBe("D0064501");
    expect(data.facilityId).toBe("F055909");
    expect(data.facilityName).toBe(
      "Lexington 420 - Northern Pkwy Logistics Bldg. D"
    );
    expect(data.facilityAddress).toBe(
      "Section 31, 3N, 1W GLENDALE, AZ 85355"
    );
  });

  test("parses CRLF format", () => {
    const data = parseMaricopaIssuedEmail(
      MARICOPA_BODY_CRLF,
      MARICOPA_SUBJECT
    );
    expect(data.permitNumber).toBe("D0064501");
    expect(data.facilityId).toBe("F055909");
    expect(data.facilityName).toBe(
      "Lexington 420 - Northern Pkwy Logistics Bldg. D"
    );
    expect(data.facilityAddress).toBe(
      "Section 31, 3N, 1W GLENDALE, AZ 85355"
    );
  });

  test("parses concatenated format (no line breaks between fields)", () => {
    const data = parseMaricopaIssuedEmail(
      MARICOPA_BODY_CONCAT,
      MARICOPA_SUBJECT
    );
    expect(data.permitNumber).toBe("D0064501");
    expect(data.facilityId).toBe("F055909");
    expect(data.facilityName).toBe(
      "Lexington 420 - Northern Pkwy Logistics Bldg. D"
    );
    expect(data.facilityAddress).toBe(
      "Section 31, 3N, 1W GLENDALE, AZ 85355"
    );
  });

  test("parses different permit/facility data", () => {
    const data = parseMaricopaIssuedEmail(
      MARICOPA_BODY_ALT,
      MARICOPA_SUBJECT_ALT
    );
    expect(data.permitNumber).toBe("D0061234");
    expect(data.facilityId).toBe("F042100");
    expect(data.facilityName).toBe("Cactus Storage Phase 2");
    expect(data.facilityAddress).toBe("10200 N 99th Ave PEORIA, AZ 85345");
  });

  test("facility name falls back to subject when missing from body", () => {
    const bodyNoName = `The Maricopa County Air Quality dust control permit application D0064501 has been processed and approved.

Facility ID#: F055909
Facility Address: Section 31, 3N, 1W GLENDALE, AZ 85355

Dust control permits require daily dust logs.`;

    const data = parseMaricopaIssuedEmail(bodyNoName, MARICOPA_SUBJECT);
    expect(data.permitNumber).toBe("D0064501");
    expect(data.facilityId).toBe("F055909");
    expect(data.facilityName).toBe(
      "Lexington 420 - Northern Pkwy Logistics Bldg. D"
    );
  });

  test("empty body → all null except subject-derived name", () => {
    const data = parseMaricopaIssuedEmail("", MARICOPA_SUBJECT);
    expect(data.permitNumber).toBeNull();
    expect(data.facilityId).toBeNull();
    expect(data.facilityName).toBe(
      "Lexington 420 - Northern Pkwy Logistics Bldg. D"
    );
    expect(data.facilityAddress).toBeNull();
  });
});

// ============================================================================
// Cost Breakdown
// ============================================================================

describe("computeCostBreakdown", () => {
  // All 7 tiers — non-accelerated
  const tierCases: Array<{
    label: string;
    adeqFee: string;
    expectedPermitCost: string;
    expectedAdminFee: string;
    expectedSchedule: string;
  }> = [
    {
      label: "<1 acre ($570)",
      adeqFee: "$570.00",
      expectedPermitCost: "$570.00",
      expectedAdminFee: "$500.00",
      expectedSchedule: "$1,070.00",
    },
    {
      label: "1-5 acres ($1,130)",
      adeqFee: "$1,130.00",
      expectedPermitCost: "$1,130.00",
      expectedAdminFee: "$500.00",
      expectedSchedule: "$1,630.00",
    },
    {
      label: "5-10 acres ($1,130)",
      adeqFee: "$1,130.00",
      expectedPermitCost: "$1,130.00",
      expectedAdminFee: "$500.00",
      expectedSchedule: "$1,630.00",
    },
    {
      label: "10-49 acres ($4,120)",
      adeqFee: "$4,120.00",
      expectedPermitCost: "$4,120.00",
      expectedAdminFee: "$750.00",
      expectedSchedule: "$4,870.00",
    },
    {
      label: "50-99 acres ($6,870)",
      adeqFee: "$6,870.00",
      expectedPermitCost: "$6,870.00",
      expectedAdminFee: "$1,000.00",
      expectedSchedule: "$7,870.00",
    },
    {
      label: "100-499 acres ($10,310)",
      adeqFee: "$10,310.00",
      expectedPermitCost: "$10,310.00",
      expectedAdminFee: "$1,250.00",
      expectedSchedule: "$11,560.00",
    },
    {
      label: "500+ acres ($16,490)",
      adeqFee: "$16,490.00",
      expectedPermitCost: "$16,490.00",
      expectedAdminFee: "$2,000.00",
      expectedSchedule: "$18,490.00",
    },
  ];

  for (const tc of tierCases) {
    test(`tier: ${tc.label}`, () => {
      const result = computeCostBreakdown(tc.adeqFee, false);
      expect(result).not.toBeNull();
      expect(result!.permitCost).toBe(tc.expectedPermitCost);
      expect(result!.adminFee).toBe(tc.expectedAdminFee);
      expect(result!.scheduleValue).toBe(tc.expectedSchedule);
      expect(result!.isAccelerated).toBe(false);
    });
  }

  test("accelerated permit (doubled ADEQ fee)", () => {
    // Accelerated 1-5 acre: county charges $2,260 (2x $1,130), admin stays $500
    const result = computeCostBreakdown("$2,260.00", true);
    expect(result).not.toBeNull();
    expect(result!.permitCost).toBe("$2,260.00");
    expect(result!.adminFee).toBe("$500.00");
    expect(result!.scheduleValue).toBe("$2,760.00");
    expect(result!.isAccelerated).toBe(true);
  });

  test("accelerated <1 acre ($1,140 = 2x $570)", () => {
    const result = computeCostBreakdown("$1,140.00", true);
    expect(result).not.toBeNull();
    expect(result!.permitCost).toBe("$1,140.00");
    expect(result!.adminFee).toBe("$500.00");
    expect(result!.scheduleValue).toBe("$1,640.00");
    expect(result!.isAccelerated).toBe(true);
  });

  test("null amount → null", () => {
    expect(computeCostBreakdown(null, false)).toBeNull();
  });

  test("zero amount → null", () => {
    expect(computeCostBreakdown("$0.00", false)).toBeNull();
  });

  test("unrecognized amount → null", () => {
    expect(computeCostBreakdown("$999.99", false)).toBeNull();
  });

  test("garbage string → null", () => {
    expect(computeCostBreakdown("not a number", false)).toBeNull();
  });
});
