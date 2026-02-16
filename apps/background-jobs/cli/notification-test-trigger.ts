#!/usr/bin/env bun

/**
 * Test Trigger — Manually fire dust permit email notification handlers.
 *
 * Usage:
 *   bun cli/test-trigger.ts payment     # Fire payment handler with sample PointAndPay data
 *   bun cli/test-trigger.ts issued      # Fire issued handler with sample Maricopa data
 *   bun cli/test-trigger.ts detect      # Run detection on sample inputs and print results
 */

import {
  detectDustPermitEmailTrigger,
  handleIssuedEmail,
  handlePaymentEmail,
  parseMaricopaIssuedEmail,
  parsePointAndPayEmail,
} from "@background-jobs/lib/notifications/email-triggers";

const SAMPLE_POINTANDPAY_BODY = `Your Maricopa County Air Quality Department payment has been authorized and will be processed soon.

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

const SAMPLE_MARICOPA_ISSUED_BODY = `Dust Permit Issued -- Lexington 420 - Northern Pkwy Logistics Bldg. D,

The Maricopa County Air Quality dust control permit application D0064501 has been processed and approved.

Facility ID#: F055909
Facility Name: Lexington 420 - Northern Pkwy Logistics Bldg. D
Facility Address: Section 31, 3N, 1W GLENDALE, AZ 85355

Dust control permits require daily dust logs, and when applicable a list of all Rule 310 certified employees and a list of subcontractors working under your permit. You will receive a secondary email within the next ten business days that will contain resources to assist your facility in maintaining compliance with all permit requirements. You can also visit Maricopa.gov/1814 for resources and more information.

Thank you,
Maricopa County Air Quality Department
AQPermits@maricopa.gov
602-506-6010`;

const SAMPLE_MARICOPA_ISSUED_SUBJECT =
  "Dust Permit Issued -- Lexington 420 - Northern Pkwy Logistics Bldg. D,";

const command = process.argv[2];

if (!(command && ["payment", "issued", "detect"].includes(command))) {
  console.log("Usage: bun cli/test-trigger.ts <payment|issued|detect>");
  process.exit(1);
}

if (command === "detect") {
  console.log("Detection Tests");
  console.log("================\n");

  const cases = [
    {
      label: "Direct PointAndPay",
      from: "noreply@pointandpay.com",
      subject: "Payment confirmation",
    },
    {
      label: "Direct Maricopa Issued",
      from: "no-reply@maricopa.gov",
      subject: SAMPLE_MARICOPA_ISSUED_SUBJECT,
    },
    {
      label: "Forwarded PointAndPay (body match)",
      from: "chi@desertservices.net",
      subject: "FW: Payment",
      body: SAMPLE_POINTANDPAY_BODY,
    },
    {
      label: "Forwarded Maricopa (body match)",
      from: "chi@desertservices.net",
      subject: "FW: Dust Permit",
      body: SAMPLE_MARICOPA_ISSUED_BODY,
    },
    {
      label: "Unrelated email",
      from: "someone@example.com",
      subject: "Hello world",
    },
  ];

  for (const c of cases) {
    const result = detectDustPermitEmailTrigger(c.from, c.subject, c.body);
    console.log(`  ${c.label}: ${result ?? "(null)"}`);
  }

  console.log("\nParsing Tests");
  console.log("==============\n");

  const paymentData = parsePointAndPayEmail(SAMPLE_POINTANDPAY_BODY);
  console.log("  PointAndPay parsed:", paymentData);

  const issuedData = parseMaricopaIssuedEmail(
    SAMPLE_MARICOPA_ISSUED_BODY,
    SAMPLE_MARICOPA_ISSUED_SUBJECT
  );
  console.log("  Maricopa Issued parsed:", issuedData);

  process.exit(0);
}

if (command === "payment") {
  console.log("Triggering payment handler with sample PointAndPay data...\n");
  await handlePaymentEmail({
    emailId: 0,
    messageId: "test-trigger-payment",
    mailboxEmail: "chi@desertservices.net",
    bodyText: SAMPLE_POINTANDPAY_BODY,
  });
  console.log("\nDone.");
}

if (command === "issued") {
  console.log("Triggering issued handler with sample Maricopa data...\n");
  await handleIssuedEmail({
    emailId: 0,
    messageId: "test-trigger-issued",
    mailboxEmail: "chi@desertservices.net",
    bodyText: SAMPLE_MARICOPA_ISSUED_BODY,
    subject: SAMPLE_MARICOPA_ISSUED_SUBJECT,
  });
  console.log("\nDone.");
}
