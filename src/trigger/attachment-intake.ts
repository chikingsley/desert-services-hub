/**
 * Attachment Intake — Trigger.dev scheduled task
 *
 * Processes pending email attachment documents:
 *   1. Fetch pending stubs from documents table (source='email_attachment')
 *   2. Download content from Microsoft Graph API
 *   3. Deduplicate by internet_message_id + SHA256 content hash
 *   4. Extract text via processFilesIntake (pdf-analysis service)
 *   5. Link extracted documents back to email/project
 *   6. Update extraction status
 *
 * Stubs are created by the email-sync task when it detects hasAttachments.
 * This task runs on a 5-minute schedule to process the backlog.
 */

import { unlink } from "node:fs/promises";
import { shouldSkipAttachment } from "@documents-intake/attachment-policy";
import { processFilesIntake } from "@documents-intake/files-intake";
import { updateAttachmentExtraction } from "@lib/db/repositories/attachment";
import {
  deleteFailedParsedDocs,
  findContentHashAttachmentDuplicate,
  findInternetMessageAttachmentDuplicate,
  getIntakeAttachmentRows,
  type IntakeAttachmentRow,
  markAttachmentDeduped,
  setAttachmentContentHash,
  updateDocumentBackfillLinks,
} from "@lib/db/repositories/intake-attachments";
import { logger, schedules } from "@trigger.dev/sdk/v3";
import { graphGet, graphGetBinary } from "./graph";

const BATCH_SIZE = 50;
const DOWNLOAD_TIMEOUT_MS = 30_000;

// ── Graph API attachment download ───────────────────────────────

async function downloadAttachment(
  mailboxEmail: string,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const userPath = encodeURIComponent(mailboxEmail);
  const msgPath = encodeURIComponent(messageId);
  const attPath = encodeURIComponent(attachmentId);

  // Standard endpoint returns JSON with base64 contentBytes
  const att = await graphGet<{ contentBytes?: string }>(
    `users/${userPath}/messages/${msgPath}/attachments/${attPath}`
  );

  if (att.contentBytes) {
    return Buffer.from(att.contentBytes, "base64");
  }

  // Fallback: $value endpoint returns raw binary (large attachments)
  return graphGetBinary(
    `users/${userPath}/messages/${msgPath}/attachments/${attPath}/$value`
  );
}

function computeHash(buffer: Buffer): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(buffer);
  return hasher.digest("hex");
}

function getExtension(filename: string): string {
  if (!filename.includes(".")) {
    return "bin";
  }
  return filename.split(".").pop()?.toLowerCase() ?? "bin";
}

// ── Process one attachment ──────────────────────────────────────

type Outcome = "extracted" | "skipped" | "deduped" | "failed";

async function processOne(att: IntakeAttachmentRow): Promise<Outcome> {
  // 1. Skip non-processable content types and likely inline images
  if (
    shouldSkipAttachment({
      contentType: att.content_type,
      fileName: att.name,
      size: att.size,
    })
  ) {
    await updateAttachmentExtraction(att.attachment_id_pk, "skipped");
    return "skipped";
  }

  // 2. Check internet_message_id dedup (same email forwarded to multiple mailboxes)
  if (att.internet_message_id) {
    const dupe = await findInternetMessageAttachmentDuplicate(
      att.internet_message_id,
      att.name,
      att.size ?? null,
      att.attachment_id_pk
    );
    if (dupe) {
      await markAttachmentDeduped(att.attachment_id_pk);
      return "deduped";
    }
  }

  // 3. Need Graph API coordinates to download
  if (!(att.message_id && att.graph_attachment_id && att.mailbox_email)) {
    await updateAttachmentExtraction(
      att.attachment_id_pk,
      "failed",
      null,
      "Missing message_id, graph_attachment_id, or mailbox_email for download"
    );
    return "failed";
  }

  // 4. Clean up any previously failed parsed docs for this attachment
  if (att.email_id && att.graph_attachment_id) {
    await deleteFailedParsedDocs(att.email_id, att.graph_attachment_id);
  }

  // 5. Download from Graph API with timeout
  const buffer = await Promise.race([
    downloadAttachment(
      att.mailbox_email,
      att.message_id,
      att.graph_attachment_id
    ),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Download timed out")),
        DOWNLOAD_TIMEOUT_MS
      )
    ),
  ]);

  // 6. Content hash dedup
  const hash = computeHash(buffer);
  await setAttachmentContentHash(att.attachment_id_pk, hash);

  const hashDupe = await findContentHashAttachmentDuplicate(
    hash,
    att.attachment_id_pk
  );
  if (hashDupe) {
    await markAttachmentDeduped(att.attachment_id_pk);
    return "deduped";
  }

  // 7. Write to temp file and extract
  const ext = getExtension(att.name);
  const tmpPath = `/tmp/att-intake-${att.attachment_id_pk}.${ext}`;
  await Bun.write(tmpPath, buffer);

  try {
    const results = await processFilesIntake({
      attachmentPaths: [tmpPath],
      originalSubject: att.subject ?? "",
      originalFrom: att.from_email ?? "",
      bodyText: "",
      forwarderEmail: att.mailbox_email ?? "",
    });

    // 8. Link extracted documents back to email/project
    let anySuccess = false;
    for (const r of results) {
      if (r.documentId) {
        await updateDocumentBackfillLinks(
          r.documentId,
          att.email_id,
          att.graph_attachment_id,
          att.project_id
        );
        anySuccess = true;
      }
    }

    if (anySuccess) {
      await updateAttachmentExtraction(att.attachment_id_pk, "success");
      return "extracted";
    }

    const errMsg = results[0]?.error ?? "No document created";
    await updateAttachmentExtraction(
      att.attachment_id_pk,
      "failed",
      null,
      errMsg
    );
    return "failed";
  } finally {
    try {
      await unlink(tmpPath);
    } catch {
      // Non-fatal cleanup failure.
    }
  }
}

// ── Task ────────────────────────────────────────────────────────

export const attachmentIntake = schedules.task({
  id: "attachment-intake",
  cron: "*/5 * * * *",
  maxDuration: 300,
  run: async () => {
    const attachments = await getIntakeAttachmentRows(BATCH_SIZE);
    if (attachments.length === 0) {
      return { processed: 0, extracted: 0, skipped: 0, deduped: 0, failed: 0 };
    }

    logger.info("Processing attachments", { count: attachments.length });

    const counts = { extracted: 0, skipped: 0, deduped: 0, failed: 0 };

    for (const att of attachments) {
      try {
        const outcome = await processOne(att);
        counts[outcome]++;

        logger.info("Attachment processed", {
          id: att.attachment_id_pk,
          name: att.name,
          outcome,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn("Attachment processing failed", {
          id: att.attachment_id_pk,
          name: att.name,
          error: msg,
        });
        await updateAttachmentExtraction(
          att.attachment_id_pk,
          "failed",
          null,
          msg.slice(0, 1000)
        );
        counts.failed++;
      }
    }

    const processed =
      counts.extracted + counts.skipped + counts.deduped + counts.failed;
    logger.info("Attachment intake complete", { processed, ...counts });

    return { processed, ...counts };
  },
});
