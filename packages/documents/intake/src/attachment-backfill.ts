import { existsSync } from "node:fs";
import { mkdir, readdir, rmdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { shouldSkipByContentType } from "@documents-intake/attachment-policy";
import { processFilesIntake } from "@documents-intake/files-intake";
import { processMondayAssetDocument } from "@documents-intake/processors/monday-asset";
import type { GraphEmailClient } from "@email/client";
import type { GraphGroupsClient } from "@email/groups";
import { createGraphClient } from "@email/sync/config";
import { createGroupsClient } from "@email/sync/groups-core/sync-group";
import { updateAttachmentExtraction } from "@lib/db/repositories/attachment";
import {
  clearAttachmentLocalPath,
  deleteFailedParsedDocs,
  findContentHashAttachmentDuplicate,
  findInternetMessageAttachmentDuplicate,
  getIntakeAttachmentRows,
  type IntakeAttachmentRow,
  markAttachmentDeduped,
  markMondayAssetExtractionSuccess,
  setAttachmentContentHash,
  updateDocumentBackfillLinks,
} from "@lib/db/repositories/intake-attachments";
import { COLUMN_HINTS } from "@monday/sync/pipeline-config";

const BACKFILL_DIR = "/app/data/backfill";
const DOWNLOAD_TIMEOUT_MS = 10_000;
const IC_GROUP_EMAIL = "internalcontracts@desertservices.net";
const IC_GROUP_ID = "962f9440-9bde-4178-b538-edc7f8d3ecce";

export interface IntakeAttachmentsResult {
  processed: number;
  skipped: number;
  deduped: number;
  succeeded: number;
  failed: number;
  elapsedMs: number;
  attachmentsPerMinute: number;
  errors: string[];
}

export interface IntakeAttachmentsOptions {
  batchSize?: number;
  concurrency?: number;
}

type AttachmentOutcome =
  | { type: "skipped" }
  | { type: "deduped" }
  | { type: "succeeded" }
  | { type: "failed"; error: string };

function shouldSkip(att: IntakeAttachmentRow): boolean {
  return shouldSkipByContentType(att.content_type);
}

function computeHash(buffer: Buffer): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(buffer);
  return hasher.digest("hex");
}

async function linkResultsToDocuments(
  results: Awaited<ReturnType<typeof processFilesIntake>>,
  att: IntakeAttachmentRow
): Promise<{ anySuccess: boolean }> {
  let anySuccess = false;

  for (const r of results) {
    if (!r.documentId) {
      continue;
    }
    await updateDocumentBackfillLinks(
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
    await clearAttachmentLocalPath(documentId);

    const parentDir = filePath.substring(0, filePath.lastIndexOf("/"));
    if (!parentDir) {
      return;
    }
    try {
      const entries = await readdir(parentDir);
      if (entries.length === 0) {
        await rmdir(parentDir);
      }
    } catch {
      // Directory not empty or missing.
    }
  } catch {
    // Non-fatal cleanup failure.
  }
}

async function processMondayAsset(
  att: IntakeAttachmentRow
): Promise<AttachmentOutcome> {
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
  const contentHash = computeHash(Buffer.from(fileBuffer));
  await setAttachmentContentHash(att.attachment_id_pk, contentHash);
  const hashDupe = await findContentHashAttachmentDuplicate(
    contentHash,
    att.attachment_id_pk
  );
  if (hashDupe) {
    await markAttachmentDeduped(att.attachment_id_pk);
    await cleanupMondayAssetFile(filePath, att.attachment_id_pk);
    return { type: "deduped" };
  }

  const outcome = await processMondayAssetDocument({
    filePath,
    columnHint,
  });

  await markMondayAssetExtractionSuccess(
    att.attachment_id_pk,
    outcome.documentType,
    outcome.summary
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
    const dupe = await findInternetMessageAttachmentDuplicate(
      att.internet_message_id,
      att.name,
      att.size ?? null,
      att.attachment_id_pk
    );
    if (dupe) {
      await markAttachmentDeduped(att.attachment_id_pk);
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
    await deleteFailedParsedDocs(att.email_id, att.graph_attachment_id);
  }

  const hasLocalCopy = Boolean(
    att.storage_path && existsSync(att.storage_path)
  );

  const buffer = hasLocalCopy
    ? Buffer.from(await Bun.file(att.storage_path as string).arrayBuffer())
    : await Promise.race([
        att.mailbox_email === IC_GROUP_EMAIL
          ? downloadGroupAttachment(att, groupClient)
          : (() => {
              if (
                !(
                  att.message_id &&
                  att.graph_attachment_id &&
                  att.mailbox_email
                )
              ) {
                throw new Error(
                  "Missing message_id, graph_attachment_id, mailbox_email, and local storage_path"
                );
              }
              return client.downloadAttachment(
                att.message_id,
                att.graph_attachment_id,
                att.mailbox_email
              );
            })(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Download timed out")),
            DOWNLOAD_TIMEOUT_MS
          )
        ),
      ]);

  const hash = computeHash(buffer);
  await setAttachmentContentHash(att.attachment_id_pk, hash);

  const hashDupe = await findContentHashAttachmentDuplicate(
    hash,
    att.attachment_id_pk
  );
  if (hashDupe) {
    await markAttachmentDeduped(att.attachment_id_pk);
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

export async function processIntakeAttachmentBackfill(
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

  const attachments = await getIntakeAttachmentRows(batchSize);
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
