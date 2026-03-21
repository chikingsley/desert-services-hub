import { getEmailById } from "@email/db/email";
import { createComposeClient } from "@lib/graph/compose";
import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import {
  FROM_MAILBOX,
  classifyPermit,
  resolvePermitId,
  type DbClient,
  type PermitClassification,
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

interface SubmittedPermit {
  address: string | null;
  company_name: string | null;
  facility_id: string | null;
  id: string;
  previous_app_id: string | null;
  project_id: number | null;
  project_name: string | null;
  submitted_date: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve a reply-all email ID to Chi's mailbox message ID */
async function resolveChiMessageId(db: DbClient, emailId: number): Promise<string> {
  const email = await getEmailById(emailId);
  if (!email) throw new Error(`Email ${emailId} not found`);

  const mailbox = await db
    .query<{ email: string }, [number]>("SELECT email FROM mailboxes WHERE id = $1 LIMIT 1")
    .get(email.mailboxId);

  if (mailbox?.email.toLowerCase() === FROM_MAILBOX) return email.messageId;

  // Find Chi's copy via internet_message_id
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

// ── Email template ───────────────────────────────────────────────────────────

function renderSubmittedEmail(permit: SubmittedPermit, classification: PermitClassification) {
  if (!permit.project_name) throw new Error(`Permit ${permit.id} has no project_name`);
  if (!permit.company_name) throw new Error(`Permit ${permit.id} has no company_name`);

  const typeWord = { new: "application", revision: "revision", renewal: "renewal" }[classification];
  const facilityLine = permit.facility_id
    ? `${escapeHtml(permit.facility_id)}${classification !== "new" ? ` (${classification.charAt(0).toUpperCase() + classification.slice(1)})` : ""}`
    : `<span style="color:red">Pending</span>`;

  return wrapHtml(
    `<div>Team,</div>` +
    `<div><br></div>` +
    `<div>A dust permit ${typeWord} for <b>${escapeHtml(permit.company_name)}</b> on project "<b>${escapeHtml(permit.project_name)}</b>" has been submitted to Maricopa County (see attached).</div>` +
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
}

// ── Task ─────────────────────────────────────────────────────────────────────

export const dustPermitSubmittedClientNotification = schemaTask({
  id: "dust-permit-submitted-client-notification",
  maxDuration: 120,
  retry: { maxAttempts: 2 },
  schema: inputSchema,
  run: async (input) => {
    const { db } = await import("@lib/db/client");

    const { permitId } = await resolvePermitId(db, input);

    const permit = await db
      .query<SubmittedPermit, [string]>(
        `SELECT id, project_name, company_name, address, facility_id, previous_app_id, project_id, submitted_date
         FROM dust_permits_filed_by_desert_services WHERE id = $1`
      )
      .get(permitId);
    if (!permit) throw new Error(`Permit ${permitId} not found`);

    const classification = await classifyPermit(db, permit.submitted_date, permit.previous_app_id);

    // Find the client's thread to reply-all on
    const candidates = await findReplyCandidates(db, permitId, permit.project_name, permit.project_id);
    const route = selectReplyRoute(candidates, permitId, permit.project_name);

    const body = renderSubmittedEmail(permit, classification);
    const compose = createComposeClient();
    let draftId: string;

    if (route.mode === "reply-all" && route.replyToEmailId) {
      const messageId = await resolveChiMessageId(db, route.replyToEmailId);
      const replyDraft = await compose.createReplyAllDraft({ messageId, userId: FROM_MAILBOX });
      await compose.updateDraft({ body, bodyType: "html", draftId: replyDraft.id, userId: FROM_MAILBOX });
      draftId = replyDraft.id;
    } else {
      const draft = await compose.createDraft({
        body, bodyType: "html",
        subject: `Dust Permit Submitted — ${permit.project_name} (${permitId})`,
        to: [{ email: FROM_MAILBOX }],
        userId: FROM_MAILBOX,
      });
      draftId = draft.id;
    }

    // Attach logo
    await compose.addFileAttachment({ ...LOGO_ATTACHMENT, draftId, userId: FROM_MAILBOX });

    if (!input.draft) {
      await compose.sendDraft(draftId, FROM_MAILBOX);
    }

    return {
      draftId,
      mode: input.draft ? "draft" as const : "sent" as const,
      permitId,
      route: route.mode,
    };
  },
});
