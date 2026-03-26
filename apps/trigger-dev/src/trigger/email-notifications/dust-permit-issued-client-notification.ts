import { getEmailById } from "@email/db/email";
import { createComposeClient } from "@lib/graph/compose";
import { createGraphClient } from "@lib/graph/mail";
import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import {
  FROM_MAILBOX,
  classifyPermit,
  permitPdfName,
  resolvePermitId,
  type DbClient,
} from "./helpers/dust-permit-notif-helper";
import { LOGO_ATTACHMENT, escapeHtml, signatureHtml, wrapHtml } from "./helpers/email-html";
import { findReplyCandidates, selectReplyRoute } from "./helpers/reply-routing";

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

interface IssuedPermit {
  address: string | null;
  company_name: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  facility_id: string | null;
  id: string;
  previous_app_id: string | null;
  project_id: number | null;
  project_name: string | null;
  submitted_date: string | null;
}

type NotificationType = "issued" | "renewed" | "revised";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve a reply-all email ID to Chi's mailbox message ID */
async function resolveChiMessageId(db: DbClient, emailId: number): Promise<string> {
  const email = await getEmailById(emailId);
  if (!email) throw new Error(`Email ${emailId} not found`);

  const mailbox = await db
    .query<{ email: string }, [number]>("SELECT email FROM mailboxes WHERE id = $1 LIMIT 1")
    .get(email.mailboxId);

  if (mailbox?.email.toLowerCase() === FROM_MAILBOX) return email.messageId;

  if (!email.internetMessageId) throw new Error(`Email ${emailId} not in ${FROM_MAILBOX} and no internet_message_id`);

  const sibling = await db
    .query<{ id: number }, [string, string]>(
      `SELECT e.id FROM emails e JOIN mailboxes m ON m.id = e.mailbox_id
       WHERE e.internet_message_id = $1 AND lower(m.email) = lower($2) LIMIT 1`
    )
    .get(email.internetMessageId, FROM_MAILBOX);
  if (!sibling) throw new Error(`Email ${emailId} has no copy in ${FROM_MAILBOX}`);

  const chiEmail = await getEmailById(sibling.id);
  if (!chiEmail) throw new Error(`Chi copy ${sibling.id} not found`);
  return chiEmail.messageId;
}

/** Download permit PDF from the Maricopa source email in Chi's mailbox */
async function downloadPermitPdf(db: DbClient, permitId: string, projectName: string): Promise<string | null> {
  const row = await db
    .query<{ message_id: string }, [string, string, string]>(
      `SELECT e.message_id FROM emails e JOIN mailboxes m ON m.id = e.mailbox_id
       WHERE m.email = $3 AND lower(COALESCE(e.from_email, '')) = 'no-reply@maricopa.gov'
         AND (e.body_full ILIKE $1 OR e.body_preview ILIKE $1 OR e.subject ILIKE $1
              OR e.body_full ILIKE $2 OR e.body_preview ILIKE $2 OR e.subject ILIKE $2)
       ORDER BY e.received_at DESC LIMIT 1`
    )
    .get(`%${permitId}%`, `%${projectName}%`, FROM_MAILBOX);
  if (!row) return null;

  const graph = createGraphClient();
  let attachments;
  try { attachments = await graph.getAttachments(row.message_id, FROM_MAILBOX); }
  catch { return null; }

  const pdf = attachments.find((a) => !a.isInline && (/\.pdf$/i.test(a.name) || a.contentType?.includes("pdf")));
  if (!pdf) return null;

  const bytes = await graph.downloadAttachment(row.message_id, pdf.id, FROM_MAILBOX);
  return bytes.toString("base64");
}

// ── Email template ───────────────────────────────────────────────────────────

function permitInfoBlock(): string {
  return `<div><br></div>` +
    `<div>Important Information About Your Dust Permit:</div>` +
    `<div><br></div>` +
    `<ul style="margin-top:0; margin-bottom:0;">` +
      `<li><div><b>Annual Renewal:</b> We will reach out 2-4 weeks before expiration to discuss renewal or closeout.</div></li>` +
      `<li><div><b>Revisions:</b> If there are site changes (added acreage, new parking lots, new superintendent, etc.), the permit may need revision. Revisions are free unless acreage increases into a higher disturbance threshold.</div></li>` +
      `<li><div><b>Closeout:</b> When your project is complete and fully stabilized, let us know and we'll close out the permit with the County at no charge.</div></li>` +
    `</ul>`;
}

function renderIssuedEmail(permit: IssuedPermit, type: NotificationType) {
  if (!permit.project_name) throw new Error(`Permit ${permit.id} has no project_name`);
  if (!permit.company_name) throw new Error(`Permit ${permit.id} has no company_name`);
  const permitNumber = permit.facility_id ?? permit.id;
  if (!permit.effective_date) throw new Error(`Permit ${permit.id} has no effective_date`);
  if (!permit.expiration_date) throw new Error(`Permit ${permit.id} has no expiration_date`);

  const actionWord = { issued: "issued", renewed: "renewed", revised: "revised" }[type];
  const status = { issued: "Active", renewed: "Renewed", revised: "Revised" }[type];
  const subjectPrefix = { issued: "Dust Permit Issued", renewed: "Dust Permit Renewed", revised: "Dust Permit Revised" }[type];

  let details =
    `<li><div>Permit Status: ${status}</div></li>` +
    `<li><div>Application #: ${escapeHtml(permit.id)}</div></li>` +
    (type === "renewed" && permit.previous_app_id ? `<li><div>Superseded Application #: ${escapeHtml(permit.previous_app_id)}</div></li>` : "") +
    `<li><div>Permit # (Facility ID): ${escapeHtml(permitNumber)}</div></li>` +
    `<li><div>Project Name: ${escapeHtml(permit.project_name)}</div></li>` +
    (permit.address ? `<li><div>Site Address: ${escapeHtml(permit.address)}</div></li>` : "") +
    `<li><div>Issue Date: ${escapeHtml(permit.effective_date)}</div></li>` +
    `<li><div>Expiration Date: ${escapeHtml(permit.expiration_date)}</div></li>`;

  let body = `<div>Team,</div><div><br></div>` +
    `<div>The dust control permit for <b>${escapeHtml(permit.company_name)}</b> on project "<b>${escapeHtml(permit.project_name)}</b>" has been ${actionWord} (see attached).</div>` +
    `<div><br></div>` +
    `<div>Here are the key details:</div>` +
    `<ul style="margin-top:0; margin-bottom:0;">${details}</ul>`;

  if (type === "issued" || type === "renewed") body += permitInfoBlock();

  body += `<div><br></div><div>Let me know if you have any questions!</div>` + signatureHtml();

  return {
    body: wrapHtml(body),
    subject: `${subjectPrefix} — ${permit.project_name} (${permit.id})`,
  };
}

// ── Task ─────────────────────────────────────────────────────────────────────

export const dustPermitIssuedClientNotification = schemaTask({
  id: "dust-permit-issued-client-notification",
  maxDuration: 120,
  retry: { maxAttempts: 2 },
  schema: inputSchema,
  run: async (input) => {
    const { db } = await import("@lib/db/client");

    const { permitId } = await resolvePermitId(db, input);

    const permit = await db
      .query<IssuedPermit, [string]>(
        `SELECT id, project_name, company_name, address, facility_id,
                effective_date, expiration_date, submitted_date, previous_app_id, project_id
         FROM dust_permits_filed_by_desert_services WHERE id = $1`
      )
      .get(permitId);
    if (!permit) throw new Error(`Permit ${permitId} not found`);

    const classification = await classifyPermit(db, permit.submitted_date, permit.previous_app_id);
    const type: NotificationType = classification === "revision" ? "revised" : classification === "renewal" ? "renewed" : "issued";

    const template = renderIssuedEmail(permit, type);

    // Find the client's thread to reply-all on
    const candidates = await findReplyCandidates(db, permitId, permit.project_name, permit.project_id);
    const route = selectReplyRoute(candidates, permitId, permit.project_name);

    const compose = createComposeClient();
    let draftId: string;

    if (route.mode === "reply-all" && route.replyToEmailId) {
      const messageId = await resolveChiMessageId(db, route.replyToEmailId);
      const replyDraft = await compose.createReplyAllDraft({ messageId, userId: FROM_MAILBOX });
      await compose.updateDraft({ body: template.body, bodyType: "html", draftId: replyDraft.id, userId: FROM_MAILBOX });
      draftId = replyDraft.id;
    } else {
      const draft = await compose.createDraft({
        body: template.body, bodyType: "html",
        subject: template.subject,
        to: [{ email: FROM_MAILBOX }],
        userId: FROM_MAILBOX,
      });
      draftId = draft.id;
    }

    // Attach logo
    await compose.addFileAttachment({ ...LOGO_ATTACHMENT, draftId, userId: FROM_MAILBOX });

    // Attach permit PDF
    const pdfBase64 = await downloadPermitPdf(db, permitId, permit.project_name!);
    if (pdfBase64) {
      await compose.addFileAttachment({
        contentBytesBase64: pdfBase64,
        contentType: "application/pdf",
        draftId,
        name: permitPdfName(permit.project_name!, permit.facility_id),
        userId: FROM_MAILBOX,
      });
    }

    if (!input.draft) {
      await compose.sendDraft(draftId, FROM_MAILBOX);
    }

    return {
      draftId,
      mode: input.draft ? "draft" as const : "sent" as const,
      permitId,
      type,
      subject: template.subject,
      route: route.mode,
      hasPdf: Boolean(pdfBase64),
    };
  },
});
