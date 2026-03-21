import { createComposeClient } from "@lib/graph/compose";
import { createGraphClient } from "@lib/graph/mail";
import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import {
  FROM_MAILBOX,
  permitPdfName,
  resolvePermitId,
  type DbClient,
} from "./helpers/dust-permit-notif-helper";
import { LOGO_ATTACHMENT, escapeHtml, signatureHtml, wrapHtml } from "./helpers/email-html";

// ── Schema ───────────────────────────────────────────────────────────────────

const inputSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("payment-email"),
    emailId: z.number().int().positive(),
    draft: z.boolean().default(true),
  }),
  z.object({
    mode: z.literal("manual"),
    permitId: z.string().regex(/^D\d{7}$/),
    draft: z.boolean().default(true),
  }),
  z.object({
    mode: z.literal("invoice"),
    invoiceNumber: z.string().regex(/^IV\d+$/),
    draft: z.boolean().default(true),
  }),
]);

// ── Types ────────────────────────────────────────────────────────────────────

interface SubmittedPermit {
  address: string | null;
  company_name: string | null;
  facility_id: string | null;
  id: string;
  previous_app_id: string | null;
  project_name: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Find the Maricopa source email for a permit in Chi's mailbox */
async function findSourceEmail(db: DbClient, permitId: string, projectName: string | null) {
  const row = await db
    .query<{ message_id: string }, [string, string, string]>(
      `SELECT e.message_id
       FROM emails e
       JOIN mailboxes m ON m.id = e.mailbox_id
       WHERE m.email = $3
         AND lower(COALESCE(e.from_email, '')) = 'no-reply@maricopa.gov'
         AND (e.body_full ILIKE $1 OR e.body_preview ILIKE $1 OR e.subject ILIKE $1
              OR e.body_full ILIKE $2 OR e.body_preview ILIKE $2 OR e.subject ILIKE $2)
       ORDER BY e.received_at DESC
       LIMIT 1`
    )
    .get(`%${permitId}%`, `%${projectName ?? permitId}%`, FROM_MAILBOX);

  if (!row) return null;
  return { mailboxEmail: FROM_MAILBOX, messageId: row.message_id };
}

/** Download the permit PDF attachment from the source email */
async function downloadPermitPdf(messageId: string, mailboxEmail: string) {
  const graph = createGraphClient();

  let attachments;
  try {
    attachments = await graph.getAttachments(messageId, mailboxEmail);
  } catch {
    return null;
  }

  const pdf = attachments.find((a) => !a.isInline && (/\.pdf$/i.test(a.name) || a.contentType?.includes("pdf")));
  if (!pdf) return null;

  const bytes = await graph.downloadAttachment(messageId, pdf.id, mailboxEmail);
  return { base64: bytes.toString("base64") };
}

// ── Email template ───────────────────────────────────────────────────────────

function renderSubmittedEmail(permit: SubmittedPermit) {
  if (!permit.project_name) throw new Error(`Permit ${permit.id} has no project_name`);
  if (!permit.company_name) throw new Error(`Permit ${permit.id} has no company_name`);

  const isRenewal = Boolean(permit.facility_id && permit.previous_app_id);
  const facilityLine = isRenewal
    ? `${escapeHtml(permit.facility_id!)} (Renewal)`
    : `<span style="color:red">Pending</span>`;

  const body = wrapHtml(
    `<div>Team,</div>` +
    `<div><br></div>` +
    `<div>A dust permit application for <b>${escapeHtml(permit.company_name)}</b> on project "<b>${escapeHtml(permit.project_name)}</b>" has been submitted to Maricopa County (see attached).</div>` +
    `<div><br></div>` +
    `<div>Here are the key details:</div>` +
    `<ul style="margin-top:0; margin-bottom:0;">` +
      `<li><div>Permit Status: Submitted</div></li>` +
      `<li><div>Application #: ${escapeHtml(permit.id)}</div></li>` +
      `<li><div>Permit # (Facility ID): ${facilityLine}</div></li>` +
      `<li><div>Project Name: ${escapeHtml(permit.project_name)}</div></li>` +
      (permit.address ? `<li><div>Site Address: ${escapeHtml(permit.address)}</div></li>` : "") +
    `</ul>` +
    `<div><br></div>` +
    `<div>Processing typically takes 5-10 business days. If you need expedited processing, please reach out immediately.</div>` +
    `<div><br></div>` +
    `<div>Let me know if you have any questions!</div>` +
    signatureHtml()
  );

  return body;
}

// ── Task ─────────────────────────────────────────────────────────────────────

export const dustPermitSubmittedClientNotification = schemaTask({
  id: "dust-permit-submitted-client-notification",
  maxDuration: 60,
  retry: { maxAttempts: 2 },
  schema: inputSchema,
  run: async (input) => {
    const { db } = await import("@lib/db/client");

    const { permitId } = await resolvePermitId(db, input);

    const permit = await db
      .query<SubmittedPermit, [string]>(
        `SELECT id, project_name, company_name, address, facility_id, previous_app_id
         FROM dust_permits_filed_by_desert_services WHERE id = $1`
      )
      .get(permitId);
    if (!permit) throw new Error(`Permit ${permitId} not found`);

    const source = await findSourceEmail(db, permitId, permit.project_name);
    if (!source) throw new Error(`No Maricopa source email found for permit ${permitId}`);

    const body = renderSubmittedEmail(permit);

    const compose = createComposeClient();
    const replyDraft = await compose.createReplyAllDraft({
      messageId: source.messageId,
      userId: FROM_MAILBOX,
    });

    await compose.updateDraft({
      body,
      bodyType: "html",
      draftId: replyDraft.id,
      userId: FROM_MAILBOX,
    });

    await compose.addFileAttachment({ ...LOGO_ATTACHMENT, draftId: replyDraft.id, userId: FROM_MAILBOX });

    const pdf = await downloadPermitPdf(source.messageId, source.mailboxEmail);
    if (pdf) {
      await compose.addFileAttachment({
        contentBytesBase64: pdf.base64,
        contentType: "application/pdf",
        draftId: replyDraft.id,
        name: permitPdfName(permit.project_name!, permit.facility_id),
        userId: FROM_MAILBOX,
      });
    }

    if (!input.draft) {
      await compose.sendDraft(replyDraft.id, FROM_MAILBOX);
    }

    return {
      draftId: replyDraft.id,
      mode: input.draft ? "draft" as const : "sent" as const,
      permitId,
      hasPdf: Boolean(pdf),
    };
  },
});
