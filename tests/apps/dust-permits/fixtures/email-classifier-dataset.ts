/**
 * Labeled dataset for email classifier evaluation.
 *
 * Each entry contains an email sample and its expected classification.
 * Derived from real email patterns in .claude/skills/dust-permit-intake/dust-permit-examples/
 */

import type { EmailInput, EmailIntent } from "@/lib/email-classifier";

export interface LabeledEmail {
  category: string;
  email: EmailInput;
  expected: {
    isDustPermit: boolean;
    intent: EmailIntent;
  };
  id: string;
}

export const LABELED_EMAILS: LabeledEmail[] = [
  // =============================================================================
  // NEW PERMIT REQUESTS (intake)
  // =============================================================================
  {
    category: "new-permit",
    email: {
      subject: "Fw: Desert Sky: Dust Control Permit",
      from: "rick@desertservices.net",
      body: "Chi\nCan you submit the Dust permit for this site 6903 w thomas rd phoenix, az 85033.",
    },
    expected: { isDustPermit: true, intent: "intake" },
    id: "new-permit-desert-sky",
  },
  {
    category: "new-permit",
    email: {
      subject: "Modera PV - Dust Permit Needed",
      from: "ssenatro@mcrtrust.com",
      body: "What would you all need to proceed now with the dust control permit ONLY for Modera PV? We also are needing the dust control permit this week so will need to apply the rush fees for this.",
    },
    expected: { isDustPermit: true, intent: "intake" },
    id: "new-permit-modera-pv",
  },

  // =============================================================================
  // RENEWAL REQUESTS (renewal)
  // =============================================================================
  {
    category: "renewal",
    email: {
      subject: "Dust Control Renewal",
      from: "lsanchezburciaga@holder.com",
      body: "We will need Dust Control permit renewed for the North Parcel as the current permit expires on 1/29/2026.\n\nAddress : 9903 E. Elliott Rd MESA, AZ 85212, Parcel# 304-31-002Q and Facility ID: F019198.",
    },
    expected: { isDustPermit: true, intent: "renewal" },
    id: "renewal-holder-north-parcel",
  },
  {
    category: "renewal",
    email: {
      subject: "5th & Goldwater: Dust Control Permit Renewal",
      from: "dino.brunetti@woodpartners.com",
      body: "We noticed the dust permit for our 5th & Goldwater (aka Alta Goldwater) project will require a renewal by 1/15/26. I attached the current permit to this email for reference.",
    },
    expected: { isDustPermit: true, intent: "renewal" },
    id: "renewal-alta-goldwater",
  },

  // =============================================================================
  // MODIFICATION REQUESTS (revision)
  // =============================================================================
  {
    category: "modification",
    email: {
      subject: "Dust control modification at Banner Verrado",
      from: "darin.krier@ryancompanies.com",
      body: "Jared, can you please see the attached and make an adjustment to our dust control permit based on the area labeled dirt storage in black to the south of our laydown area.",
    },
    expected: { isDustPermit: true, intent: "revision" },
    id: "modification-banner-verrado",
  },

  // =============================================================================
  // CONTACT UPDATE REQUESTS (contact)
  // =============================================================================
  {
    category: "modification",
    email: {
      subject: "67 Flats - Dust Permit Contact",
      from: "StephenRichardson@Weisbuilders.com",
      body: "We need to update the contact info on our dust control permit.\n\nArt Maese\nSuperintendent\nartmaese@weisbuilders.com\nWD Construction\n4804907324",
    },
    expected: { isDustPermit: true, intent: "contact" },
    id: "contact-update-67-flats",
  },

  // =============================================================================
  // COUNTY NOTIFICATIONS (notification)
  // =============================================================================
  {
    category: "county-notification",
    email: {
      subject: "Dust Permit Issued",
      from: "no-reply@maricopa.gov",
      body: "The Maricopa County Air Quality dust control permit application D0064026 has been processed and approved.\n\nFacility ID#: F039203\nFacility Name: Sun Health La Roma Campus",
    },
    expected: { isDustPermit: true, intent: "notification" },
    id: "county-permit-issued-sun-health",
  },
  {
    category: "county-notification",
    email: {
      subject: "Air Quality Dust Permit Closed",
      from: "no-reply@maricopa.gov",
      body: "This is a courtesy notice to inform you that your Maricopa County Air Quality dust control permit D0058823 for 67 Flats - Phase 1, F050044, has been closed.",
    },
    expected: { isDustPermit: true, intent: "notification" },
    id: "county-permit-closed-67-flats",
  },
  {
    category: "county-notification",
    email: {
      subject: "Application Submitted Successfully",
      from: "no-reply@maricopa.gov",
      body: "Your dust control permit application has been submitted successfully. Application ID: D0064027. You will receive notification once processing is complete.",
    },
    expected: { isDustPermit: true, intent: "notification" },
    id: "county-submission-confirmation",
  },
  {
    category: "county-notification",
    email: {
      subject: "Dust Control Permit Application Rejected",
      from: "no-reply@maricopa.gov",
      body: "Your dust control permit application D0063892 has been returned for corrections. Please review the comments and resubmit.",
    },
    expected: { isDustPermit: true, intent: "notification" },
    id: "county-permit-rejected",
  },

  // =============================================================================
  // CLOSURE REQUESTS (notification - closures are informational)
  // =============================================================================
  {
    category: "closure",
    email: {
      subject: "Please close the dust permit for Levine Self Storage",
      from: "contractor@abernethy.com",
      body: "Hi team, the Levine Self Storage project is complete. Please close out the dust permit D0057891. Thanks!",
    },
    expected: { isDustPermit: true, intent: "notification" },
    id: "closure-levine-self-storage",
  },

  // =============================================================================
  // INTERNAL HANDOFFS (ignore - operational, not permit requests)
  // =============================================================================
  {
    category: "internal-handoff",
    email: {
      subject: "FW: Donovan Dodd",
      from: "lacie@desertservices.net",
      body: "Here are the quotes. I will keep you all updated on when they are ready for the fence and swppp",
    },
    expected: { isDustPermit: false, intent: "ignore" },
    id: "internal-handoff-quote",
  },
  {
    category: "internal-handoff",
    email: {
      subject: "JLB Lumberyard - Tasks",
      from: "lacie@desertservices.net",
      body: "- Fence install scheduled for Monday\n- SWPPP ready to go\n- Signs ordered\n- Restrooms confirmed",
    },
    expected: { isDustPermit: false, intent: "ignore" },
    id: "internal-bulleted-tasks",
  },

  // =============================================================================
  // IRRELEVANT EMAILS (ignore)
  // =============================================================================
  {
    category: "irrelevant",
    email: {
      subject: "Weekly Team Meeting",
      from: "kendra@desertservices.net",
      body: "Reminder: Our weekly team sync is tomorrow at 10am. Please bring your project updates.",
    },
    expected: { isDustPermit: false, intent: "ignore" },
    id: "irrelevant-meeting",
  },
  {
    category: "irrelevant",
    email: {
      subject: "Invoice #12345 - Payment Due",
      from: "accounting@vendor.com",
      body: "Please find attached invoice for services rendered. Payment is due within 30 days.",
    },
    expected: { isDustPermit: false, intent: "ignore" },
    id: "irrelevant-invoice",
  },
  {
    category: "irrelevant",
    email: {
      subject: "Office Closed for Holiday",
      from: "hr@desertservices.net",
      body: "The office will be closed on Monday for the holiday. Happy long weekend!",
    },
    expected: { isDustPermit: false, intent: "ignore" },
    id: "irrelevant-holiday",
  },
  {
    category: "irrelevant",
    email: {
      subject: "Limited Time Offer - Act Now!",
      from: "sales@randomcompany.com",
      body: "Don't miss out on this exclusive deal. Click here to learn more about our amazing products.",
    },
    expected: { isDustPermit: false, intent: "ignore" },
    id: "irrelevant-spam",
  },
];

// Helper to get emails by category
export function getEmailsByCategory(category: string): LabeledEmail[] {
  return LABELED_EMAILS.filter((e) => e.category === category);
}

// Helper to get emails by expected intent
export function getEmailsByIntent(intent: EmailIntent): LabeledEmail[] {
  return LABELED_EMAILS.filter((e) => e.expected.intent === intent);
}
