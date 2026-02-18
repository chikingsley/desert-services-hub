import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { GraphEmailClient } from "@email/client";
import type { GraphGroupsClient } from "@email/groups";
import { isSubjectCompatibleWithProject } from "@email/project-subject-guard";
import { createGraphClient } from "@email/sync/config";
import { createGroupsClient } from "@email/sync/groups-core/sync-group";
import { db } from "@lib/db/hub";
import { updateAttachmentExtraction } from "@lib/db/repositories/attachment";
import { COLUMN_HINTS } from "@monday/sync/pipeline-config";
import { processFilesIntake } from "./files-intake";
import {
  extractWithKreuzberg,
  MIN_KREUZBERG_TEXT_LENGTH,
  ocrWithPdfAnalysisService,
} from "./files-intake-db";
import {
  classifyDocument,
  runContractExtraction,
  runEstimateExtraction,
  runPermitExtraction,
} from "./files-intake-processors";

const LOG = "[attachment-backfill]";
const BACKFILL_DIR = "/app/data/backfill";
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_COOLDOWN_HOURS = 6;
const DOWNLOAD_TIMEOUT_MS = 10_000; // 10s max per Graph API download

interface UnprocessedAttachment {
  attachment_id_pk: number;
  graph_attachment_id: string | null;
  name: string;
  content_type: string | null;
  size: number | null;
  source: string;
  email_id: number | null;
  message_id: string | null;
  internet_message_id: string | null;
  thread_id: string | null;
  conversation_id: string | null;
  project_id: number | null;
  subject: string | null;
  from_email: string | null;
  mailbox_email: string | null;
  monday_column_id: string | null;
  estimate_id: number | null;
  local_path: string | null;
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

/** Non-processable content types — calendar invites, embedded emails, crypto sigs */
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
  return SKIP_CONTENT_TYPES.has(ct);
}

const IC_GROUP_EMAIL = "internalcontracts@desertservices.net";
const IC_GROUP_ID = "962f9440-9bde-4178-b538-edc7f8d3ecce";

/**
 * Fetch unprocessed documents from all sources (email_attachment + monday_asset).
 * The document's own extraction_status tracks processing state.
 * emails/mailboxes are LEFT JOINed since monday_asset rows have no email_id.
 */
const getUnprocessedAttachments = db.query<UnprocessedAttachment, [number]>(`
  SELECT
    d.id as attachment_id_pk,
    d.outlook_attachment_id as graph_attachment_id,
    d.file_name as name,
    d.content_type,
    d.file_size as size,
    d.source,
    d.monday_column_id,
    d.estimate_id,
    d.local_path,
    e.id as email_id,
    e.message_id,
    e.internet_message_id,
    e.project_id,
    e.subject,
    e.from_email,
    e.thread_id,
    e.conversation_id,
    m.email as mailbox_email
  FROM documents d
  LEFT JOIN emails e ON e.id = d.email_id
  LEFT JOIN mailboxes m ON m.id = e.mailbox_id
  WHERE d.source IN ('email_attachment', 'monday_asset')
    AND (
      d.extraction_status IS NULL
      OR d.extraction_status = 'pending'
      OR d.extraction_status = 'downloaded'
      OR (
        d.extraction_status = 'failed'
        AND d.extraction_attempts < ${MAX_RETRY_ATTEMPTS}
        AND (d.last_attempted_at IS NULL OR d.last_attempted_at < now() - interval '${RETRY_COOLDOWN_HOURS} hours')
      )
    )
    AND (d.email_id IS NULL OR e.classification IS NULL OR e.classification NOT IN ('SPAM', 'HR', 'IT'))
  ORDER BY d.created_at DESC
  LIMIT $1
`);

const updateDocumentBackfillLinks = db.prepare(`
  UPDATE documents
  SET email_id = $2,
      outlook_attachment_id = $3,
      project_id = $4,
      updated_at = now()
  WHERE id = $1
`);

const deleteFailedParsedDocs = db.prepare(`
  DELETE FROM documents
  WHERE source = 'parsed'
    AND email_id = $1
    AND outlook_attachment_id = $2
    AND extraction_status = 'failed'
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
  SELECT d2.id
  FROM documents d2
  JOIN emails e2 ON e2.id = d2.email_id
  WHERE d2.source = 'email_attachment'
    AND e2.internet_message_id = $1
    AND d2.file_name = $2
    AND ($3 IS NULL OR d2.file_size = $3)
    AND d2.extraction_status IN ('success', 'deduped')
    AND d2.id <> $4
  LIMIT 1
`);

/**
 * Layer 2: Content hash dedup.
 * Check if any previously processed document has the same SHA-256 hash.
 */
const checkContentHashDupe = db.query<{ id: number }, [string, number]>(`
  SELECT d2.id
  FROM documents d2
  WHERE d2.source = 'email_attachment'
    AND d2.content_hash = $1
    AND d2.extraction_status IN ('success', 'deduped')
    AND d2.id <> $2
  LIMIT 1
`);

/**
 * Store content hash after download.
 */
const setContentHash = db.prepare(`
  UPDATE documents SET content_hash = $2, updated_at = now() WHERE id = $1
`);

async function markDeduped(attachmentPk: number): Promise<void> {
  await db.run(
    `UPDATE documents
     SET extraction_status = 'deduped',
         extracted_at = now(),
         extraction_attempts = extraction_attempts + 1,
         last_attempted_at = now(),
         updated_at = now()
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
      att.graph_attachment_id,
      projectIdForDocument
    );
    anySuccess = true;
  }

  return { anySuccess, projectLinkSkipped };
}

/**
 * Download an attachment from an M365 Group post.
 *
 * The stored `emails.thread_id` is in the wrong Exchange-style format and
 * cannot be used directly with the Graph groups API. We always resolve the
 * real thread ID via getConversationThreads, then fetch post attachments
 * inline (same approach the sync code uses) to avoid a separate
 * /attachments/{id} endpoint that returns 403.
 */
async function downloadGroupAttachment(
  att: UnprocessedAttachment,
  groupClient: GraphGroupsClient
): Promise<Buffer> {
  if (!att.conversation_id) {
    throw new Error("No conversation_id for group attachment");
  }

  // Always resolve the real Graph API thread ID from the conversation
  const threads = await groupClient.getConversationThreads(
    IC_GROUP_ID,
    att.conversation_id
  );
  if (threads.length === 0) {
    throw new Error("No threads found for group conversation");
  }

  // Search all threads for the post matching att.message_id
  for (const thread of threads) {
    const posts = await groupClient.getThreadPosts(
      IC_GROUP_ID,
      thread.id,
      true
    );
    const post = posts.find((p) => p.id === att.message_id);
    if (!post) {
      continue;
    }
    const attachment = post.attachments?.find(
      (a) => a.id === att.graph_attachment_id
    );
    if (!attachment?.contentBytes) {
      throw new Error("Group attachment has no content bytes");
    }
    return Buffer.from(attachment.contentBytes, "base64");
  }

  throw new Error(
    `Post ${att.message_id} not found in any thread of conversation ${att.conversation_id}`
  );
}

/**
 * Dispatch Stage 2 structured extraction based on document type.
 * Non-throwing — logs errors but never fails the overall processing.
 */
async function dispatchStage2(
  documentId: number,
  documentType: string,
  text: string,
  estimateId: number | null
): Promise<void> {
  switch (documentType) {
    case "estimate":
      if (estimateId) {
        await runEstimateExtraction(documentId, estimateId, text);
      }
      break;
    case "contract":
      await runContractExtraction(documentId, text);
      break;
    case "noi":
    case "permit":
      await runPermitExtraction(documentId, text);
      break;
  }
}

/**
 * Process a Monday asset document: read from local_path, extract text,
 * classify, and run Stage 2 extraction. Writes directly to the documents row.
 */
async function processMondayAsset(
  att: UnprocessedAttachment
): Promise<AttachmentOutcome> {
  const { existsSync } = await import("node:fs");
  const columnHint = att.monday_column_id
    ? (COLUMN_HINTS[att.monday_column_id] ?? undefined)
    : undefined;

  // Find the file to process
  const filePath = att.local_path;
  if (!(filePath && existsSync(filePath))) {
    const errMsg = `Monday asset file not found: ${filePath ?? "no local_path"}`;
    await updateAttachmentExtraction(
      att.attachment_id_pk,
      "failed",
      null,
      errMsg
    );
    return { type: "failed", error: `${att.name}: ${errMsg}` };
  }

  console.log(
    `${LOG}   Monday asset: "${att.name}" (column: ${att.monday_column_id}, hint: ${columnHint ?? "none"})`
  );

  // Content hash dedup
  const fileBuffer = await Bun.file(filePath).arrayBuffer();
  const hash = computeHash(Buffer.from(fileBuffer));
  await setContentHash.run(att.attachment_id_pk, hash);

  const hashDupe = await checkContentHashDupe.get(hash, att.attachment_id_pk);
  if (hashDupe) {
    console.log(
      `${LOG}   Deduped (content hash): "${att.name}" matches document #${hashDupe.id}`
    );
    await markDeduped(att.attachment_id_pk);
    return { type: "deduped" };
  }

  // Extract text via Kreuzberg
  const extracted = await extractWithKreuzberg(filePath, {
    minTextLength: MIN_KREUZBERG_TEXT_LENGTH,
  });

  let finalContent = extracted.content;
  let finalExtractor = extracted.extractor;

  // OCR fallback for sparse text
  if (finalContent.length < MIN_KREUZBERG_TEXT_LENGTH) {
    const ocrText = await ocrWithPdfAnalysisService(filePath);
    if (ocrText.length > finalContent.length) {
      finalContent = ocrText;
      finalExtractor = "pdf-analysis:ocr";
    }
  }

  // Stage 1: Classify
  const classified = await classifyDocument(finalContent, att.name, columnHint);
  const documentType =
    classified.document_type !== "unknown"
      ? classified.document_type
      : (columnHint ?? "unknown");
  console.log(
    `${LOG}   Classified "${att.name}" as ${documentType} (${(classified.confidence * 100).toFixed(0)}%)`
  );

  // Update the documents row in-place (monday_asset row already exists)
  await db.run(
    `UPDATE documents
     SET document_type = $2,
         summary = $3,
         extraction_status = 'success',
         extraction_attempts = extraction_attempts + 1,
         last_attempted_at = now(),
         extracted_at = now(),
         updated_at = now()
     WHERE id = $1`,
    [att.attachment_id_pk, documentType, finalContent.slice(0, 10_000)]
  );

  // Stage 2: Structured extraction
  await dispatchStage2(
    att.attachment_id_pk,
    documentType,
    finalContent,
    att.estimate_id
  );

  console.log(`${LOG}   OK (monday): ${att.name} -> ${documentType}`);
  return { type: "succeeded" };
}

/**
 * Process an email attachment: download from Graph API, run through
 * processFilesIntake (Kreuzberg + classify), then Stage 2 extraction.
 */
async function processEmailAttachment(
  att: UnprocessedAttachment,
  client: GraphEmailClient,
  groupClient: GraphGroupsClient
): Promise<AttachmentOutcome> {
  // Layer 1: Internet Message ID dedup (before download)
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

  // Download from Graph API
  const ext = att.name.includes(".")
    ? att.name.split(".").pop()?.toLowerCase()
    : "bin";
  const localPath = join(
    BACKFILL_DIR,
    `${att.email_id}-${att.attachment_id_pk}.${ext}`
  );

  // Clean up stale failed parsed documents from previous attempts
  if (att.email_id && att.graph_attachment_id) {
    await deleteFailedParsedDocs.run(att.email_id, att.graph_attachment_id);
  }

  console.log(
    `${LOG}   Downloading: "${att.name}" (${att.content_type}, ${att.size ?? "?"} bytes) from ${att.mailbox_email}`
  );

  const downloadFn =
    att.mailbox_email === IC_GROUP_EMAIL
      ? downloadGroupAttachment(att, groupClient)
      : client.downloadAttachment(
          att.message_id!,
          att.graph_attachment_id!,
          att.mailbox_email!
        );

  const buffer = await Promise.race([
    downloadFn,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Download timed out")),
        DOWNLOAD_TIMEOUT_MS
      )
    ),
  ]);

  // Layer 2: Content hash dedup (after download, before processing)
  const hash = computeHash(buffer);
  await setContentHash.run(att.attachment_id_pk, hash);

  const hashDupe = await checkContentHashDupe.get(hash, att.attachment_id_pk);
  if (hashDupe) {
    console.log(
      `${LOG}   Deduped (content hash): "${att.name}" matches document #${hashDupe.id}`
    );
    await markDeduped(att.attachment_id_pk);
    return { type: "deduped" };
  }

  // Process through Kreuzberg pipeline (includes Stage 1 classify)
  await Bun.write(localPath, buffer);

  try {
    const results = await processFilesIntake({
      attachmentPaths: [localPath],
      originalSubject: att.subject ?? "",
      originalFrom: att.from_email ?? "",
      bodyText: "",
      forwarderEmail: att.mailbox_email ?? "",
    });

    const { anySuccess, projectLinkSkipped } = await linkResultsToDocuments(
      results,
      att
    );

    if (anySuccess) {
      await updateAttachmentExtraction(att.attachment_id_pk, "success");

      // Stage 2: Structured extraction on each successful result
      for (const r of results) {
        if (r.documentId && r.documentType) {
          const rawEx = await db
            .query<
              { raw_extraction: { text_content?: string } | null },
              [number]
            >("SELECT raw_extraction FROM documents WHERE id = $1")
            .get(r.documentId);
          const text =
            ((rawEx?.raw_extraction as Record<string, unknown> | null)
              ?.text_content as string) ?? "";
          if (text.length > 0) {
            await dispatchStage2(
              r.documentId,
              r.documentType,
              text,
              att.estimate_id
            );
          }
        }
      }

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

async function processOneAttachment(
  att: UnprocessedAttachment,
  client: GraphEmailClient,
  groupClient: GraphGroupsClient
): Promise<AttachmentOutcome> {
  // Skip non-processable content types
  if (shouldSkip(att)) {
    await updateAttachmentExtraction(att.attachment_id_pk, "skipped");
    return { type: "skipped" };
  }

  // Route by source
  if (att.source === "monday_asset") {
    return processMondayAsset(att);
  }
  return processEmailAttachment(att, client, groupClient);
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
  const groupClient = createGroupsClient();

  for (let i = 0; i < attachments.length; i += concurrency) {
    const chunk = attachments.slice(i, i + concurrency);

    const outcomes = await Promise.allSettled(
      chunk.map(async (att) => {
        try {
          return await processOneAttachment(att, client, groupClient);
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
