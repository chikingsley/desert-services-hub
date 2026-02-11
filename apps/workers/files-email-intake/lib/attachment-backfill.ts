/**
 * Attachment Backfill — Process Unprocessed Email Attachments
 *
 * Finds attachments on project-linked emails that haven't been processed yet,
 * downloads them from Graph API, and runs them through the file analysis pipeline.
 *
 * Handles both initial backfill AND ongoing processing of new attachments.
 *
 * Processes 3 files concurrently per batch for faster throughput.
 * PDFs try fast Kreuzberg extraction first — only scanned PDFs fall back to OCR.
 */
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { GraphEmailClient } from "@email/client";
import { createGraphClient } from "@email/sync/config";
import { db } from "@lib/db/hub";
import { updateAttachmentExtraction } from "@lib/db/repositories/attachment";
import { processFilesIntake } from "@/apps/workers/contract-intake/lib/files-intake";

const LOG = "[attachment-backfill]";
const BACKFILL_DIR = "/app/data/backfill";
const CONCURRENCY = 3;

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
  if (SKIP_CONTENT_TYPES.has(ct)) {
    return true;
  }

  // Skip inline/signature images: small size OR matching name patterns
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
// Single Attachment Processing
// ============================================================================

type AttachmentOutcome =
  | { type: "skipped" }
  | { type: "succeeded" }
  | { type: "failed"; error: string };

async function processOneAttachment(
  att: UnprocessedAttachment,
  client: GraphEmailClient
): Promise<AttachmentOutcome> {
  // Check skip rules first (no download needed)
  if (shouldSkip(att)) {
    await updateAttachmentExtraction(att.attachment_id_pk, "skipped");
    return { type: "skipped" };
  }

  // File extension from attachment name
  const ext = att.name.includes(".")
    ? att.name.split(".").pop()?.toLowerCase()
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

  try {
    // Run through the file analysis pipeline (Kreuzberg-first for PDFs, OCR fallback)
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

    if (anySuccess) {
      await updateAttachmentExtraction(att.attachment_id_pk, "success");
      console.log(`${LOG}   OK: ${att.name} -> project #${att.project_id}`);
      return { type: "succeeded" };
    }

    const errMsg = results[0]?.error ?? "No document created";
    await updateAttachmentExtraction(
      att.attachment_id_pk,
      "failed",
      null,
      errMsg
    );
    return { type: "failed", error: `${att.name}: ${errMsg}` };
  } finally {
    // Clean up temp file
    try {
      await unlink(localPath);
    } catch {
      // Non-fatal
    }
  }
}

// ============================================================================
// Main — Concurrent Processing
// ============================================================================

export async function processUnprocessedAttachments(
  batchSize = 50
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

  console.log(
    `${LOG} Processing batch of ${attachments.length} attachments (concurrency: ${CONCURRENCY})`
  );

  await mkdir(BACKFILL_DIR, { recursive: true });

  // Single Graph client for the entire batch (token is cached internally)
  const client = createGraphClient();

  // Process in chunks of CONCURRENCY
  for (let i = 0; i < attachments.length; i += CONCURRENCY) {
    const chunk = attachments.slice(i, i + CONCURRENCY);

    const outcomes = await Promise.allSettled(
      chunk.map(async (att) => {
        try {
          return await processOneAttachment(att, client);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`${LOG}   FAIL: ${att.name}: ${msg}`);
          await updateAttachmentExtraction(
            att.attachment_id_pk,
            "failed",
            null,
            msg.slice(0, 1000)
          );
          return { type: "failed" as const, error: `${att.name}: ${msg}` };
        }
      })
    );

    for (const outcome of outcomes) {
      const o =
        outcome.status === "fulfilled"
          ? outcome.value
          : { type: "failed" as const, error: String(outcome.reason) };

      switch (o.type) {
        case "skipped":
          result.skipped++;
          break;
        case "succeeded":
          result.processed++;
          result.succeeded++;
          break;
        case "failed":
          result.processed++;
          result.failed++;
          result.errors.push(o.error);
          break;
        default:
          result.processed++;
          result.failed++;
          result.errors.push("Unknown outcome type");
          break;
      }
    }
  }

  console.log(
    `${LOG} Batch complete: ${result.processed} processed (${result.succeeded} ok, ${result.failed} failed), ${result.skipped} skipped`
  );

  return result;
}
