/**
 * Contract Email Handler
 *
 * When a contract email lands in contracts@desertservices.net:
 *   1. Classify the email as CONTRACT (mailbox_rule)
 *   2. Download attachments from Graph API and process through intake pipeline
 *
 * Reuses the attachment processing pattern from intake-attachments-runner.ts.
 */

import { existsSync } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { shouldSkipAttachment } from "@documents-intake/attachment-policy";
import { updateAttachmentExtraction } from "@documents-intake/db/attachment";
import { propagateMissingDocumentProjectIds } from "@documents-intake/db/intake-document";
import { processFilesIntake } from "@documents-intake/files-intake";
import { db } from "@lib/db/client";
import { createGraphClient, type GraphEmailClient } from "@lib/graph/mail";
import type {
  ContractAttachmentContext,
  ContractAttachmentRow,
  ContractEmailJobPayload,
} from "./types";

const LOG = "[contract-email]";
const WORK_DIR = "/app/data/contract-intake";

// ============================================================================
// Skip rules — same as intake-attachments-runner
// ============================================================================

function shouldSkip(att: ContractAttachmentRow): boolean {
  return shouldSkipAttachment({
    contentType: att.content_type,
    fileName: att.name,
    size: att.size,
  });
}

// ============================================================================
// Queries
// ============================================================================

const classifyEmail = db.query(`
  UPDATE emails
  SET classification = 'CONTRACT',
      classification_method = 'mailbox_rule',
      classification_confidence = 1.0
  WHERE id = $1
    AND classification IS NULL
`);

const getAttachmentsForEmail = db.query<ContractAttachmentRow, [number]>(`
  SELECT id,
         outlook_attachment_id AS attachment_id,
         file_name AS name,
         content_type,
         file_size AS size,
         storage_path
  FROM documents
  WHERE source = 'email_attachment'
    AND email_id = $1
  ORDER BY file_name
`);

const updateDocumentLinks = db.query(`
  UPDATE documents
  SET email_id = $2,
      outlook_attachment_id = $3,
      updated_at = now()
  WHERE id = $1
`);

const listDocumentIdsByAttachment = db.query<{ id: number }, [string]>(
  `SELECT id
   FROM documents
   WHERE outlook_attachment_id = $1
     AND source = 'parsed'
   ORDER BY id DESC`
);

// ============================================================================
// Single Attachment Processing
// ============================================================================

async function downloadContractAttachmentBytes(
  att: ContractAttachmentRow,
  client: GraphEmailClient,
  ctx: ContractAttachmentContext
): Promise<Buffer> {
  if (att.storage_path && existsSync(att.storage_path)) {
    const local = await Bun.file(att.storage_path).arrayBuffer();
    return Buffer.from(local);
  }

  return await client.downloadAttachment(
    ctx.messageId,
    att.attachment_id,
    ctx.mailboxEmail
  );
}

async function processOneContractAttachment(
  att: ContractAttachmentRow,
  client: GraphEmailClient,
  ctx: ContractAttachmentContext
): Promise<{ status: "succeeded" | "failed"; documentIds: number[] }> {
  const ext = att.name.includes(".")
    ? att.name.split(".").pop()?.toLowerCase()
    : "bin";
  const localPath = join(WORK_DIR, `${ctx.emailId}-${att.id}.${ext}`);

  console.log(
    `${LOG}   Downloading: "${att.name}" (${att.content_type}, ${att.size ?? "?"} bytes)`
  );

  const buffer = await downloadContractAttachmentBytes(att, client, ctx);
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
        await updateDocumentLinks.run(
          r.documentId,
          ctx.emailId,
          att.attachment_id
        );
        anySuccess = true;
      }
    }

    if (anySuccess) {
      await updateAttachmentExtraction(att.id, "success");
      const docs = await listDocumentIdsByAttachment.all(att.attachment_id);
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
  const ctx: ContractAttachmentContext = {
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
    await propagateMissingDocumentProjectIds();
  }
}
