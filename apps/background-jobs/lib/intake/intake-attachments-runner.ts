import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  extractWithKreuzberg,
  MIN_KREUZBERG_TEXT_LENGTH,
} from "@documents-intake/files-intake-db";
import { classifyDocument } from "@documents-intake/processors/classify";
import type { GraphEmailClient } from "@email/client";
import type { GraphGroupsClient } from "@email/groups";
import { createGraphClient } from "@email/sync/config";
import { createGroupsClient } from "@email/sync/groups-core/sync-group";
import { db } from "@lib/db/hub";
import { updateAttachmentExtraction } from "@lib/db/repositories/attachment";
import { COLUMN_HINTS } from "@monday/sync/pipeline-config";
import { processFilesIntake } from "./files-intake";
import type {
  IntakeAttachmentRow,
  IntakeAttachmentsOptions,
  IntakeAttachmentsResult,
} from "./types";

const BACKFILL_DIR = "/app/data/backfill";
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_COOLDOWN_HOURS = 6;
const DOWNLOAD_TIMEOUT_MS = 10_000;

const SKIP_CONTENT_TYPES = new Set([
  "text/calendar",
  "application/x-ms-wmz",
  "message/rfc822",
  "application/ics",
  "application/pkcs7-signature",
  "application/x-pkcs7-signature",
]);

function shouldSkip(att: IntakeAttachmentRow): boolean {
  const ct = att.content_type?.toLowerCase() ?? "";
  return SKIP_CONTENT_TYPES.has(ct);
}

const IC_GROUP_EMAIL = "internalcontracts@desertservices.net";
const IC_GROUP_ID = "962f9440-9bde-4178-b538-edc7f8d3ecce";

const getIntakeAttachmentRows = db.query<IntakeAttachmentRow, [number]>(`
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

const checkContentHashDupe = db.query<{ id: number }, [string, number]>(`
  SELECT d2.id
  FROM documents d2
  WHERE d2.source = 'email_attachment'
    AND d2.content_hash = $1
    AND d2.extraction_status IN ('success', 'deduped')
    AND d2.id <> $2
  LIMIT 1
`);

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
  att: IntakeAttachmentRow
): Promise<{ anySuccess: boolean }> {
  let anySuccess = false;

  for (const r of results) {
    if (!r.documentId) {
      continue;
    }

    await updateDocumentBackfillLinks.run(
      r.documentId,
      att.email_id,
      att.graph_attachment_id,
      att.project_id
    );
    anySuccess = true;
  }

  return { anySuccess };
}

async function downloadGroupAttachment(
  att: IntakeAttachmentRow,
  groupClient: GraphGroupsClient
): Promise<Buffer> {
  if (!att.conversation_id) {
    throw new Error("No conversation_id for group attachment");
  }

  const threads = await groupClient.getConversationThreads(
    IC_GROUP_ID,
    att.conversation_id
  );
  if (threads.length === 0) {
    throw new Error("No threads found for group conversation");
  }

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

async function cleanupMondayAssetFile(
  filePath: string,
  documentId: number
): Promise<void> {
  try {
    await unlink(filePath);
    await db.run("UPDATE documents SET local_path = NULL WHERE id = $1", [
      documentId,
    ]);

    const parentDir = filePath.substring(0, filePath.lastIndexOf("/"));
    if (parentDir) {
      try {
        const { readdir } = await import("node:fs/promises");
        const entries = await readdir(parentDir);
        if (entries.length === 0) {
          const { rmdir } = await import("node:fs/promises");
          await rmdir(parentDir);
        }
      } catch {
        // Directory not empty or missing.
      }
    }
  } catch {
    // Non-fatal cleanup failure.
  }
}

async function processMondayAsset(
  att: IntakeAttachmentRow
): Promise<AttachmentOutcome> {
  const { existsSync } = await import("node:fs");
  const columnHint = att.monday_column_id
    ? (COLUMN_HINTS[att.monday_column_id] ?? undefined)
    : undefined;

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

  const fileBuffer = await Bun.file(filePath).arrayBuffer();
  const hash = computeHash(Buffer.from(fileBuffer));
  await setContentHash.run(att.attachment_id_pk, hash);

  const hashDupe = await checkContentHashDupe.get(hash, att.attachment_id_pk);
  if (hashDupe) {
    await markDeduped(att.attachment_id_pk);
    await cleanupMondayAssetFile(filePath, att.attachment_id_pk);
    return { type: "deduped" };
  }

  const extracted = await extractWithKreuzberg(filePath, {
    minTextLength: MIN_KREUZBERG_TEXT_LENGTH,
  });

  const finalContent = extracted.content;
  const classified = await classifyDocument(finalContent, att.name, columnHint);
  const documentType =
    classified.document_type !== "unknown"
      ? classified.document_type
      : (columnHint ?? "unknown");

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

  await cleanupMondayAssetFile(filePath, att.attachment_id_pk);
  return { type: "succeeded" };
}

async function processEmailAttachment(
  att: IntakeAttachmentRow,
  client: GraphEmailClient,
  groupClient: GraphGroupsClient
): Promise<AttachmentOutcome> {
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

  const ext = att.name.includes(".")
    ? att.name.split(".").pop()?.toLowerCase()
    : "bin";
  const localPath = join(
    BACKFILL_DIR,
    `${att.email_id}-${att.attachment_id_pk}.${ext}`
  );

  if (att.email_id && att.graph_attachment_id) {
    await deleteFailedParsedDocs.run(att.email_id, att.graph_attachment_id);
  }

  const downloadFn =
    att.mailbox_email === IC_GROUP_EMAIL
      ? downloadGroupAttachment(att, groupClient)
      : (() => {
          if (
            !(att.message_id && att.graph_attachment_id && att.mailbox_email)
          ) {
            throw new Error(
              "Missing message_id, graph_attachment_id, or mailbox_email"
            );
          }
          return client.downloadAttachment(
            att.message_id,
            att.graph_attachment_id,
            att.mailbox_email
          );
        })();

  const buffer = await Promise.race([
    downloadFn,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Download timed out")),
        DOWNLOAD_TIMEOUT_MS
      )
    ),
  ]);

  const hash = computeHash(buffer);
  await setContentHash.run(att.attachment_id_pk, hash);

  const hashDupe = await checkContentHashDupe.get(hash, att.attachment_id_pk);
  if (hashDupe) {
    await markDeduped(att.attachment_id_pk);
    return { type: "deduped" };
  }

  await Bun.write(localPath, buffer);

  try {
    const results = await processFilesIntake({
      attachmentPaths: [localPath],
      originalSubject: att.subject ?? "",
      originalFrom: att.from_email ?? "",
      bodyText: "",
      forwarderEmail: att.mailbox_email ?? "",
    });

    const { anySuccess } = await linkResultsToDocuments(results, att);

    if (anySuccess) {
      await updateAttachmentExtraction(att.attachment_id_pk, "success");
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
      // Non-fatal cleanup failure.
    }
  }
}

async function processOneAttachment(
  att: IntakeAttachmentRow,
  client: GraphEmailClient,
  groupClient: GraphGroupsClient
): Promise<AttachmentOutcome> {
  if (shouldSkip(att)) {
    await updateAttachmentExtraction(att.attachment_id_pk, "skipped");
    return { type: "skipped" };
  }

  if (att.source === "monday_asset") {
    return processMondayAsset(att);
  }
  return processEmailAttachment(att, client, groupClient);
}

function tallyOutcome(
  outcome: PromiseSettledResult<AttachmentOutcome>,
  result: IntakeAttachmentsResult
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

export async function processIntakeAttachmentRows(
  options: IntakeAttachmentsOptions = {}
): Promise<IntakeAttachmentsResult> {
  const startedAt = Date.now();
  const batchSize = Math.max(1, options.batchSize ?? 100);
  const concurrency = Math.max(1, options.concurrency ?? 10);

  const result: IntakeAttachmentsResult = {
    processed: 0,
    skipped: 0,
    deduped: 0,
    succeeded: 0,
    failed: 0,
    elapsedMs: 0,
    attachmentsPerMinute: 0,
    errors: [],
  };

  const attachments = await getIntakeAttachmentRows.all(batchSize);

  if (attachments.length === 0) {
    result.elapsedMs = Date.now() - startedAt;
    return result;
  }

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
  result.elapsedMs = Date.now() - startedAt;
  result.attachmentsPerMinute =
    result.elapsedMs > 0 ? (total / result.elapsedMs) * 60_000 : total;

  return result;
}
