/**
 * Contract Email Handler
 *
 * When a contract email lands in contracts@desertservices.net:
 *   1. Classify the email as CONTRACT (mailbox_rule)
 *   2. Download attachments from Graph API and process through intake pipeline
 *
 * Reuses the attachment processing pattern from attachment-backfill.ts.
 */

import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { enrichContractDocumentsWithLangExtract } from "@background-jobs/lib/contracts/langextract";
import { propagateDocumentProjectIds } from "@background-jobs/lib/documents/propagate-project-ids";
import { processFilesIntake } from "@background-jobs/lib/intake/files-intake";
import type { ContractEmailJobPayload } from "@background-jobs/lib/notifications/email-triggers";
import type { GraphEmailClient } from "@email/client";
import { createGraphClient } from "@email/sync/config";
import { db } from "@lib/db/hub";
import { updateAttachmentExtraction } from "@lib/db/repositories/attachment";

const LOG = "[contract-email]";
const WORK_DIR = "/app/data/contract-intake";

// ============================================================================
// Skip rules — same as attachment-backfill
// ============================================================================

const INLINE_IMAGE_PATTERNS = [
  /^image\d{3}\./i,
  /^Outlook-/i,
  /logo/i,
  /^icon/i,
  /^spacer\./i,
];

const SKIP_CONTENT_TYPES = new Set([
  "text/calendar",
  "application/x-ms-wmz",
  "message/rfc822",
  "application/ics",
  "application/pkcs7-signature",
  "application/x-pkcs7-signature",
]);

interface AttachmentRow {
  id: number;
  attachment_id: string;
  name: string;
  content_type: string | null;
  size: number | null;
}

function shouldSkip(att: AttachmentRow): boolean {
  const ct = att.content_type?.toLowerCase() ?? "";

  if (SKIP_CONTENT_TYPES.has(ct)) {
    return true;
  }

  if (ct.startsWith("image/")) {
    if ((att.size ?? 0) < 50_000) {
      return true;
    }
    for (const pattern of INLINE_IMAGE_PATTERNS) {
      if (pattern.test(att.name)) {
        return true;
      }
    }
  }

  return false;
}

// ============================================================================
// Queries
// ============================================================================

const classifyEmail = db.prepare(`
  UPDATE emails
  SET classification = 'CONTRACT',
      classification_method = 'mailbox_rule',
      classification_confidence = 1.0
  WHERE id = $1
    AND classification IS NULL
`);

const getAttachmentsForEmail = db.query<AttachmentRow, [number]>(`
  SELECT id, attachment_id, name, content_type, size
  FROM attachments
  WHERE email_id = $1
  ORDER BY name
`);

const updateDocumentLinks = db.prepare(`
  UPDATE documents
  SET email_id = $2,
      attachment_id = $3
  WHERE id = $1
`);

const listDocumentIdsByAttachment = db.query<{ id: number }, [number]>(
  `SELECT id
   FROM documents
   WHERE attachment_id = $1
   ORDER BY id DESC`
);

// ============================================================================
// Single Attachment Processing
// ============================================================================

interface AttachmentContext {
  emailId: number;
  messageId: string;
  mailboxEmail: string;
  subject: string;
  fromEmail: string;
}

async function processOneContractAttachment(
  att: AttachmentRow,
  client: GraphEmailClient,
  ctx: AttachmentContext
): Promise<{ status: "succeeded" | "failed"; documentIds: number[] }> {
  const ext = att.name.includes(".")
    ? att.name.split(".").pop()?.toLowerCase()
    : "bin";
  const localPath = join(WORK_DIR, `${ctx.emailId}-${att.id}.${ext}`);

  console.log(
    `${LOG}   Downloading: "${att.name}" (${att.content_type}, ${att.size ?? "?"} bytes)`
  );

  const buffer = await client.downloadAttachment(
    ctx.messageId,
    att.attachment_id,
    ctx.mailboxEmail
  );
  await Bun.write(localPath, buffer);

  try {
    const results = await processFilesIntake({
      attachmentPaths: [localPath],
      originalSubject: ctx.subject,
      originalFrom: ctx.fromEmail,
      bodyText: "",
      forwarderEmail: ctx.mailboxEmail,
    });

    let anySuccess = false;
    for (const r of results) {
      if (r.documentId) {
        await updateDocumentLinks.run(r.documentId, ctx.emailId, att.id);
        anySuccess = true;
      }
    }

    if (anySuccess) {
      await updateAttachmentExtraction(att.id, "success");
      const docs = await listDocumentIdsByAttachment.all(att.id);
      console.log(`${LOG}   OK: ${att.name}`);
      return {
        status: "succeeded",
        documentIds: docs.map((doc) => doc.id),
      };
    }

    const errMsg = results[0]?.error ?? "No document created";
    await updateAttachmentExtraction(att.id, "failed", null, errMsg);
    console.error(`${LOG}   FAIL: ${att.name}: ${errMsg}`);
    return { status: "failed", documentIds: [] };
  } finally {
    try {
      await unlink(localPath);
    } catch {
      // Non-fatal cleanup
    }
  }
}

// ============================================================================
// Main Handler
// ============================================================================

export async function processContractEmailJob(
  payload: ContractEmailJobPayload
): Promise<void> {
  const {
    emailId,
    messageId,
    mailboxEmail,
    subject,
    fromEmail,
    hasAttachments,
  } = payload;

  console.log(
    `${LOG} Processing contract email #${emailId}: "${subject}" from ${fromEmail}`
  );

  // Step 1: Classify as CONTRACT
  await classifyEmail.run(emailId);
  console.log(`${LOG}   Classified email #${emailId} as CONTRACT`);

  // Step 2: Process attachments (if any)
  if (!hasAttachments) {
    console.log(`${LOG}   No attachments — done`);
    return;
  }

  const attachments = await getAttachmentsForEmail.all(emailId);
  const processable = attachments.filter((att) => !shouldSkip(att));

  if (processable.length === 0) {
    console.log(
      `${LOG}   ${attachments.length} attachment(s) all skipped (inline images/calendar)`
    );
    for (const att of attachments) {
      await updateAttachmentExtraction(att.id, "skipped");
    }
    return;
  }

  console.log(
    `${LOG}   Processing ${processable.length}/${attachments.length} attachment(s)`
  );

  await mkdir(WORK_DIR, { recursive: true });
  const client = createGraphClient();
  const ctx: AttachmentContext = {
    emailId,
    messageId,
    mailboxEmail,
    subject,
    fromEmail,
  };

  let succeeded = 0;
  let failed = 0;
  const createdDocumentIds: number[] = [];

  for (const att of attachments) {
    if (shouldSkip(att)) {
      await updateAttachmentExtraction(att.id, "skipped");
      continue;
    }

    try {
      const outcome = await processOneContractAttachment(att, client, ctx);
      if (outcome.status === "succeeded") {
        succeeded++;
        createdDocumentIds.push(...outcome.documentIds);
      } else {
        failed++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${LOG}   FAIL: ${att.name}: ${msg}`);
      await updateAttachmentExtraction(
        att.id,
        "failed",
        null,
        msg.slice(0, 1000)
      );
      failed++;
    }
  }

  console.log(
    `${LOG}   Done: ${succeeded} succeeded, ${failed} failed out of ${processable.length} processable`
  );

  if (createdDocumentIds.length > 0) {
    await enrichContractDocumentsWithLangExtract(createdDocumentIds);
    await propagateDocumentProjectIds();
  }
}
