/**
 * Email Classifier Tests
 *
 * Tests the dust permit email classifier against real email patterns.
 * Requires local LLM endpoint at https://llama.peacockery.studio
 *
 * Run with: bun test tests/lib/email-classifier.test.ts
 */

import { describe, expect, it } from "bun:test";
import type { EmailInput } from "@/lib/email-classifier";
import { classifyEmail, mightBeDustPermit } from "@/lib/email-classifier";

// =============================================================================
// Test Data - Real email patterns from dust-permit-examples
// =============================================================================

const EMAILS = {
  contactUpdate: {
    subject: "67 Flats - Dust Permit Contact",
    from: "StephenRichardson@Weisbuilders.com",
    body: "We need to update the contact info on our dust control permit. Art Maese, Superintendent, artmaese@weisbuilders.com, WD Construction, 4804907324",
  },
  countyClosed: {
    subject: "Air Quality Dust Permit Closed",
    from: "no-reply@maricopa.gov",
    body: "This is a courtesy notice to inform you that your Maricopa County Air Quality dust control permit D0058823 for 67 Flats - Phase 1, F050044, has been closed.",
  },
  countyIssued: {
    subject: "Dust Permit Issued",
    from: "no-reply@maricopa.gov",
    body: "The Maricopa County Air Quality dust control permit application D0064026 has been processed and approved. Facility ID#: F039203",
  },
  irrelevantInvoice: {
    subject: "Invoice #12345 - Payment Due",
    from: "accounting@vendor.com",
    body: "Please find attached invoice for services rendered. Payment is due within 30 days.",
  },
  irrelevantMeeting: {
    subject: "Weekly Team Meeting",
    from: "kendra@desertservices.net",
    body: "Reminder: Our weekly team sync is tomorrow at 10am. Please bring your project updates.",
  },
  newPermit: {
    subject: "Fw: Desert Sky: Dust Control Permit",
    from: "rick@desertservices.net",
    body: "Chi, Can you submit the Dust permit for this site 6903 w thomas rd phoenix, az 85033.",
  },
  newPermitUrgent: {
    subject: "Modera PV - Dust Permit Needed",
    from: "ssenatro@mcrtrust.com",
    body: "What would you all need to proceed now with the dust control permit ONLY for Modera PV? We also are needing the dust control permit this week so will need to apply the rush fees for this.",
  },
  renewal: {
    subject: "Dust Control Renewal",
    from: "lsanchezburciaga@holder.com",
    body: "We will need Dust Control permit renewed for the North Parcel as the current permit expires on 1/29/2026. Address: 9903 E. Elliott Rd MESA, AZ 85212, Parcel# 304-31-002Q and Facility ID: F019198.",
  },
  renewalWithAttachment: {
    subject: "5th & Goldwater: Dust Control Permit Renewal",
    from: "dino.brunetti@woodpartners.com",
    body: "We noticed the dust permit for our 5th & Goldwater (aka Alta Goldwater) project will require a renewal by 1/15/26. I attached the current permit to this email for reference.",
  },
  revision: {
    subject: "Dust control modification at Banner Verrado",
    from: "darin.krier@ryancompanies.com",
    body: "Jared, can you please see the attached and make an adjustment to our dust control permit based on the area labeled dirt storage in black to the south of our laydown area.",
  },
} satisfies Record<string, EmailInput>;

// =============================================================================
// Keyword Pre-Filter Tests (no API calls)
// =============================================================================

describe("mightBeDustPermit (keyword filter)", () => {
  it("returns true for emails with dust permit keywords", () => {
    expect(mightBeDustPermit(EMAILS.newPermit)).toBe(true);
    expect(mightBeDustPermit(EMAILS.renewal)).toBe(true);
    expect(mightBeDustPermit(EMAILS.revision)).toBe(true);
    expect(mightBeDustPermit(EMAILS.countyIssued)).toBe(true);
  });

  it("returns false for irrelevant emails", () => {
    expect(mightBeDustPermit(EMAILS.irrelevantMeeting)).toBe(false);
    expect(mightBeDustPermit(EMAILS.irrelevantInvoice)).toBe(false);
  });

  it("catches emails with facility IDs", () => {
    const email = {
      body: "What's the status?",
      from: "test@test.com",
      subject: "Question about F019198",
    };
    expect(mightBeDustPermit(email)).toBe(true);
  });

  it("catches emails with permit IDs", () => {
    const email = {
      body: "Checking on permit",
      from: "test@test.com",
      subject: "D0064026 Status",
    };
    expect(mightBeDustPermit(email)).toBe(true);
  });
});

// =============================================================================
// LLM Classifier Tests (requires local endpoint)
// =============================================================================

describe("classifyEmail (LLM classifier)", () => {
  const ENDPOINT = "https://llama.peacockery.studio/v1/chat/completions";

  // Check if endpoint is available before running tests
  async function isEndpointAvailable(): Promise<boolean> {
    try {
      const response = await fetch(ENDPOINT, {
        body: JSON.stringify({
          model: "llama",
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 5,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  it("classifies new permit request as intake", async () => {
    if (!(await isEndpointAvailable())) {
      console.log("Skipping: LLM endpoint not available");
      return;
    }

    const result = await classifyEmail(EMAILS.newPermit);
    expect(result.is_dust_permit).toBe(true);
    expect(result.intent).toBe("intake");
  });

  it("classifies renewal request as renewal", async () => {
    if (!(await isEndpointAvailable())) {
      console.log("Skipping: LLM endpoint not available");
      return;
    }

    const result = await classifyEmail(EMAILS.renewal);
    expect(result.is_dust_permit).toBe(true);
    expect(result.intent).toBe("renewal");
  });

  it("classifies modification as revision", async () => {
    if (!(await isEndpointAvailable())) {
      console.log("Skipping: LLM endpoint not available");
      return;
    }

    const result = await classifyEmail(EMAILS.revision);
    expect(result.is_dust_permit).toBe(true);
    expect(result.intent).toBe("revision");
  });

  it("classifies contact update as contact", async () => {
    if (!(await isEndpointAvailable())) {
      console.log("Skipping: LLM endpoint not available");
      return;
    }

    const result = await classifyEmail(EMAILS.contactUpdate);
    expect(result.is_dust_permit).toBe(true);
    expect(result.intent).toBe("contact");
  });

  it("classifies county issued email as notification", async () => {
    if (!(await isEndpointAvailable())) {
      console.log("Skipping: LLM endpoint not available");
      return;
    }

    const result = await classifyEmail(EMAILS.countyIssued);
    expect(result.is_dust_permit).toBe(true);
    expect(result.intent).toBe("notification");
  });

  it("classifies county closed email as notification", async () => {
    if (!(await isEndpointAvailable())) {
      console.log("Skipping: LLM endpoint not available");
      return;
    }

    const result = await classifyEmail(EMAILS.countyClosed);
    expect(result.is_dust_permit).toBe(true);
    expect(result.intent).toBe("notification");
  });

  it("classifies irrelevant email as ignore", async () => {
    if (!(await isEndpointAvailable())) {
      console.log("Skipping: LLM endpoint not available");
      return;
    }

    const result = await classifyEmail(EMAILS.irrelevantMeeting);
    expect(result.is_dust_permit).toBe(false);
    expect(result.intent).toBe("ignore");
  });
});

// =============================================================================
// Combined Filter + Classifier Test
// =============================================================================

describe("full classification pipeline", () => {
  it("filters and classifies correctly", () => {
    // Step 1: Keyword filter
    const emailsToClassify = Object.entries(EMAILS).filter(([_, email]) =>
      mightBeDustPermit(email)
    );

    // Should filter out irrelevant emails
    expect(emailsToClassify.length).toBeLessThan(Object.keys(EMAILS).length);

    // Irrelevant emails should be filtered out
    const filteredKeys = emailsToClassify.map(([key]) => key);
    expect(filteredKeys).not.toContain("irrelevantMeeting");
    expect(filteredKeys).not.toContain("irrelevantInvoice");

    // Permit emails should pass through
    expect(filteredKeys).toContain("newPermit");
    expect(filteredKeys).toContain("renewal");
    expect(filteredKeys).toContain("revision");
  });
});
