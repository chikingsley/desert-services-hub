import { afterAll, describe, expect, it } from "bun:test";
import {
  detectDustPermitEmailTrigger,
  handleIssuedEmail,
  handlePaymentEmail,
  parseMaricopaIssuedEmail,
  parsePointAndPayEmail,
} from "@background-jobs/lib/notifications/email-triggers";
import { db } from "@lib/db/hub";

// ============================================================================
// Real email fixtures (verbatim from production emails)
// ============================================================================

const POINTANDPAY_EMAIL_BODY = `Your Maricopa County Air Quality Department payment has been authorized and will be processed soon.

Please see below for the details of your payment:

Product: Invoices - Account Number: IV087334 - Amount: $1,130.00


Sub Total: $1,130.00

Fee: $0.00

Total: $1,130.00
~~~~~~~~~~~~~~~~~~~~~~

Payment Details:

Confirmation ID: 190018295

Invoice Number: 87334

Facility Name:

Company Name:

Payment Date: 01/14/2026 09:06 AM US Mountain Time

Account Last Four: 8113

Customer Phone Number: (304) 405-2446

~~~~~~~~~~~~~~~~~~~~~~~
Thank you.

To reach the Maricopa County Air Quality Department, please call (602) 506-6010`;

// Accelerated processing: PointAndPay lists the same invoice twice; Sub Total is doubled.
const POINTANDPAY_EMAIL_BODY_ACCELERATED = `Your Maricopa County Air Quality Department payment has been authorized and will be processed soon.

Please see below for the details of your payment:

Product: Invoices - Account Number: IV088327 - Amount: $1,130.00
Product: Invoices - Account Number: IV088327 - Amount: $1,130.00


Sub Total: $2,260.00

Fee: $0.00

Total: $2,260.00
~~~~~~~~~~~~~~~~~~~~~~

Payment Details:

Confirmation ID: 191576822

Invoice Number: 88327

Facility Name:

Company Name:

Payment Date: 02/10/2026 02:15 PM US Mountain Time

Account Last Four: 8113

Customer Phone Number: (304) 405-2446

~~~~~~~~~~~~~~~~~~~~~~~
Thank you.

To reach the Maricopa County Air Quality Department, please call (602) 506-6010`;

const MARICOPA_ISSUED_EMAIL_BODY = `Dust Permit Issued -- Lexington 420 - Northern Pkwy Logistics Bldg. D,

The Maricopa County Air Quality dust control permit application D0064501 has been processed and approved.

Facility ID#: F055909
Facility Name: Lexington 420 - Northern Pkwy Logistics Bldg. D
Facility Address: Section 31, 3N, 1W GLENDALE, AZ 85355

Dust control permits require daily dust logs, and when applicable a list of all Rule 310 certified employees and a list of subcontractors working under your permit. You will receive a secondary email within the next ten business days that will contain resources to assist your facility in maintaining compliance with all permit requirements. You can also visit Maricopa.gov/1814 for resources and more information.

The Maricopa County Air Quality Department Business Assistance (BA) Unit provides information and technical assistance to business owners related to air quality rules and regulations. The BA Unit offers courtesy site visits and on-site training, rule interpretation and education, and a formal case review process for violations. To contact the BA Unit, email AQBusinessAssistance@maricopa.gov or call 602-506-5102.

Thank you,
Maricopa County Air Quality Department
AQPermits@maricopa.gov
602-506-6010

This is an automatically generated message sent to all facility contacts from the Maricopa County Air Quality Department. Replies are not monitored or answered.`;

const MARICOPA_ISSUED_SUBJECT =
  "Dust Permit Issued -- Lexington 420 - Northern Pkwy Logistics Bldg. D,";
const FACILITY_NAME_LINE_REGEX = /Facility Name:.+/;

// ============================================================================
// Detection Tests
// ============================================================================

describe("detectDustPermitEmailTrigger", () => {
  it("detects PointAndPay payment email", () => {
    expect(
      detectDustPermitEmailTrigger(
        "noreply@pointandpay.com",
        "Your Maricopa County Air Quality Department payment"
      )
    ).toBe("pointandpay_payment");
  });

  it("detects PointAndPay case-insensitively", () => {
    expect(
      detectDustPermitEmailTrigger(
        "NoReply@PointAndPay.com",
        "payment confirmation"
      )
    ).toBe("pointandpay_payment");
  });

  it("detects Maricopa issued email", () => {
    expect(
      detectDustPermitEmailTrigger(
        "no-reply@maricopa.gov",
        MARICOPA_ISSUED_SUBJECT
      )
    ).toBe("maricopa_issued");
  });

  it("requires 'Dust Permit Issued' in subject for Maricopa", () => {
    expect(
      detectDustPermitEmailTrigger(
        "no-reply@maricopa.gov",
        "Your permit application has been received"
      )
    ).toBeNull();
  });

  it("returns null for unrelated emails", () => {
    expect(
      detectDustPermitEmailTrigger("someone@example.com", "Hello world")
    ).toBeNull();
  });

  it("returns null for internal emails", () => {
    expect(
      detectDustPermitEmailTrigger(
        "chi@desertservices.net",
        "Dust Permit Issued"
      )
    ).toBeNull();
  });

  it("detects forwarded PointAndPay email by body content", () => {
    expect(
      detectDustPermitEmailTrigger(
        "chi@desertservices.net",
        "FW: Your Maricopa County payment",
        POINTANDPAY_EMAIL_BODY
      )
    ).toBe("pointandpay_payment");
  });

  it("detects forwarded Maricopa issued email by body content", () => {
    expect(
      detectDustPermitEmailTrigger(
        "chi@desertservices.net",
        "FW: Dust Permit Issued -- Lexington",
        MARICOPA_ISSUED_EMAIL_BODY
      )
    ).toBe("maricopa_issued");
  });
});

// ============================================================================
// PointAndPay Parser Tests
// ============================================================================

describe("parsePointAndPayEmail", () => {
  const result = parsePointAndPayEmail(POINTANDPAY_EMAIL_BODY);

  it("extracts invoice number", () => {
    expect(result.invoiceNumber).toBe("IV087334");
  });

  it("extracts amount", () => {
    expect(result.amount).toBe("$1,130.00");
  });

  it("extracts amount for accelerated payments (sum of duplicate invoice line items)", () => {
    const accelerated = parsePointAndPayEmail(
      POINTANDPAY_EMAIL_BODY_ACCELERATED
    );
    expect(accelerated.invoiceNumber).toBe("IV088327");
    expect(accelerated.amount).toBe("$2,260.00");
  });

  it("extracts confirmation ID", () => {
    expect(result.confirmationId).toBe("190018295");
  });

  it("extracts card last four", () => {
    expect(result.cardLastFour).toBe("8113");
  });

  it("extracts payment date", () => {
    expect(result.paymentDate).toBe("01/14/2026 09:06 AM US Mountain Time");
  });

  it("extracts customer phone", () => {
    expect(result.customerPhone).toContain("304");
  });

  it("returns nulls for empty body", () => {
    const empty = parsePointAndPayEmail("");
    expect(empty.invoiceNumber).toBeNull();
    expect(empty.amount).toBeNull();
    expect(empty.confirmationId).toBeNull();
  });
});

// ============================================================================
// Maricopa Issued Parser Tests
// ============================================================================

describe("parseMaricopaIssuedEmail", () => {
  const result = parseMaricopaIssuedEmail(
    MARICOPA_ISSUED_EMAIL_BODY,
    MARICOPA_ISSUED_SUBJECT
  );

  it("extracts permit number", () => {
    expect(result.permitNumber).toBe("D0064501");
  });

  it("extracts facility ID", () => {
    expect(result.facilityId).toBe("F055909");
  });

  it("extracts facility name from body", () => {
    expect(result.facilityName).toBe(
      "Lexington 420 - Northern Pkwy Logistics Bldg. D"
    );
  });

  it("extracts facility address", () => {
    expect(result.facilityAddress).toBe(
      "Section 31, 3N, 1W GLENDALE, AZ 85355"
    );
  });

  it("falls back to subject for facility name", () => {
    const bodyWithoutName = MARICOPA_ISSUED_EMAIL_BODY.replace(
      FACILITY_NAME_LINE_REGEX,
      ""
    );
    const result = parseMaricopaIssuedEmail(
      bodyWithoutName,
      MARICOPA_ISSUED_SUBJECT
    );
    expect(result.facilityName).toBe(
      "Lexington 420 - Northern Pkwy Logistics Bldg. D"
    );
  });

  it("returns nulls for empty body", () => {
    const empty = parseMaricopaIssuedEmail("", "");
    expect(empty.permitNumber).toBeNull();
    expect(empty.facilityId).toBeNull();
    expect(empty.facilityName).toBeNull();
  });
});

// ============================================================================
// Integration: Payment Handler (hits real DB)
// ============================================================================

describe("handlePaymentEmail — integration", () => {
  const TEST_REF_PREFIX = "__TEST_NOTIF__";

  afterAll(async () => {
    // Clean up any test notifications
    await db.run("DELETE FROM notifications WHERE subject LIKE ?", [
      `${TEST_REF_PREFIX}%`,
    ]);
    // Clean up test notifications
    await db.run("DELETE FROM notifications WHERE ref_id = 'D0064070'");
  });

  it("creates billing + submitted notifications for a known invoice", async () => {
    // IV087334 → D0064070 Alta Goldwater (confirmed in DB)
    const _result = await handlePaymentEmail({
      emailId: 0,
      messageId: "test-message-id",
      mailboxEmail: "chi@desertservices.net",
      bodyText: POINTANDPAY_EMAIL_BODY,
    });

    // Check that notifications were created
    const notifications = await db
      .query<{ event_type: string; ref_id: string; status: string }>(
        `SELECT event_type, ref_id, status FROM notifications
         WHERE ref_id = 'D0064070'
         ORDER BY created_at DESC
         LIMIT 5`
      )
      .all();

    const billing = notifications.find(
      (n) => n.event_type === "dust_permit_billing"
    );
    const submitted = notifications.find(
      (n) => n.event_type === "dust_permit_submitted"
    );

    expect(billing).toBeDefined();
    expect(submitted).toBeDefined();

    if (!(billing && submitted)) {
      throw new Error(
        "Expected both billing and submitted notifications for D0064070"
      );
    }

    // Status will be 'drafted' if Azure creds available, 'failed' otherwise
    expect(["drafted", "failed"]).toContain(billing.status);
    expect(["drafted", "failed"]).toContain(submitted.status);
  });
});

describe("handleIssuedEmail — integration", () => {
  afterAll(async () => {
    await db.run("DELETE FROM notifications WHERE ref_id = 'D0064501'");
  });

  it("creates issued notification for a known permit", async () => {
    await handleIssuedEmail({
      emailId: 0,
      messageId: "test-message-id",
      mailboxEmail: "chi@desertservices.net",
      bodyText: MARICOPA_ISSUED_EMAIL_BODY,
      subject: MARICOPA_ISSUED_SUBJECT,
    });

    const notification = await db
      .query<{
        event_type: string;
        ref_id: string;
        status: string;
        metadata: string;
      }>(
        `SELECT event_type, ref_id, status, metadata FROM notifications
         WHERE ref_id = 'D0064501' AND event_type = 'dust_permit_issued'
         ORDER BY created_at DESC LIMIT 1`
      )
      .get();

    expect(notification).toBeDefined();
    if (!notification) {
      throw new Error("Expected issued notification for D0064501");
    }

    expect(notification.event_type).toBe("dust_permit_issued");

    const metadata = JSON.parse(notification.metadata) as {
      permitId: string;
      facilityName: string;
    };
    expect(metadata.permitId).toBe("D0064501");
    expect(metadata.facilityName).toBe(
      "Lexington 420 - Northern Pkwy Logistics Bldg. D"
    );
  });
});
