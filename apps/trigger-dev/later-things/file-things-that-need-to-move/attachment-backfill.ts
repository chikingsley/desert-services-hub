// biome-ignore lint/nursery/noExcessiveLinesPerFile: operational backfill stays in one file for now
import { existsSync } from "node:fs";
import { mkdir, readdir, rmdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { shouldSkipByContentType } from "@documents-intake/attachment-policy";
import { updateAttachmentExtraction } from "@documents-intake/db/attachment";
import {
  clearAttachmentLocalPath,
  deleteFailedParsedDocs,
  findContentHashAttachmentDuplicate,
  findInternetMessageAttachmentDuplicate,
  getIntakeAttachmentRows,
  getIntakeAttachmentRowsByEmail,
  type IntakeAttachmentRow,
  markAttachmentDeduped,
  markMondayAssetExtractionSuccess,
  setAttachmentContentHash,
  setAttachmentSharePointSource,
  updateDocumentBackfillLinks,
} from "@documents-intake/db/intake-attachments";
import { processFilesIntake } from "@documents-intake/files-intake";
import { processMondayAssetDocument } from "@documents-intake/processors/monday-asset";
import { createGroupsClient, type GraphGroupsClient } from "@lib/graph/groups";
import { createGraphClient, type GraphEmailClient } from "@lib/graph/mail";
import { COLUMN_HINTS } from "@monday/sync/pipeline-config";
import {
  createSharePointClientFromEnv,
  uploadBufferToUncategorized,
} from "@sharepoint/intake-upload";

const BACKFILL_DIR = "/app/data/backfill";
const DOWNLOAD_TIMEOUT_MS = 10_000;
const IC_GROUP_EMAIL = "internalcontracts@desertservices.net";
const IC_GROUP_ID = "962f9440-9bde-4178-b538-edc7f8d3ecce";
const sharePointClient = createSharePointClientFromEnv();

export interface IntakeAttachmentsResult {
  attachmentsPerMinute: number;
  deduped: number;
  elapsedMs: number;
  errors: string[];
  failed: number;
  processed: number;
  skipped: number;
  succeeded: number;
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

async function persistSourceBufferToSharePoint(
  fileName: string,
  buffer: Buffer
): Promise<{
  sharepointPath: string;
  sharepointUrl: string;
} | null> {
  if (!sharePointClient) {
    return null;
  }

  try {
    return await uploadBufferToUncategorized(sharePointClient, {
      buffer,
      originalFileName: fileName,
    });
  } catch (error) {
    console.warn("SharePoint source persistence failed", {
      fileName,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function loadSharePointBuffer(
  att: IntakeAttachmentRow
): Promise<Buffer | null> {
  if (!(sharePointClient && att.sharepoint_path)) {
    return null;
  }

  try {
    return await sharePointClient.download(att.sharepoint_path);
  } catch (error) {
    console.warn("SharePoint source load failed", {
      documentId: att.attachment_id_pk,
      sharepointPath: att.sharepoint_path,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function linkResultsToDocuments(
  results: Awaited<ReturnType<typeof processFilesIntake>>,
  att: IntakeAttachmentRow
): Promise<{ anySuccess: boolean }> {
  let anySuccess = false;

  for (const r of results) {
    await setAttachmentSharePointSource(
      att.attachment_id_pk,
      r.sourcePersistence?.sharepointPath ?? null,
      r.sourcePersistence?.sharepointUrl ?? null
    );
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

/** Download a Monday asset file from the API by fetching a fresh public_url. */
async function downloadMondayAssetFromApi(
  mondayItemId: string,
  mondayAssetId: string
): Promise<Buffer | null> {
  const { getItemAssets } = await import("@monday/client/assets");
  const assets = await getItemAssets(mondayItemId);
  const asset = assets.find((a) => a.id === mondayAssetId);

  if (!asset?.public_url) {
    return null;
  }

  const response = await fetch(asset.public_url);
  if (!response.ok) {
    return null;
  }

  return Buffer.from(await response.arrayBuffer());
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: backfill path handles download, dedupe, persistence, and cleanup together
async function processMondayAsset(
  att: IntakeAttachmentRow
): Promise<AttachmentOutcome> {
  const columnHint = att.monday_column_id
    ? (COLUMN_HINTS[att.monday_column_id] ?? undefined)
    : undefined;

  // Try local file first, fall back to downloading from Monday API
  let fileBuffer: Buffer | null = null;
  let tempPath: string | null = null;
  const filePath = att.local_path;

  if (filePath && existsSync(filePath)) {
    fileBuffer = Buffer.from(await Bun.file(filePath).arrayBuffer());
  } else if (att.monday_item_id && att.monday_asset_id) {
    const downloaded = await downloadMondayAssetFromApi(
      att.monday_item_id,
      att.monday_asset_id
    );
    if (downloaded) {
      fileBuffer = downloaded;
      // Write to temp file for extraction (nativeExtract needs a file path)
      const { tmpdir } = await import("node:os");
      tempPath = `${tmpdir()}/monday-asset-${att.monday_asset_id}-${att.name}`;
      await Bun.write(tempPath, downloaded);
    }
  }

  if (!fileBuffer) {
    const errMsg = `Monday asset not available: local_path=${filePath ?? "none"}, item=${att.monday_item_id ?? "none"}, asset=${att.monday_asset_id ?? "none"}`;
    await updateAttachmentExtraction(
      att.attachment_id_pk,
      "failed",
      null,
      errMsg
    );
    return { type: "failed", error: `${att.name}: ${errMsg}` };
  }

  const contentHash = computeHash(fileBuffer);
  const sharePointSource = await persistSourceBufferToSharePoint(
    att.name,
    fileBuffer
  );
  await setAttachmentSharePointSource(
    att.attachment_id_pk,
    sharePointSource?.sharepointPath ?? null,
    sharePointSource?.sharepointUrl ?? null
  );
  await setAttachmentContentHash(att.attachment_id_pk, contentHash);
  const hashDupe = await findContentHashAttachmentDuplicate(
    contentHash,
    att.attachment_id_pk
  );
  if (hashDupe) {
    await markAttachmentDeduped(att.attachment_id_pk);
    if (filePath) {
      await cleanupMondayAssetFile(filePath, att.attachment_id_pk);
    }
    if (tempPath) {
      await safeUnlink(tempPath);
    }
    return { type: "deduped" };
  }

  const extractPath = tempPath ?? filePath;
  const outcome = await processMondayAssetDocument({
    filePath: extractPath as string,
    columnHint,
  });

  await markMondayAssetExtractionSuccess(
    att.attachment_id_pk,
    outcome.documentType,
    outcome.summary
  );
  if (filePath) {
    await cleanupMondayAssetFile(filePath, att.attachment_id_pk);
  }
  if (tempPath) {
    await safeUnlink(tempPath);
  }
  return { type: "succeeded" };
}

async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // Non-fatal cleanup failure.
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: backfill path handles local, SharePoint, and Graph fallbacks in one place
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

  const sharePointBuffer = hasLocalCopy
    ? null
    : await loadSharePointBuffer(att);

  let buffer: Buffer;
  if (hasLocalCopy) {
    buffer = Buffer.from(
      await Bun.file(att.storage_path as string).arrayBuffer()
    );
  } else if (sharePointBuffer) {
    buffer = sharePointBuffer;
  } else {
    buffer = await Promise.race([
      att.mailbox_email === IC_GROUP_EMAIL
        ? downloadGroupAttachment(att, groupClient)
        : (() => {
            if (
              !(att.message_id && att.graph_attachment_id && att.mailbox_email)
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
  }

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

/**
 * Process attachments for a single email inline at webhook time.
 * Reuses the same processOneAttachment pipeline as the batch backfill.
 */
export async function processAttachmentsForEmail(
  emailId: number,
  client: GraphEmailClient
): Promise<{
  extracted: number;
  skipped: number;
  failed: number;
  deduped: number;
}> {
  const result = { extracted: 0, skipped: 0, failed: 0, deduped: 0 };

  const attachments = await getIntakeAttachmentRowsByEmail(emailId);
  if (attachments.length === 0) {
    return result;
  }

  await mkdir(BACKFILL_DIR, { recursive: true });
  const groupClient = createGroupsClient();

  for (const att of attachments) {
    try {
      const outcome = await processOneAttachment(att, client, groupClient);
      switch (outcome.type) {
        case "succeeded":
          result.extracted++;
          break;
        case "skipped":
          result.skipped++;
          break;
        case "deduped":
          result.deduped++;
          break;
        case "failed":
          result.failed++;
          break;
        default:
          break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await updateAttachmentExtraction(
        att.attachment_id_pk,
        "failed",
        null,
        msg.slice(0, 1000)
      );
      result.failed++;
    }
  }

  return result;
}
