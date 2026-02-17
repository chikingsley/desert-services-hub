/**
 * Attachment Backfill — Process Unprocessed Email Attachments
 *
 * Downloads attachments from Graph API, deduplicates them, and runs them
 * through the Kreuzberg extraction pipeline.
 *
 * Dedup strategy (two layers):
 *   1. Internet Message ID — same email across mailboxes shares an
 *      internet_message_id; skip if same (internet_message_id, name, size)
 *      already processed. Zero network cost.
 *   2. Content Hash — SHA-256 of file bytes catches forwarded copies and
 *      renames. Computed after download but before extraction.
 *
 * Processes ALL mailboxes — no allowlist/blocklist scoping.
 */
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { GraphEmailClient } from "@email/client";
import { isSubjectCompatibleWithProject } from "@email/project-subject-guard";
import { createGraphClient } from "@email/sync/config";
import { db } from "@lib/db/hub";
import { updateAttachmentExtraction } from "@lib/db/repositories/attachment";
import { processFilesIntake } from "./files-intake";

const LOG = "[attachment-backfill]";
const BACKFILL_DIR = "/app/data/backfill";
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_COOLDOWN_HOURS = 6;
const DOWNLOAD_TIMEOUT_MS = 10_000; // 10s max per Graph API download

interface UnprocessedAttachment {
  attachment_id_pk: number;
  graph_attachment_id: string;
  name: string;
  content_type: string | null;
  size: number | null;
  email_id: number;
  message_id: string;
  internet_message_id: string | null;
  project_id: number | null;
  subject: string | null;
  from_email: string | null;
  mailbox_email: string;
}

export interface BackfillResult {
  processed: number;
  skipped: number;
  deduped: number;
  succeeded: number;
  failed: number;
  elapsedMs: number;
  attachmentsPerMinute: number;
  errors: string[];
}

export interface ProcessUnprocessedAttachmentsOptions {
  batchSize?: number;
  concurrency?: number;
}

/** Inline images, calendar invites, signatures — skip patterns */
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
    if (INLINE_IMAGE_PATTERNS.some((p) => p.test(att.name))) {
      return true;
    }
  }

  return false;
}

// Microsoft 365 Groups use /groups/{id}/messages — not /users/{email}/messages.
// The Graph client only supports /users/ paths, so group mailboxes must be excluded.
const GROUP_MAILBOXES = new Set(["internalcontracts@desertservices.net"]);

/**
 * Fetch unprocessed attachments — excludes M365 group mailboxes (unsupported Graph path).
 */
const getUnprocessedAttachments = db.query<UnprocessedAttachment, [number]>(`
  SELECT
    a.id as attachment_id_pk,
    a.attachment_id as graph_attachment_id,
    a.name,
    a.content_type,
    a.size,
    e.id as email_id,
    e.message_id,
    e.internet_message_id,
    e.project_id,
    e.subject,
    e.from_email,
    m.email as mailbox_email
  FROM attachments a
  JOIN emails e ON e.id = a.email_id
  JOIN mailboxes m ON m.id = e.mailbox_id
  LEFT JOIN documents d ON d.attachment_id = a.id AND d.extraction_status <> 'failed'
  WHERE (
      a.extraction_status IS NULL
      OR a.extraction_status = 'pending'
      OR (
        a.extraction_status = 'failed'
        AND a.extraction_attempts < ${MAX_RETRY_ATTEMPTS}
        AND (a.last_attempted_at IS NULL OR a.last_attempted_at < now() - interval '${RETRY_COOLDOWN_HOURS} hours')
      )
    )
    AND d.id IS NULL
    AND (e.classification IS NULL OR e.classification NOT IN ('SPAM', 'HR', 'IT'))
    AND m.email NOT IN (${[...GROUP_MAILBOXES].map((e) => `'${e}'`).join(", ")})
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

const deleteFailedDocumentsForAttachment = db.prepare(`
  DELETE FROM documents WHERE attachment_id = $1 AND extraction_status = 'failed'
`);

/**
 * Layer 1: Internet Message ID dedup.
 * Check if the same file (by name + size) on the same original email
 * (by internet_message_id) has already been processed in another mailbox.
 */
const checkInternetMessageIdDupe = db.query<
  { id: number },
  [string, string, number | null, number]
>(`
  SELECT a2.id
  FROM attachments a2
  JOIN emails e2 ON e2.id = a2.email_id
  WHERE e2.internet_message_id = $1
    AND a2.name = $2
    AND ($3 IS NULL OR a2.size = $3)
    AND a2.extraction_status IN ('success', 'deduped')
    AND a2.id <> $4
  LIMIT 1
`);

/**
 * Layer 2: Content hash dedup.
 * Check if any previously processed attachment has the same SHA-256 hash.
 */
const checkContentHashDupe = db.query<{ id: number }, [string, number]>(`
  SELECT a2.id
  FROM attachments a2
  WHERE a2.content_hash = $1
    AND a2.extraction_status IN ('success', 'deduped')
    AND a2.id <> $2
  LIMIT 1
`);

/**
 * Store content hash after download.
 */
const setContentHash = db.prepare(`
  UPDATE attachments SET content_hash = $2 WHERE id = $1
`);

async function markDeduped(attachmentPk: number): Promise<void> {
  await db.run(
    `UPDATE attachments
     SET extraction_status = 'deduped',
         extracted_at = now(),
         extraction_attempts = extraction_attempts + 1,
         last_attempted_at = now()
     WHERE id = ?`,
    [attachmentPk]
  );
}

function computeHash(buffer: Buffer): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(buffer);
  return hasher.digest("hex");
}

type AttachmentOutcome =
  | { type: "skipped" }
  | { type: "deduped" }
  | { type: "succeeded" }
  | { type: "failed"; error: string };

async function linkResultsToDocuments(
  results: Awaited<ReturnType<typeof processFilesIntake>>,
  att: UnprocessedAttachment
): Promise<{ anySuccess: boolean; projectLinkSkipped: boolean }> {
  let anySuccess = false;
  let projectLinkSkipped = false;

  for (const r of results) {
    if (!r.documentId) {
      continue;
    }

    let projectIdForDocument: number | null = att.project_id;
    if (projectIdForDocument !== null) {
      const compatible = await isSubjectCompatibleWithProject({
        projectId: projectIdForDocument,
        subject: att.subject ?? "",
      });
      if (!compatible) {
        projectIdForDocument = null;
        projectLinkSkipped = true;
      }
    }

    await updateDocumentBackfillLinks.run(
      r.documentId,
      att.email_id,
      att.attachment_id_pk,
      projectIdForDocument
    );
    anySuccess = true;
  }

  return { anySuccess, projectLinkSkipped };
}

async function processOneAttachment(
  att: UnprocessedAttachment,
  client: GraphEmailClient
): Promise<AttachmentOutcome> {
  // ---- Skip rules (inline images, calendars, etc.) ----
  if (shouldSkip(att)) {
    await updateAttachmentExtraction(att.attachment_id_pk, "skipped");
    return { type: "skipped" };
  }

  // ---- Layer 1: Internet Message ID dedup (before download) ----
  if (att.internet_message_id) {
    const dupe = await checkInternetMessageIdDupe.get(
      att.internet_message_id,
      att.name,
      att.size ?? null,
      att.attachment_id_pk
    );
    if (dupe) {
      await markDeduped(att.attachment_id_pk);
      return { type: "deduped" };
    }
  }

  // ---- Download from Graph API ----
  const ext = att.name.includes(".")
    ? att.name.split(".").pop()?.toLowerCase()
    : "bin";
  const localPath = join(
    BACKFILL_DIR,
    `${att.email_id}-${att.attachment_id_pk}.${ext}`
  );

  // Clean up stale failed document records from previous attempts
  await deleteFailedDocumentsForAttachment.run(att.attachment_id_pk);

  console.log(
    `${LOG}   Downloading: "${att.name}" (${att.content_type}, ${att.size ?? "?"} bytes) from ${att.mailbox_email}`
  );

  const buffer = await Promise.race([
    client.downloadAttachment(
      att.message_id,
      att.graph_attachment_id,
      att.mailbox_email
    ),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Download timed out")),
        DOWNLOAD_TIMEOUT_MS
      )
    ),
  ]);

  // ---- Layer 2: Content hash dedup (after download, before processing) ----
  const hash = computeHash(buffer);
  await setContentHash.run(att.attachment_id_pk, hash);

  const hashDupe = await checkContentHashDupe.get(hash, att.attachment_id_pk);
  if (hashDupe) {
    console.log(
      `${LOG}   Deduped (content hash): "${att.name}" matches attachment #${hashDupe.id}`
    );
    await markDeduped(att.attachment_id_pk);
    return { type: "deduped" };
  }

  // ---- Process through Kreuzberg pipeline ----
  await Bun.write(localPath, buffer);

  try {
    const results = await processFilesIntake({
      attachmentPaths: [localPath],
      originalSubject: att.subject ?? "",
      originalFrom: att.from_email ?? "",
      bodyText: "",
      forwarderEmail: att.mailbox_email,
    });

    const { anySuccess, projectLinkSkipped } = await linkResultsToDocuments(
      results,
      att
    );

    if (anySuccess) {
      await updateAttachmentExtraction(att.attachment_id_pk, "success");
      let projectSummary = "no project link";
      if (att.project_id !== null) {
        projectSummary = projectLinkSkipped
          ? "project link skipped by subject guard"
          : `project #${att.project_id}`;
      }
      console.log(`${LOG}   OK: ${att.name} -> ${projectSummary}`);
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
    try {
      await unlink(localPath);
    } catch {
      // Non-fatal
    }
  }
}

function tallyOutcome(
  outcome: PromiseSettledResult<AttachmentOutcome>,
  result: BackfillResult
): void {
  const o =
    outcome.status === "fulfilled"
      ? outcome.value
      : { type: "failed" as const, error: String(outcome.reason) };

  switch (o.type) {
    case "skipped":
      result.skipped++;
      break;
    case "deduped":
      result.deduped++;
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

export async function processUnprocessedAttachments(
  options: ProcessUnprocessedAttachmentsOptions = {}
): Promise<BackfillResult> {
  const startedAt = Date.now();
  const batchSize = Math.max(1, options.batchSize ?? 100);
  const concurrency = Math.max(1, options.concurrency ?? 10);

  const result: BackfillResult = {
    processed: 0,
    skipped: 0,
    deduped: 0,
    succeeded: 0,
    failed: 0,
    elapsedMs: 0,
    attachmentsPerMinute: 0,
    errors: [],
  };

  const attachments = await getUnprocessedAttachments.all(batchSize);

  if (attachments.length === 0) {
    result.elapsedMs = Date.now() - startedAt;
    return result;
  }

  console.log(
    `${LOG} Processing batch of ${attachments.length} attachments (concurrency: ${concurrency})`
  );

  await mkdir(BACKFILL_DIR, { recursive: true });
  const client = createGraphClient();

  for (let i = 0; i < attachments.length; i += concurrency) {
    const chunk = attachments.slice(i, i + concurrency);

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
      tallyOutcome(outcome, result);
    }
  }

  const total = result.processed + result.skipped + result.deduped;
  console.log(
    `${LOG} Batch complete: ${result.succeeded} ok, ${result.failed} failed, ${result.deduped} deduped, ${result.skipped} skipped (${total} total)`
  );

  result.elapsedMs = Date.now() - startedAt;
  result.attachmentsPerMinute =
    result.elapsedMs > 0 ? (total / result.elapsedMs) * 60_000 : total;

  return result;
}
