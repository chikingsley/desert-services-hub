/**
 * Attachment Backfill — Process Unprocessed Email Attachments
 *
 * Finds attachments on project-linked emails that haven't been processed yet,
 * downloads them from Graph API, and runs them through the file analysis pipeline.
 *
 * Handles both initial backfill (clearing ~1,500 unprocessed attachments) AND
 * ongoing processing (new attachments from folder-watcher-linked emails).
 *
 * Timer-based: runs every 2 minutes with a batch of 20 attachments.
 */
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createGraphClient } from "@email/sync/config";
import { db } from "@lib/db/hub";
import { updateAttachmentExtraction } from "@lib/db/repositories/attachment";
import { processFilesIntake } from "@/apps/workers/contract-intake/lib/files-intake";

const LOG = "[attachment-backfill]";
const BACKFILL_DIR = "/app/data/backfill";

// ============================================================================
// Types
// ============================================================================

interface UnprocessedAttachment {
  attachment_id_pk: number;
  graph_attachment_id: string;
  name: string;
  content_type: string | null;
  size: number | null;
  email_id: number;
  message_id: string;
  project_id: number;
  subject: string | null;
  from_email: string | null;
  mailbox_email: string;
}

export interface BackfillResult {
  processed: number;
  skipped: number;
  succeeded: number;
  failed: number;
  errors: string[];
}

// ============================================================================
// Skip Rules — inline images, calendar invites, signatures
// ============================================================================

const INLINE_IMAGE_PATTERNS = [
  /^image\d{3}\./i, // image001.png, image002.jpg
  /^Outlook-/i, // Outlook-abc123.png
  /logo/i, // anything with "logo"
  /^icon/i, // icon files
  /^spacer\./i, // spacer.gif
];

const SKIP_CONTENT_TYPES = new Set([
  "text/calendar",
  "application/x-ms-wmz",
  "message/rfc822",
  "application/ics",
  "application/pkcs7-signature",
  "application/x-pkcs7-signature",
]);

function shouldSkip(att: UnprocessedAttachment): boolean {
  const ct = att.content_type?.toLowerCase() ?? "";

  // Skip non-processable types (calendar invites, signatures, embedded emails)
  if (SKIP_CONTENT_TYPES.has(ct)) return true;

  // Skip inline/signature images: small size OR matching name patterns
  if (ct.startsWith("image/")) {
    if ((att.size ?? 0) < 50_000) return true;
    for (const pattern of INLINE_IMAGE_PATTERNS) {
      if (pattern.test(att.name)) return true;
    }
  }

  return false;
}

// ============================================================================
// Queries
// ============================================================================

const getUnprocessedAttachments = db.query<UnprocessedAttachment, [number]>(`
  SELECT
    a.id as attachment_id_pk,
    a.attachment_id as graph_attachment_id,
    a.name,
    a.content_type,
    a.size,
    e.id as email_id,
    e.message_id,
    e.project_id,
    e.subject,
    e.from_email,
    m.email as mailbox_email
  FROM attachments a
  JOIN emails e ON e.id = a.email_id
  JOIN mailboxes m ON m.id = e.mailbox_id
  LEFT JOIN documents d ON d.attachment_id = a.id
  WHERE e.project_id IS NOT NULL
    AND (a.extraction_status IS NULL OR a.extraction_status = 'pending')
    AND d.id IS NULL
  ORDER BY e.received_at DESC
  LIMIT $1
`);

const updateDocumentBackfillLinks = db.prepare(`
  UPDATE documents
  SET email_id = $2,
      attachment_id = $3,
      project_id = $4
  WHERE id = $1
`);

// ============================================================================
// Main
// ============================================================================

export async function processUnprocessedAttachments(
  batchSize = 20
): Promise<BackfillResult> {
  const result: BackfillResult = {
    processed: 0,
    skipped: 0,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  const attachments = await getUnprocessedAttachments.all(batchSize);

  if (attachments.length === 0) {
    return result;
  }

  console.log(`${LOG} Processing batch of ${attachments.length} attachments`);

  await mkdir(BACKFILL_DIR, { recursive: true });

  // Single Graph client for the entire batch (token is cached internally)
  const client = createGraphClient();

  for (const att of attachments) {
    try {
      // Check skip rules first (no download needed)
      if (shouldSkip(att)) {
        await updateAttachmentExtraction(att.attachment_id_pk, "skipped");
        result.skipped++;
        continue;
      }

      result.processed++;

      // File extension from attachment name
      const ext = att.name.includes(".")
        ? att.name.split(".").pop()!.toLowerCase()
        : "bin";
      const localPath = join(
        BACKFILL_DIR,
        `${att.email_id}-${att.attachment_id_pk}.${ext}`
      );

      // Download from Graph API
      console.log(
        `${LOG}   Downloading: "${att.name}" (${att.content_type}, ${att.size ?? "?"} bytes) from ${att.mailbox_email}`
      );

      const buffer = await client.downloadAttachment(
        att.message_id,
        att.graph_attachment_id,
        att.mailbox_email
      );

      await Bun.write(localPath, buffer);

      // Run through the file analysis pipeline (PDF parse, image OCR, etc.)
      const results = await processFilesIntake({
        attachmentPaths: [localPath],
        originalSubject: att.subject ?? "",
        originalFrom: att.from_email ?? "",
        bodyText: "",
        forwarderEmail: att.mailbox_email,
      });

      // Link document records to email, attachment, and project
      let anySuccess = false;
      for (const r of results) {
        if (r.documentId) {
          await updateDocumentBackfillLinks.run(
            r.documentId,
            att.email_id,
            att.attachment_id_pk,
            att.project_id
          );
          anySuccess = true;
        }
      }

      // Update attachment extraction status
      if (anySuccess) {
        await updateAttachmentExtraction(att.attachment_id_pk, "success");
        result.succeeded++;
        console.log(
          `${LOG}   OK: ${att.name} -> project #${att.project_id}`
        );
      } else {
        const errMsg = results[0]?.error ?? "No document created";
        await updateAttachmentExtraction(
          att.attachment_id_pk,
          "failed",
          null,
          errMsg
        );
        result.failed++;
        result.errors.push(`${att.name}: ${errMsg}`);
      }

      // Clean up temp file
      try {
        await unlink(localPath);
      } catch {
        // Non-fatal
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${LOG}   FAIL: ${att.name}: ${msg}`);

      await updateAttachmentExtraction(
        att.attachment_id_pk,
        "failed",
        null,
        msg.slice(0, 1000)
      );
      result.failed++;
      result.errors.push(`${att.name}: ${msg}`);
    }
  }

  console.log(
    `${LOG} Batch complete: ${result.processed} processed (${result.succeeded} ok, ${result.failed} failed), ${result.skipped} skipped`
  );

  return result;
}
