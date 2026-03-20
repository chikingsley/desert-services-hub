/**
 * Attachment Intake — Trigger.dev scheduled task
 *
 * Processes pending document attachments from two sources:
 *   - email_attachment: Download from Microsoft Graph API, extract, link to email/project
 *   - monday_asset: Download from Monday.com API, extract with nativeExtract
 *
 * Both paths deduplicate by internet_message_id and SHA256 content hash.
 * This task runs on a 5-minute schedule to process the backlog.
 *
 * IMPORTANT: Runner containers have ephemeral filesystems isolated from the
 * pdf-analysis service. All extraction sends file content via multipart upload
 * (nativeExtractMultipart) — never local file paths, never base64-in-JSON.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { shouldSkipAttachment } from "@documents-intake/attachment-policy";
import { updateAttachmentExtraction } from "@documents-intake/db/attachment";
import {
  deleteFailedParsedDocs,
  findContentHashAttachmentDuplicate,
  findInternetMessageAttachmentDuplicate,
  getIntakeAttachmentRows,
  type IntakeAttachmentRow,
  markAttachmentDeduped,
  setAttachmentContentHash,
  setAttachmentSharePointSource,
  updateDocumentBackfillLinks,
} from "@documents-intake/db/intake-attachments";
import { processFilesIntake } from "@documents-intake/files-intake";
import { db } from "@lib/db/client";
import { graphGet, graphGetBinary } from "@lib/graph/http";
import {
  createSharePointClientFromEnv,
  uploadBufferToUncategorized,
} from "@sharepoint/intake-upload";
import { logger, schedules } from "@trigger.dev/sdk";
import { readPositiveIntEnv, taskQueue } from "./queue";

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 30_000;
const DEFAULT_TASK_LOOP_BUDGET_MS = 240_000;
const DEFAULT_MAX_DURATION_SECONDS = 300;
const DEFAULT_MONDAY_ASSET_DOWNLOAD_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ATTACHMENT_SIZE_MB = 50;

const BATCH_SIZE = readPositiveIntEnv(
  "ATTACHMENT_INTAKE_BATCH_SIZE",
  DEFAULT_BATCH_SIZE
);
const DOWNLOAD_TIMEOUT_MS = readPositiveIntEnv(
  "ATTACHMENT_INTAKE_DOWNLOAD_TIMEOUT_MS",
  DEFAULT_DOWNLOAD_TIMEOUT_MS
);
const MONDAY_ASSET_DOWNLOAD_TIMEOUT_MS = readPositiveIntEnv(
  "ATTACHMENT_INTAKE_MONDAY_ASSET_DOWNLOAD_TIMEOUT_MS",
  DEFAULT_MONDAY_ASSET_DOWNLOAD_TIMEOUT_MS
);
const TASK_LOOP_BUDGET_MS = readPositiveIntEnv(
  "ATTACHMENT_INTAKE_LOOP_BUDGET_MS",
  DEFAULT_TASK_LOOP_BUDGET_MS
);
const ATTACHMENT_INTAKE_MAX_DURATION_SECONDS = readPositiveIntEnv(
  "ATTACHMENT_INTAKE_MAX_DURATION_SECONDS",
  DEFAULT_MAX_DURATION_SECONDS
);
const MAX_ATTACHMENT_SIZE_MB = readPositiveIntEnv(
  "ATTACHMENT_INTAKE_MAX_ATTACHMENT_SIZE_MB",
  DEFAULT_MAX_ATTACHMENT_SIZE_MB
);
const MAX_ATTACHMENT_SIZE_BYTES = MAX_ATTACHMENT_SIZE_MB * 1024 * 1024;
const ATTACHMENT_INTAKE_QUEUE = taskQueue(
  "attachment-intake",
  "ATTACHMENT_INTAKE_QUEUE_CONCURRENCY",
  3
);
const BC_WORKER_BASE_URL =
  process.env.BC_WORKER_BASE_URL?.trim() || "http://bc-worker:47824";
const sharePointClient = createSharePointClientFromEnv();

type BodyLinkSource = "onedrive" | "egnyte" | "dropbox" | "buildingconnected";

interface BodyLinkCandidate {
  source: BodyLinkSource;
  url: string;
}

interface EmailBodyRow {
  body_full: string | null;
  body_html: string | null;
}

const ONEDRIVE_RE =
  /https:\/\/(?:(?:[^\s"<>]*sharepoint\.com)|(?:www\.)?onedrive\.live\.com)\/[^\s"<>]*/gi;
const EGNYTE_RE = /https:\/\/[^\s"<>]+\.egnyte\.com\/fl\/[^\s"<>]*/gi;
const DROPBOX_RE = /https:\/\/(?:www\.)?dropbox\.com\/[^\s"<>]*/gi;
const BC_RE = /https:\/\/app\.buildingconnected\.com\/goto\/[^\s"<>]*/gi;
const TRAILING_ARTIFACT_RE = /['">\s\]),.;]+$/;
const SHAREPOINT_COLON_PATH_RE = /\/:[a-z]:\//;

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(timeoutMessage)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function normalizeUrl(raw: string): string {
  return raw.replace(TRAILING_ARTIFACT_RE, "").replaceAll(/&amp;/gi, "&");
}

function isLikelyShareUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes("onedrive.live.com")) {
    return true;
  }
  if (!lower.includes("sharepoint.com")) {
    return false;
  }
  return (
    SHAREPOINT_COLON_PATH_RE.test(lower) ||
    lower.includes("guestaccess.aspx") ||
    lower.includes("/_layouts/15/") ||
    lower.includes("/doc.aspx")
  );
}

function extractBodyLinkCandidates(
  html: string,
  text: string
): BodyLinkCandidate[] {
  const combined = `${html || ""}\n${text || ""}`;
  const links: BodyLinkCandidate[] = [];
  const seen = new Set<string>();

  const addMatches = (
    pattern: RegExp,
    source: BodyLinkSource,
    filter: (url: string) => boolean
  ) => {
    for (const match of combined.matchAll(pattern)) {
      const url = normalizeUrl(match[0]);
      if (!filter(url) || seen.has(url)) {
        continue;
      }
      seen.add(url);
      links.push({ source, url });
    }
  };

  addMatches(ONEDRIVE_RE, "onedrive", isLikelyShareUrl);
  addMatches(EGNYTE_RE, "egnyte", () => true);
  addMatches(DROPBOX_RE, "dropbox", () => true);
  addMatches(BC_RE, "buildingconnected", () => true);

  return links;
}

function parseBodyLinkSource(attachmentId: string): BodyLinkSource | null {
  const parts = attachmentId.split(":");
  const source = parts[1];
  switch (source) {
    case "onedrive":
    case "egnyte":
    case "dropbox":
    case "buildingconnected":
      return source;
    default:
      return null;
  }
}

function bodyLinkAttachmentId(source: BodyLinkSource, url: string): string {
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 24);
  return `bodylink:${source}:${hash}`;
}

function fetchWithTimeout(
  url: string,
  timeoutMs = DOWNLOAD_TIMEOUT_MS
): Promise<Response> {
  return fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
}

function isHtmlResponse(contentType: string | null): boolean {
  return (contentType ?? "").toLowerCase().includes("text/html");
}

async function downloadDirectToBuffer(url: string): Promise<Buffer> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  if (isHtmlResponse(response.headers.get("content-type"))) {
    throw new Error("URL resolved to HTML page instead of downloadable file");
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error("Downloaded file is empty");
  }

  return bytes;
}

async function downloadOneDriveToBuffer(url: string): Promise<Buffer> {
  const encoded = `u!${Buffer.from(url).toString("base64url")}`;
  const item = await graphGet<{
    "@microsoft.graph.downloadUrl"?: string;
  }>(`shares/${encoded}/driveItem?$select=@microsoft.graph.downloadUrl`);

  const downloadUrl = item["@microsoft.graph.downloadUrl"];
  if (!downloadUrl) {
    throw new Error("OneDrive item has no download URL");
  }

  const response = await fetchWithTimeout(downloadUrl);
  if (!response.ok) {
    throw new Error(`OneDrive download HTTP ${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error("Downloaded file is empty");
  }

  return bytes;
}

function normalizeDropboxUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.set("dl", "1");
    return parsed.toString();
  } catch {
    return rawUrl.includes("dl=1")
      ? rawUrl
      : `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}dl=1`;
  }
}

async function downloadBuildingConnectedToBuffer(
  downloadUrl: string
): Promise<Buffer> {
  const response = await fetch(
    `${BC_WORKER_BASE_URL}/api/buildingconnected/download`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ downloadUrl }),
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    }
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `BC download HTTP ${response.status}: ${errText.slice(0, 200)}`
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error("Downloaded file is empty");
  }

  return bytes;
}

function downloadBodyLinkCandidateToBuffer(
  source: BodyLinkSource,
  url: string
): Promise<Buffer> {
  switch (source) {
    case "onedrive":
      return downloadOneDriveToBuffer(url);
    case "dropbox":
      return downloadDirectToBuffer(normalizeDropboxUrl(url));
    case "egnyte":
      return downloadDirectToBuffer(url);
    default:
      throw new Error(`Unsupported body link source: ${source}`);
  }
}

function getEmailBodyById(emailId: number): Promise<EmailBodyRow | null> {
  return db
    .query<EmailBodyRow, [number]>(
      `SELECT body_html, body_full
       FROM emails
       WHERE id = $1`
    )
    .get(emailId);
}

export async function recoverBodyLinkAttachmentBuffer(
  att: IntakeAttachmentRow
): Promise<Buffer> {
  if (!(att.email_id && att.graph_attachment_id)) {
    throw new Error(
      "Body-link recovery requires email_id and graph_attachment_id"
    );
  }

  const source = parseBodyLinkSource(att.graph_attachment_id);
  if (!source) {
    throw new Error(
      `Unsupported body-link attachment id: ${att.graph_attachment_id}`
    );
  }

  const body = await getEmailBodyById(att.email_id);
  if (!body) {
    throw new Error(`Email ${att.email_id} not found`);
  }

  const linkCandidates = extractBodyLinkCandidates(
    body.body_html ?? "",
    body.body_full ?? ""
  ).filter((candidate) => candidate.source === source);

  if (linkCandidates.length === 0) {
    throw new Error(`No ${source} links found in email body`);
  }

  if (source === "buildingconnected") {
    for (const link of linkCandidates) {
      const listResponse = await fetch(
        `${BC_WORKER_BASE_URL}/api/buildingconnected/files`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: link.url }),
          signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        }
      );

      if (!listResponse.ok) {
        continue;
      }

      const listData = (await listResponse.json()) as {
        error?: string;
        files?: Array<{
          _id: string;
          downloadUrl: string;
          name: string;
          size: number;
        }>;
        success: boolean;
      };

      if (!(listData.success && listData.files?.length)) {
        continue;
      }

      for (const file of listData.files) {
        const candidateAttachmentId = bodyLinkAttachmentId(
          "buildingconnected",
          `${link.url}#${file._id}`
        );

        if (candidateAttachmentId !== att.graph_attachment_id) {
          continue;
        }

        return downloadBuildingConnectedToBuffer(file.downloadUrl);
      }
    }

    throw new Error(
      "Could not map BuildingConnected attachment hash to a live file"
    );
  }

  for (const link of linkCandidates) {
    const candidateAttachmentId = bodyLinkAttachmentId(source, link.url);
    if (candidateAttachmentId !== att.graph_attachment_id) {
      continue;
    }

    return downloadBodyLinkCandidateToBuffer(source, link.url);
  }

  throw new Error(
    `Could not map ${source} attachment hash to a URL in email body`
  );
}

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
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("SharePoint source persistence failed", {
      fileName,
      message,
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
    return await withTimeout(
      sharePointClient.download(att.sharepoint_path),
      DOWNLOAD_TIMEOUT_MS,
      `SharePoint download timed out after ${DOWNLOAD_TIMEOUT_MS}ms`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("SharePoint source load failed", {
      documentId: att.attachment_id_pk,
      sharepointPath: att.sharepoint_path,
      message,
    });
    return null;
  }
}

// ── Monday asset download ───────────────────────────────────────

async function downloadMondayAsset(
  mondayItemId: string,
  mondayAssetId: string
): Promise<Buffer | null> {
  const { getItemAssets } = await import("@monday/client/assets");
  const assets = await getItemAssets(mondayItemId);
  const asset = assets.find((a) => a.id === mondayAssetId);

  if (!asset?.public_url) {
    return null;
  }

  const response = await withTimeout(
    fetch(asset.public_url),
    MONDAY_ASSET_DOWNLOAD_TIMEOUT_MS,
    `Monday asset download timed out after ${MONDAY_ASSET_DOWNLOAD_TIMEOUT_MS}ms`
  );
  if (!response.ok) {
    return null;
  }

  const bytes = await withTimeout(
    response.arrayBuffer(),
    MONDAY_ASSET_DOWNLOAD_TIMEOUT_MS,
    `Monday asset read timed out after ${MONDAY_ASSET_DOWNLOAD_TIMEOUT_MS}ms`
  );

  return Buffer.from(bytes);
}

// ── Process one attachment ──────────────────────────────────────

type Outcome = "extracted" | "skipped" | "deduped" | "failed";
interface ProcessOutcome {
  failureReason?: string;
  outcome: Outcome;
}

interface FailureReasonCount {
  count: number;
  reason: string;
}

function summarizeFailureReason(message: string): string {
  const firstLine = message.split("\n")[0]?.trim() ?? "";
  if (firstLine.length === 0) {
    return "Unknown failure";
  }

  const normalized = firstLine.replace(/\s+/g, " ");
  if (normalized.length <= 160) {
    return normalized;
  }
  return `${normalized.slice(0, 157)}...`;
}

function isNotFoundLikeFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("not found") ||
    m.includes("404") ||
    m.includes("itemnotfound") ||
    m.includes("no such")
  );
}

export async function loadEmailAttachmentBuffer(
  att: IntakeAttachmentRow
): Promise<Buffer> {
  if (att.storage_path && existsSync(att.storage_path)) {
    return Buffer.from(await Bun.file(att.storage_path).arrayBuffer());
  }

  const sharePointBuffer = await loadSharePointBuffer(att);
  if (sharePointBuffer) {
    return sharePointBuffer;
  }

  if (att.graph_attachment_id?.startsWith("bodylink:")) {
    return recoverBodyLinkAttachmentBuffer(att);
  }

  if (!(att.message_id && att.graph_attachment_id && att.mailbox_email)) {
    throw new Error(
      "Missing message_id, graph_attachment_id, mailbox_email, and local storage_path"
    );
  }

  return await withTimeout(
    downloadAttachment(
      att.mailbox_email,
      att.message_id,
      att.graph_attachment_id
    ),
    DOWNLOAD_TIMEOUT_MS,
    `Download timed out after ${DOWNLOAD_TIMEOUT_MS}ms`
  );
}

async function processMondayAsset(
  att: IntakeAttachmentRow
): Promise<ProcessOutcome> {
  if (!(att.monday_item_id && att.monday_asset_id)) {
    const reason = "Monday asset missing item_id or asset_id";
    await updateAttachmentExtraction(
      att.attachment_id_pk,
      "failed",
      null,
      reason
    );
    return { outcome: "failed", failureReason: reason };
  }

  const buffer = await downloadMondayAsset(
    att.monday_item_id,
    att.monday_asset_id
  );

  if (!buffer) {
    const reason = `Monday asset not available: item=${att.monday_item_id}, asset=${att.monday_asset_id}`;
    await updateAttachmentExtraction(
      att.attachment_id_pk,
      "failed",
      null,
      reason
    );
    return { outcome: "failed", failureReason: reason };
  }

  const sharePointSource = await persistSourceBufferToSharePoint(
    att.name,
    buffer
  );
  await setAttachmentSharePointSource(
    att.attachment_id_pk,
    sharePointSource?.sharepointPath ?? null,
    sharePointSource?.sharepointUrl ?? null
  );

  // Content hash dedup
  const hash = computeHash(buffer);
  await setAttachmentContentHash(att.attachment_id_pk, hash);

  const hashDupe = await findContentHashAttachmentDuplicate(
    hash,
    att.attachment_id_pk
  );
  if (hashDupe) {
    await markAttachmentDeduped(att.attachment_id_pk);
    return { outcome: "deduped" };
  }

  // Extract via multipart upload — no temp files needed
  const { processMondayAssetDocument } = await import(
    "@documents-intake/processors/monday-asset"
  );
  const { COLUMN_HINTS } = await import("@monday/sync/pipeline-config");

  const columnHint = att.monday_column_id
    ? (COLUMN_HINTS[att.monday_column_id] ?? undefined)
    : undefined;

  const outcome = await processMondayAssetDocument({
    filePath: att.name,
    buffer,
    columnHint,
  });

  const { markMondayAssetExtractionSuccess } = await import(
    "@documents-intake/db/intake-attachments"
  );
  await markMondayAssetExtractionSuccess(
    att.attachment_id_pk,
    outcome.documentType,
    outcome.summary
  );

  return { outcome: "extracted" };
}

function isGraphItemNotFoundError(message: string): boolean {
  return message.toLowerCase().includes("graph api 404");
}

async function processEmailAttachment(
  att: IntakeAttachmentRow
): Promise<ProcessOutcome> {
  // Check internet_message_id dedup (same email forwarded to multiple mailboxes)
  if (att.internet_message_id) {
    const dupe = await findInternetMessageAttachmentDuplicate(
      att.internet_message_id,
      att.name,
      att.size ?? null,
      att.attachment_id_pk
    );
    if (dupe) {
      await markAttachmentDeduped(att.attachment_id_pk);
      return { outcome: "deduped" };
    }
  }

  // Clean up any previously failed parsed docs for this attachment
  if (att.email_id && att.graph_attachment_id) {
    await deleteFailedParsedDocs(att.email_id, att.graph_attachment_id);
  }

  let buffer: Buffer;
  try {
    // Body-link downloads are pre-fetched by body-link-intake and loaded here
    // from storage_path when available.
    buffer = await loadEmailAttachmentBuffer(att);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (isGraphItemNotFoundError(msg)) {
      await updateAttachmentExtraction(
        att.attachment_id_pk,
        "skipped",
        null,
        "Graph item not found (likely deleted/moved)"
      );
      return { outcome: "skipped" };
    }

    await updateAttachmentExtraction(att.attachment_id_pk, "failed", null, msg);
    return { outcome: "failed", failureReason: msg };
  }

  // Content hash dedup
  const hash = computeHash(buffer);
  await setAttachmentContentHash(att.attachment_id_pk, hash);

  const hashDupe = await findContentHashAttachmentDuplicate(
    hash,
    att.attachment_id_pk
  );
  if (hashDupe) {
    await markAttachmentDeduped(att.attachment_id_pk);
    return { outcome: "deduped" };
  }

  // Extract via multipart upload — pass buffer alongside path for
  // cross-container transport.
  const results = await processFilesIntake({
    attachmentPaths: [att.name],
    attachmentBuffers: [buffer],
    originalSubject: att.subject ?? "",
    originalFrom: att.from_email ?? "",
    bodyText: "",
    forwarderEmail: att.mailbox_email ?? "",
  });

  const sourcePersistence = results[0]?.sourcePersistence ?? null;
  await setAttachmentSharePointSource(
    att.attachment_id_pk,
    sourcePersistence?.sharepointPath ?? null,
    sourcePersistence?.sharepointUrl ?? null
  );

  // Link extracted documents back to email/project
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
    return { outcome: "extracted" };
  }

  const errMsg = results[0]?.error ?? "No document created";
  await updateAttachmentExtraction(
    att.attachment_id_pk,
    "failed",
    null,
    errMsg
  );
  return { outcome: "failed", failureReason: errMsg };
}

async function processOne(att: IntakeAttachmentRow): Promise<ProcessOutcome> {
  if ((att.size ?? 0) > MAX_ATTACHMENT_SIZE_BYTES) {
    await updateAttachmentExtraction(
      att.attachment_id_pk,
      "skipped",
      null,
      `Attachment too large (${att.size} bytes > ${MAX_ATTACHMENT_SIZE_BYTES} bytes)`
    );
    return { outcome: "skipped" };
  }

  // Skip non-processable content types and likely inline images
  if (
    shouldSkipAttachment({
      contentType: att.content_type,
      fileName: att.name,
      size: att.size,
    })
  ) {
    await updateAttachmentExtraction(att.attachment_id_pk, "skipped");
    return { outcome: "skipped" };
  }

  if (att.source === "monday_asset") {
    return processMondayAsset(att);
  }
  return processEmailAttachment(att);
}

// ── Task ────────────────────────────────────────────────────────

export const attachmentIntake = schedules.task({
  id: "attachment-intake",
  queue: ATTACHMENT_INTAKE_QUEUE,
  cron: "*/5 * * * *",
  maxDuration: ATTACHMENT_INTAKE_MAX_DURATION_SECONDS,
  run: async () => {
    const attachments = await getIntakeAttachmentRows(BATCH_SIZE);
    if (attachments.length === 0) {
      return {
        processed: 0,
        extracted: 0,
        skipped: 0,
        deduped: 0,
        failed: 0,
        gated: 0,
      };
    }

    logger.info("Processing attachments", { count: attachments.length });

    const counts = {
      extracted: 0,
      skipped: 0,
      deduped: 0,
      failed: 0,
      gated: 0,
    };
    const failureReasons = new Map<string, number>();
    let notFoundLikeFailures = 0;

    const addFailureReason = (reason: string) => {
      const normalized = summarizeFailureReason(reason);
      failureReasons.set(normalized, (failureReasons.get(normalized) ?? 0) + 1);
      if (isNotFoundLikeFailure(reason)) {
        notFoundLikeFailures++;
      }
    };

    const startedAt = Date.now();

    for (const att of attachments) {
      const processedSoFar =
        counts.extracted + counts.skipped + counts.deduped + counts.failed;
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs >= TASK_LOOP_BUDGET_MS) {
        logger.warn("Stopping attachment-intake early to avoid task timeout", {
          elapsedMs,
          processedSoFar,
          remaining: attachments.length - processedSoFar,
          loopBudgetMs: TASK_LOOP_BUDGET_MS,
        });
        break;
      }

      try {
        const result = await processOne(att);
        counts[result.outcome]++;
        if (result.outcome === "failed" && result.failureReason) {
          addFailureReason(result.failureReason);
        }

        logger.info("Attachment processed", {
          id: att.attachment_id_pk,
          name: att.name,
          outcome: result.outcome,
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
        addFailureReason(msg);
        counts.failed++;
      }
    }

    const processed =
      counts.extracted +
      counts.skipped +
      counts.deduped +
      counts.failed +
      counts.gated;
    const topFailureReasons: FailureReasonCount[] = [
      ...failureReasons.entries(),
    ]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));
    logger.info("Attachment intake complete", {
      processed,
      ...counts,
      providerCapacityGated: counts.gated > 0,
      notFoundLikeFailures,
      topFailureReasons,
    });

    return {
      processed,
      ...counts,
      providerCapacityGated: counts.gated > 0,
      notFoundLikeFailures,
      topFailureReasons,
    };
  },
});
