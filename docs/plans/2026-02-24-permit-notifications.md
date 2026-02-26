# Permit Email Notifications Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a Trigger.dev task that sends dust permit email notifications (8 types) using TypeScript templates and Microsoft Graph API.

**Architecture:** TypeScript template functions in `lib/email/permit-templates.ts` produce `{ subject, body }` for each notification type. A `schemaTask` in `apps/trigger-dev/src/trigger/permit-notifications.ts` looks up permit data from Postgres, renders the template, and creates/sends an Outlook draft via Graph API. Draft mode is default (configurable).

**Tech Stack:** Trigger.dev v3 (`schemaTask`), Zod, Microsoft Graph API (`lib/graph/client.ts` — `createComposeClient`), Bun.sql (Postgres)

---

### Task 1: Create TypeScript email templates

**Files:**
- Create: `lib/email/permit-templates.ts`

**Step 1: Create the template file with shared helpers and all 8 template functions**

This file has zero dependencies — pure string interpolation. Shared helpers at the top, then one exported function per notification type.

```ts
/**
 * Dust permit email templates — pure TypeScript, no Handlebars.
 *
 * Each function takes typed vars and returns { subject, body } where
 * body is an HTML string ready for Graph API sendMail/createDraft.
 */

// ── Shared helpers ──────────────────────────────────────────────

function signature(): string {
  return `<div>Best,</div>
<div>--</div>
<div><br></div>
<div>Chi Ejimofor</div>
<div>Project Coordinator</div>
<div>E: <a href="mailto:chi@desertservices.net">chi@desertservices.net</a></div>
<div>M: (304) 405-2446</div>
<div><img src="cid:logo" alt="Desert Services LLC" width="264" style="max-width:100%"></div>`;
}

function wrap(content: string): string {
  return `<html>
<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head>
<body>
${content}
</body>
</html>`;
}

function li(label: string, value: string | null | undefined): string {
  if (value == null || value === "") return "";
  return `<li><div><b>${label}:</b> ${value}</div></li>`;
}

function liPlain(text: string): string {
  return `<li><div>${text}</div></li>`;
}

function ul(items: string): string {
  return `<ul style="margin-top:0; margin-bottom:0">${items}</ul>`;
}

function greeting(name: string): string {
  return `<div>${name},</div><div><br></div>`;
}

function closing(): string {
  return `<div><br></div>
<div>Let me know if you have any questions!</div>
<div><br></div>
${signature()}`;
}

// ── Output type ─────────────────────────────────────────────────

export interface EmailTemplate {
  subject: string;
  body: string;
}

// ── Issued ──────────────────────────────────────────────────────

export interface PermitIssuedVars {
  recipientName: string;
  accountName: string;
  projectName: string;
  permitStatus: string;
  applicationNumber: string;
  permitNumber: string;
  siteAddress: string;
  acreage: string;
  issueDate: string;
  expirationDate: string;
  showPermitInfo?: boolean;
}

export function permitIssuedEmail(v: PermitIssuedVars): EmailTemplate {
  const permitInfo = v.showPermitInfo !== false ? `<div><br></div>
<div>Important Information About Your Permit:</div>
<div><br></div>
${ul(
  liPlain("<strong>Annual Renewal:</strong>&nbsp;We will reach out 2\u20134 weeks before expiration to discuss renewal or closeout.") +
  liPlain("<strong>Revisions</strong>: If there are site changes (added acreage, new parking lots, new superintendent, etc.), the permit may need revision. Revisions are free unless acreage increases into a higher disturbance threshold.") +
  liPlain("<strong>Closeout</strong>: When your project is complete and fully stabilized, let us know and we\u2019ll close out the permit with the County at no charge.")
)}` : "";

  return {
    subject: `Dust Permit Issued — ${v.projectName} (${v.applicationNumber})`,
    body: wrap(
      greeting(v.recipientName) +
      `<div>The dust control permit for <strong>${v.accountName}</strong> on project \u201c<strong>${v.projectName}</strong>\u201d has been issued (see attached).<br><br></div>
<div>Here are the key details:</div>
${ul(
  liPlain(`Permit Status: ${v.permitStatus}`) +
  liPlain(`Application #: ${v.applicationNumber}`) +
  liPlain(`Permit # (Facility ID): ${v.permitNumber}`) +
  liPlain(`Project Name: ${v.projectName}`) +
  liPlain(`Site Address: ${v.siteAddress}`) +
  liPlain(`Project Acreage: ${v.acreage} acres`) +
  liPlain(`Issue Date: ${v.issueDate}`) +
  liPlain(`Expiration Date: ${v.expirationDate}`)
)}` +
      permitInfo +
      closing()
    ),
  };
}

// ── Renewed ─────────────────────────────────────────────────────

export interface PermitRenewedVars {
  recipientName: string;
  accountName: string;
  projectName: string;
  applicationNumber: string;
  supersededApplicationNumber: string;
  permitNumber: string;
  siteAddress: string;
  acreage: string;
  issueDate: string;
  expirationDate: string;
}

export function permitRenewedEmail(v: PermitRenewedVars): EmailTemplate {
  return {
    subject: `Dust Permit Renewed — ${v.projectName} (${v.applicationNumber})`,
    body: wrap(
      greeting(v.recipientName) +
      `<div>The dust control permit for <strong>${v.accountName}</strong> on project \u201c<strong>${v.projectName}</strong>\u201d has been renewed (see attached).<br><br></div>
<div>Here are the key details:</div>
${ul(
  liPlain("Permit Status: Renewed") +
  liPlain(`Application #: ${v.applicationNumber}`) +
  liPlain(`Superseded Application #: ${v.supersededApplicationNumber}`) +
  liPlain(`Permit # (Facility ID): ${v.permitNumber}`) +
  liPlain(`Project Name: ${v.projectName}`) +
  liPlain(`Site Address: ${v.siteAddress}`) +
  liPlain(`Project Acreage: ${v.acreage} acres`) +
  liPlain(`Issue Date: ${v.issueDate}`) +
  liPlain(`Expiration Date: ${v.expirationDate}`)
)}` +
      `<div><br></div>
<div>Important Information About Your Permit:</div>
<div><br></div>
${ul(
  liPlain("<strong>Annual Renewal:</strong>&nbsp;We will reach out 2\u20134 weeks before expiration to discuss renewal or closeout.") +
  liPlain("<strong>Revisions</strong>: If there are site changes (added acreage, new parking lots, new superintendent, etc.), the permit may need revision. Revisions are free unless acreage increases into a higher disturbance threshold.") +
  liPlain("<strong>Closeout</strong>: When your project is complete and fully stabilized, let us know and we\u2019ll close out the permit with the County at no charge.")
)}` +
      closing()
    ),
  };
}

// ── Submitted ───────────────────────────────────────────────────

export interface PermitSubmittedVars {
  recipientName: string;
  accountName: string;
  projectName: string;
  applicationNumber: string;
  facilityId?: string | null;
  siteAddress: string;
  acreage: string;
}

export function permitSubmittedEmail(v: PermitSubmittedVars): EmailTemplate {
  const facilityDisplay = v.facilityId
    ? `${v.facilityId} (Renewal)`
    : '<span style="color:red">Pending</span>';

  return {
    subject: `Dust Permit Submitted — ${v.projectName} (${v.applicationNumber})`,
    body: wrap(
      greeting(v.recipientName) +
      `<div>A dust permit application for <strong>${v.accountName}</strong> on project \u201c<strong>${v.projectName}</strong>\u201d has been submitted to Maricopa County (see attached).<br><br></div>
<div>Here are the key details:</div>
${ul(
  liPlain("Permit Status: Submitted") +
  liPlain(`Application #: ${v.applicationNumber}`) +
  liPlain(`Permit # (Facility ID): ${facilityDisplay}`) +
  liPlain(`Project Name: ${v.projectName}`) +
  liPlain(`Site Address: ${v.siteAddress}`) +
  liPlain(`Project Acreage: ${v.acreage} acres`)
)}` +
      `<div><br></div>
<div>Processing typically takes 5-10 business days. If you need expedited processing, please reach out immediately.</div>` +
      closing()
    ),
  };
}

// ── Revised ─────────────────────────────────────────────────────

export interface PermitRevisedVars {
  recipientName: string;
  accountName: string;
  projectName: string;
  applicationNumber: string;
  permitNumber: string;
  siteAddress: string;
  acreage: string;
  issueDate: string;
  expirationDate: string;
  changesHtml?: string;
}

export function permitRevisedEmail(v: PermitRevisedVars): EmailTemplate {
  return {
    subject: `Dust Permit Revised — ${v.projectName} (${v.applicationNumber})`,
    body: wrap(
      greeting(v.recipientName) +
      `<div>The dust control permit for <strong>${v.accountName}</strong> on project \u201c<strong>${v.projectName}</strong>\u201d has been revised (see attached).<br><br></div>
<div>Here are the key details:</div>
${ul(
  liPlain("Permit Status: Revised") +
  liPlain(`Application #: ${v.applicationNumber}`) +
  liPlain(`Permit # (Facility ID): ${v.permitNumber}`) +
  liPlain(`Project Name: ${v.projectName}`) +
  liPlain(`Site Address: ${v.siteAddress}`) +
  liPlain(`Project Acreage: ${v.acreage} acres`) +
  liPlain(`Issue Date: ${v.issueDate}`) +
  liPlain(`Expiration Date: ${v.expirationDate}`)
)}` +
      (v.changesHtml ? `<div><br></div><div>Changes Made:</div>${ul(v.changesHtml)}` : "") +
      closing()
    ),
  };
}

// ── Reminder ────────────────────────────────────────────────────

export interface PermitReminderVars {
  recipientName: string;
  accountName: string;
  projectName: string;
  applicationNumber: string;
  permitNumber: string;
  siteAddress: string;
  expirationDate: string;
}

export function permitReminderEmail(v: PermitReminderVars): EmailTemplate {
  return {
    subject: `Dust Permit Expiring — ${v.projectName} (${v.applicationNumber})`,
    body: wrap(
      greeting(v.recipientName) +
      `<div>This is a friendly reminder that the dust control permit for <strong>${v.accountName}</strong> on project \u201c<strong>${v.projectName}</strong>\u201d is approaching its expiration date.<br><br></div>
<div>Here are the key details:</div>
${ul(
  liPlain(`Application #: ${v.applicationNumber}`) +
  liPlain(`Permit # (Facility ID): ${v.permitNumber}`) +
  liPlain(`Project Name: ${v.projectName}`) +
  liPlain(`Site Address: ${v.siteAddress}`) +
  liPlain(`Expiration Date: ${v.expirationDate}`)
)}` +
      `<div><br></div>
<div>Is the project still active? Please let us know if you\u2019d like us to:</div>
${ul(
  liPlain("<strong>Renew</strong>&nbsp;the permit for another year") +
  liPlain("<strong>Close out</strong>&nbsp;the permit (if the site is fully stabilized)")
)}` +
      `<div><br></div>
${signature()}`
    ),
  };
}

// ── Billing (new permit) ────────────────────────────────────────

export interface PermitBillingVars {
  recipientName: string;
  accountName: string;
  projectName: string;
  address: string;
  applicationNumber: string;
  permitNumber?: string | null;
  acceleratedProcessing: string;
  vendorName: string;
  permitCost: string;
  adminFee?: string | null;
  scheduleValue: string;
  confirmationId?: string | null;
  invoiceNumber: string;
  paymentMethod: string;
  cardholderName: string;
  paymentDate?: string | null;
  invoiceDate?: string | null;
}

export function permitBillingEmail(v: PermitBillingVars): EmailTemplate {
  return {
    subject: `Dust Permit Billing — ${v.projectName} (${v.applicationNumber})`,
    body: wrap(
      greeting(v.recipientName) +
      `<div>A dust permit application has been submitted to Maricopa County. Please prepare for billing.</div>
<ul>
${li("Customer", v.accountName)}
${li("Project", v.projectName)}
${li("Site Address", v.address)}
${li("Application #", v.applicationNumber)}
${v.permitNumber ? li("Permit # (Facility ID)", v.permitNumber) : ""}
${li("Accelerated Processing", v.acceleratedProcessing)}
<li><div>----</div></li>
${li("Vendor Paid", v.vendorName)}
${li("Permit Cost (ADEQ)", v.permitCost)}
${v.adminFee ? li("Admin Fee", v.adminFee) : ""}
${li("Schedule Charge", v.scheduleValue)}
${v.confirmationId ? li("Confirmation #", v.confirmationId) : ""}
${li("Invoice #", v.invoiceNumber)}
<li><div>----</div></li>
${li("Payment Method", v.paymentMethod)}
${li("Cardholder", v.cardholderName)}
${v.paymentDate ? li("Payment Date", v.paymentDate) : ""}
${v.invoiceDate ? li("Invoice Date", v.invoiceDate) : ""}
</ul>` +
      closing()
    ),
  };
}

// ── Billing Renewed ─────────────────────────────────────────────

export interface PermitBillingRenewedVars {
  recipientName: string;
  accountName: string;
  projectName: string;
  address: string;
  applicationNumber: string;
  supersededApplicationNumber: string;
  permitNumber: string;
  acceleratedProcessing: string;
  vendorName: string;
  permitCost: string;
  acceleratedFee?: string | null;
  scheduleValue: string;
  paymentMethod: string;
  paymentDate?: string | null;
  confirmationId?: string | null;
  cardLastFour: string;
  cardholderName: string;
  invoiceNumber: string;
  invoiceDate: string;
}

export function permitBillingRenewedEmail(v: PermitBillingRenewedVars): EmailTemplate {
  return {
    subject: `Dust Permit Billing (Renewal) — ${v.projectName} (${v.applicationNumber})`,
    body: wrap(
      greeting(v.recipientName) +
      `<div>A dust permit renewal has been submitted to Maricopa County. Please prepare for billing.</div>
<ul>
${li("Customer", v.accountName)}
${li("Project", v.projectName)}
${li("Site Address", v.address)}
${li("Application #", v.applicationNumber)}
${li("Superseded Application #", v.supersededApplicationNumber)}
${li("Permit # (Facility ID)", v.permitNumber)}
${li("Accelerated Processing", v.acceleratedProcessing)}
${li("Vendor Paid", v.vendorName)}
${li("Permit Cost", v.permitCost)}
${v.acceleratedFee ? li("Accelerated Fee", v.acceleratedFee) : ""}
${li("Schedule Value", v.scheduleValue)}
${li("Payment Method", v.paymentMethod)}
${v.paymentDate ? li("Payment Date", v.paymentDate) : ""}
${v.confirmationId ? li("Confirmation #", v.confirmationId) : ""}
${li("Card Last 4", v.cardLastFour)}
${li("Cardholder", v.cardholderName)}
${li("Invoice #", v.invoiceNumber)}
${li("Invoice Date", v.invoiceDate)}
</ul>` +
      closing()
    ),
  };
}

// ── Billing Revised ─────────────────────────────────────────────

export interface PermitBillingRevisedVars {
  recipientName: string;
  accountName: string;
  projectName: string;
  address: string;
  applicationNumber: string;
  supersededApplicationNumber: string;
  permitNumber: string;
  acceleratedProcessing: string;
  vendorName: string;
  permitCost: string;
  acceleratedFee?: string | null;
  scheduleValue: string;
  paymentMethod: string;
  paymentDate?: string | null;
  confirmationId?: string | null;
  cardLastFour: string;
  cardholderName: string;
  invoiceNumber: string;
  invoiceDate: string;
  changesHtml?: string;
}

export function permitBillingRevisedEmail(v: PermitBillingRevisedVars): EmailTemplate {
  return {
    subject: `Dust Permit Billing (Revision) — ${v.projectName} (${v.applicationNumber})`,
    body: wrap(
      greeting(v.recipientName) +
      `<div>A dust permit revision has been submitted to Maricopa County. Please prepare for billing.</div>
<ul>
${li("Customer", v.accountName)}
${li("Project", v.projectName)}
${li("Site Address", v.address)}
${li("Application #", v.applicationNumber)}
${li("Superseded Application #", v.supersededApplicationNumber)}
${li("Permit # (Facility ID)", v.permitNumber)}
${li("Accelerated Processing", v.acceleratedProcessing)}
${li("Vendor Paid", v.vendorName)}
${li("Permit Cost", v.permitCost)}
${v.acceleratedFee ? li("Accelerated Fee", v.acceleratedFee) : ""}
${li("Schedule Value", v.scheduleValue)}
${li("Payment Method", v.paymentMethod)}
${v.paymentDate ? li("Payment Date", v.paymentDate) : ""}
${v.confirmationId ? li("Confirmation #", v.confirmationId) : ""}
${li("Card Last 4", v.cardLastFour)}
${li("Cardholder", v.cardholderName)}
${li("Invoice #", v.invoiceNumber)}
${li("Invoice Date", v.invoiceDate)}
</ul>` +
      (v.changesHtml ? `<div><b>Changes Made:</b></div><ul>${v.changesHtml}</ul>` : "") +
      closing()
    ),
  };
}

// ── Dispatcher ──────────────────────────────────────────────────

export const NOTIFICATION_TYPES = [
  "issued",
  "renewed",
  "submitted",
  "revised",
  "reminder",
  "billing",
  "billing-renewed",
  "billing-revised",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Map notification type → template function. Caller provides the vars. */
export const TEMPLATE_MAP: Record<NotificationType, (vars: any) => EmailTemplate> = {
  issued: permitIssuedEmail,
  renewed: permitRenewedEmail,
  submitted: permitSubmittedEmail,
  revised: permitRevisedEmail,
  reminder: permitReminderEmail,
  billing: permitBillingEmail,
  "billing-renewed": permitBillingRenewedEmail,
  "billing-revised": permitBillingRevisedEmail,
};
```

**Step 2: Verify the file type-checks**

Run: `bunx tsc --noEmit --project tsconfig.json 2>&1 | grep permit-templates || echo "No errors"`
Expected: No errors (or only pre-existing errors unrelated to this file)

**Step 3: Commit**

```bash
git add lib/email/permit-templates.ts
git commit -m "feat: add TypeScript dust permit email templates (8 types)"
```

---

### Task 2: Create the Trigger.dev permit-notification task

**Files:**
- Create: `apps/trigger-dev/src/trigger/permit-notifications.ts`

**Dependencies:** Task 1 (templates must exist)

**Step 1: Create the task file**

```ts
/**
 * Permit Notification — Trigger.dev on-demand task
 *
 * Sends dust permit email notifications via Microsoft Graph API.
 * Creates Outlook drafts by default (configurable to send immediately).
 *
 * Trigger via API, CLI, or chain from other tasks:
 *   POST /api/v1/tasks/permit-notification/trigger
 *   { "payload": { "permitId": "D0063827", "type": "issued" } }
 */

import {
  type NotificationType,
  NOTIFICATION_TYPES,
  TEMPLATE_MAP,
} from "@lib/email/permit-templates";
import { createComposeClient } from "@lib/graph/client";
import { logger, schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";

const FROM_MAILBOX = "chi@desertservices.net";

export const permitNotification = schemaTask({
  id: "permit-notification",
  schema: z.object({
    permitId: z.string().regex(/^D\d{7}$/, "Must be D0XXXXXX format"),
    type: z.enum(NOTIFICATION_TYPES),
    recipients: z.array(z.string().email()).optional(),
    draft: z.boolean().default(true),
    extraVars: z.record(z.string()).optional(),
  }),
  maxDuration: 60,
  retry: { maxAttempts: 2 },
  run: async ({ permitId, type, recipients, draft, extraVars }) => {
    // 1. Look up permit from Postgres
    const { sql } = await import("bun");
    const [permit] = await sql`
      SELECT * FROM dust_permits_filed_by_desert_services WHERE id = ${permitId}
    `;

    if (!permit) {
      throw new Error(`Permit ${permitId} not found in database`);
    }

    // 2. Build template vars from permit + extraVars
    const vars = buildTemplateVars(permit, type, extraVars);

    // 3. Render template
    const templateFn = TEMPLATE_MAP[type];
    const { subject, body } = templateFn(vars);

    logger.info("Rendered permit notification", {
      permitId,
      type,
      subject,
      recipientCount: recipients?.length ?? 0,
      draft,
    });

    // 4. Create draft (and optionally send) via Graph API
    const compose = createComposeClient();

    const to = recipients?.length
      ? recipients.map((email) => ({ email }))
      : [{ email: FROM_MAILBOX }]; // Default: draft to self for review

    const draftMsg = await compose.createDraft({
      userId: FROM_MAILBOX,
      subject,
      body,
      bodyType: "html",
      to,
      skipSignature: true, // signature is already in the template
    });

    logger.info("Created Outlook draft", { draftId: draftMsg.id, subject });

    // 5. Send if not in draft mode
    if (!draft) {
      await compose.sendDraft(draftMsg.id, FROM_MAILBOX);
      logger.info("Sent permit notification", { permitId, type, subject });
    }

    return {
      draftId: draftMsg.id,
      subject,
      mode: draft ? ("draft" as const) : ("sent" as const),
      permitId,
      type,
    };
  },
});

// ── Helpers ─────────────────────────────────────────────────────

function buildTemplateVars(
  permit: Record<string, unknown>,
  type: NotificationType,
  extraVars?: Record<string, string>
): Record<string, unknown> {
  // Base vars from the permit record
  const base: Record<string, unknown> = {
    recipientName: extraVars?.recipientName ?? "Team",
    accountName: permit.company_name ?? "Unknown",
    projectName: permit.project_name ?? "Unknown",
    applicationNumber: permit.id as string,
    permitNumber: permit.facility_id ?? permit.id,
    siteAddress: permit.address ?? "N/A",
    acreage: extraVars?.acreage ?? "N/A",
    issueDate: permit.effective_date ?? "N/A",
    expirationDate: permit.expiration_date ?? "N/A",
    facilityId: permit.facility_id,
    address: permit.address ?? "N/A",
    supersededApplicationNumber: permit.previous_app_id ?? "N/A",
    permitStatus: permit.status ?? "Active",
    showPermitInfo: true,
    acceleratedProcessing: permit.is_accelerated ? "Yes" : "No",
  };

  // Merge extraVars (overrides base)
  if (extraVars) {
    for (const [k, v] of Object.entries(extraVars)) {
      base[k] = v;
    }
  }

  return base;
}
```

**Step 2: Verify the file type-checks**

Run: `bunx tsc --noEmit --project tsconfig.json 2>&1 | grep permit-notifications || echo "No errors"`
Expected: No errors (or only pre-existing errors unrelated to this file)

**Step 3: Commit**

```bash
git add apps/trigger-dev/src/trigger/permit-notifications.ts
git commit -m "feat: add permit-notification Trigger.dev task (draft/send via Graph API)"
```

---

### Task 3: Deploy and verify

**Step 1: Run dev worker to verify task loads**

Run: `CI=1 NO_COLOR=1 bunx trigger.dev@latest dev --skip-update-check 2>&1 | head -30`
Expected: Should show `permit-notification` in the registered tasks list

**Step 2: Test with a real permit (draft mode)**

Run via Trigger.dev API:
```bash
printf '{"payload":{"permitId":"D0063827","type":"issued","draft":true},"options":{}}' | \
  curl -s -X POST http://localhost:8030/api/v1/tasks/permit-notification/trigger \
  -H "Authorization: Bearer tr_dev_GOyEDErgPSH6SZlGjBZ8" \
  -H "Content-Type: application/json" -d @-
```
Expected: Returns a run handle. Check Trigger.dev dashboard for result with `draftId` and `mode: "draft"`.

**Step 3: Verify draft appeared in Outlook**

Use the Outlook MCP `list-emails` tool to check <chi@desertservices.net> drafts folder for the new draft.

**Step 4: Deploy to production**

Run: `bunx trigger.dev@latest deploy -a http://localhost:8030 --builder trigger`
Expected: Successful deploy with `permit-notification` in the task list.

**Step 5: Commit any fixes and tag**

```bash
git add -A
git commit -m "chore: deploy permit-notification task"
```
