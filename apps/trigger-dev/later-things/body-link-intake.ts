/**
 * Body Link Intake — Trigger.dev scheduled task
 *
 * Scans email bodies for file-sharing URLs and downloads the files.
 * Supported platforms:
 *   - OneDrive / SharePoint (resolved via Graph API)
 *   - Dropbox (direct download with dl=1)
 *   - Egnyte (direct download)
 *   - BuildingConnected (bc-worker API: list files → stream download per file)
 *
 * Downloaded files are stored as attachment stubs in the documents table
 * (source='email_attachment', outlook_attachment_id='bodylink:{source}:{hash}')
 * and then extracted by the attachment-intake scheduled task.
 *
 * Deduplication: each email is scanned once per version. The scan state
 * is tracked in email columns (body_link_scan_status, etc.).
 */

import { createHash } from "node:crypto";
import { mkdir, unlink } from "node:fs/promises";
import { insertAttachment } from "@documents-intake/db/attachment";
import { db } from "@lib/db/client";
import {
  getBodyLinkScanState,
  isBodyLinkScanCompleteForVersion,
  recordBodyLinkScanResult,
} from "@email/db/email";
import type { BodyLinkScanStatus } from "@lib/db/types";
import { graphGet } from "@lib/graph/http";
import { logger, schedules } from "@trigger.dev/sdk";
import { taskQueue } from "./queue";

const BATCH_SIZE = 500;
const SCAN_VERSION = 1;
const MAX_LINKS_PER_EMAIL = 12;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_RUNTIME_MS = 840_000; // Keep margin under task limit (900s)
const RUNTIME_WARNING_MS = 30_000;
const BODY_LINK_STORAGE_DIR =
  process.env.EMAIL_BODY_LINK_STORAGE_DIR?.trim() ||
  "/app/data/attachments/body-links";

const BC_WORKER_BASE_URL =
  process.env.BC_WORKER_BASE_URL?.trim() || "http://bc-worker:47824";
const BODY_LINK_INTAKE_QUEUE = taskQueue(
  "body-link-intake",
  "BODY_LINK_INTAKE_QUEUE_CONCURRENCY",
  2
);
// ── URL extraction ──────────────────────────────────────────────

type BodyLinkSource = "onedrive" | "egnyte" | "dropbox" | "buildingconnected";

interface BodyFileLink {
  source: BodyLinkSource;
  url: string;
}

const ONEDRIVE_RE =
  /https:\/\/(?:(?:[^\s"<>]*sharepoint\.com)|(?:www\.)?onedrive\.live\.com)\/[^\s"<>]*/gi;
const EGNYTE_RE = /https:\/\/[^\s"<>]+\.egnyte\.com\/fl\/[^\s"<>]*/gi;
const DROPBOX_RE = /https:\/\/(?:www\.)?dropbox\.com\/[^\s"<>]*/gi;
const BC_RE = /https:\/\/app\.buildingconnected\.com\/goto\/[^\s"<>]*/gi;
const TRAILING_ARTIFACT_RE = /['">\s\]),.;]+$/;
const SHAREPOINT_COLON_PATH_RE = /\/:[a-z]:\//;
const CONTENT_DISPOSITION_UTF8_RE = /filename\*\s*=\s*UTF-8''([^;]+)/i;
const CONTENT_DISPOSITION_SIMPLE_RE = /filename[^;=\n]*=(["']?)([^"';\n]+)\1/i;

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

function normalizeUrl(raw: string): string {
  return raw.replace(TRAILING_ARTIFACT_RE, "").replaceAll(/&amp;/gi, "&");
}

function extractMatch(
  combined: string,
  pattern: RegExp,
  source: BodyLinkSource,
  filter: (url: string) => boolean,
  links: BodyFileLink[],
  seen: Set<string>
): void {
  for (const match of combined.matchAll(pattern)) {
    const url = normalizeUrl(match[0]);
    if (!filter(url) || seen.has(url)) {
      continue;
    }
    seen.add(url);
    links.push({ source, url });
  }
}

function extractBodyFileLinks(html: string, text: string): BodyFileLink[] {
  const combined = `${html || ""}\n${text || ""}`;
  const links: BodyFileLink[] = [];
  const seen = new Set<string>();
  extractMatch(
    combined,
    ONEDRIVE_RE,
    "onedrive",
    isLikelyShareUrl,
    links,
    seen
  );
  extractMatch(combined, EGNYTE_RE, "egnyte", () => true, links, seen);
  extractMatch(combined, DROPBOX_RE, "dropbox", () => true, links, seen);
  extractMatch(combined, BC_RE, "buildingconnected", () => true, links, seen);
  return links;
}

// ── Download helpers ────────────────────────────────────────────

interface DownloadedFile {
  contentType: string | null;
  name: string;
  size: number;
}

function fetchWithTimeout(
  url: string,
  timeoutMs = DOWNLOAD_TIMEOUT_MS
): Promise<Response> {
  // AbortSignal.timeout covers the ENTIRE lifecycle (headers + body streaming).
  // Manual setTimeout+clearTimeout only covers headers because fetch() resolves
  // on headers arrival, and finally{clearTimeout} disarms before body is read.
  // See: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static
  return fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
}

function shouldStopForRuntimeBudget(
  startedAtMs: number,
  maxDurationMs = MAX_RUNTIME_MS,
  warningMs = RUNTIME_WARNING_MS
): { stop: boolean; remainingMs: number } {
  const elapsedMs = Date.now() - startedAtMs;
  const remainingMs = maxDurationMs - elapsedMs;
  return { stop: remainingMs <= warningMs, remainingMs };
}

function isHtmlResponse(contentType: string | null): boolean {
  return (contentType ?? "").toLowerCase().includes("text/html");
}

function filenameFromResponse(response: Response, fallback: string): string {
  const disposition = response.headers.get("content-disposition");
  if (disposition) {
    // UTF-8'' format
    const utf8Match = disposition.match(CONTENT_DISPOSITION_UTF8_RE);
    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1]);
      } catch {
        /* fall through */
      }
    }
    // Simple format
    const simpleMatch = disposition.match(CONTENT_DISPOSITION_SIMPLE_RE);
    if (simpleMatch?.[2]) {
      return simpleMatch[2];
    }
  }

  // Try URL pathname
  try {
    const pathname = new URL(response.url || "").pathname;
    const basename = pathname.split("/").pop();
    if (basename && basename !== "/" && basename.includes(".")) {
      return basename;
    }
  } catch {
    /* fall through */
  }

  return fallback;
}

async function streamResponseToFile(
  response: Response,
  outputPath: string
): Promise<number> {
  const body = response.body;
  if (!body) {
    throw new Error("Download response had no body");
  }

  const reader = body.getReader();
  const writer = Bun.file(outputPath).writer();
  let size = 0;
  let writeFailed = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!(value && value.byteLength > 0)) {
        continue;
      }
      size += value.byteLength;
      await writer.write(value);
    }
  } catch (err) {
    writeFailed = true;
    throw err;
  } finally {
    try {
      await writer.end();
    } catch (closeErr) {
      if (!writeFailed) {
        logger.warn("Failed to close downloaded file writer", {
          error:
            closeErr instanceof Error ? closeErr.message : String(closeErr),
          outputPath,
        });
      }
    }
  }

  if (size === 0) {
    throw new Error("Downloaded file is empty");
  }

  return size;
}

/** Download a file via direct HTTP. Rejects if response is HTML. */
async function downloadDirect(
  url: string,
  fallbackName: string,
  outputPath: string
): Promise<DownloadedFile> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type");
  if (isHtmlResponse(contentType)) {
    throw new Error("URL resolved to HTML page instead of downloadable file");
  }
  const size = await streamResponseToFile(response, outputPath);

  return {
    contentType,
    name: filenameFromResponse(response, fallbackName),
    size,
  };
}

/** Resolve a OneDrive/SharePoint share URL via Graph API → direct download. */
async function downloadOneDrive(
  url: string,
  outputPath: string
): Promise<DownloadedFile> {
  // Encode share URL for Graph API: u! + base64url(url)
  const encoded = `u!${Buffer.from(url).toString("base64url")}`;
  const item = await graphGet<{
    "@microsoft.graph.downloadUrl"?: string;
    name: string;
  }>(`shares/${encoded}/driveItem?$select=name,@microsoft.graph.downloadUrl`);

  const downloadUrl = item["@microsoft.graph.downloadUrl"];
  if (!downloadUrl) {
    throw new Error("OneDrive item has no download URL");
  }

  const response = await fetchWithTimeout(downloadUrl);
  if (!response.ok) {
    throw new Error(`OneDrive download HTTP ${response.status}`);
  }
  const size = await streamResponseToFile(response, outputPath);

  return {
    contentType: response.headers.get("content-type"),
    name: item.name,
    size,
  };
}

/** Normalize Dropbox URL to force direct download. */
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

/** Download a body-link file using the appropriate strategy (non-BC sources). */
function downloadBodyLink(
  link: BodyFileLink,
  outputPath: string
): Promise<DownloadedFile> {
  switch (link.source) {
    case "onedrive":
      return downloadOneDrive(link.url, outputPath);
    case "dropbox":
      return downloadDirect(
        normalizeDropboxUrl(link.url),
        "dropbox-file",
        outputPath
      );
    case "egnyte":
      return downloadDirect(link.url, "egnyte-file", outputPath);
    default:
      throw new Error(`Unsupported body link source: ${link.source}`);
  }
}

/**
 * Download files from a BuildingConnected /goto/ URL via bc-worker API.
 *
 * One BC link can contain multiple files. The bc-worker resolves the /goto/
 * URL to an opportunity ID, lists files via the BC API, then streams each
 * download through an authenticated proxy. No base64, no memory buffering.
 *
 * Returns the number of successfully inserted attachments.
 */
async function downloadAndInsertBcLink(
  link: BodyFileLink,
  emailId: number,
  failures: LinkFailure[],
  deadlineMs: number
): Promise<number> {
  // 1. List files in the opportunity
  const listTimeout = Math.min(30_000, deadlineMs - Date.now());
  if (listTimeout <= 0) {
    throw new Error("Budget exhausted before BC file listing");
  }
  const listRes = await fetch(
    `${BC_WORKER_BASE_URL}/api/buildingconnected/files`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: link.url }),
      signal: AbortSignal.timeout(listTimeout),
    }
  );

  const listData = (await listRes.json()) as {
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
    throw new Error(listData.error ?? "No files found at BC URL");
  }

  // 2. Download each file via streaming proxy (budget-aware)
  await mkdir(BODY_LINK_STORAGE_DIR, { recursive: true });
  let inserted = 0;

  for (const file of listData.files) {
    const remaining = deadlineMs - Date.now();
    if (remaining < RUNTIME_WARNING_MS) {
      logger.warn("BC download loop stopped early — budget exhausted", {
        emailId,
        filesRemaining: listData.files.length - inserted,
        remainingMs: remaining,
      });
      break;
    }

    const attId = bodyLinkAttachmentId(
      "buildingconnected",
      `${link.url}#${file._id}`
    );
    const tmpPath = `${BODY_LINK_STORAGE_DIR}/bodylink-${emailId}-${file._id.slice(-12)}.bin`;

    try {
      const dlTimeout = Math.min(DOWNLOAD_TIMEOUT_MS, remaining - 5000);
      const dlRes = await fetch(
        `${BC_WORKER_BASE_URL}/api/buildingconnected/download`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ downloadUrl: file.downloadUrl }),
          signal: AbortSignal.timeout(dlTimeout),
        }
      );

      if (!dlRes.ok) {
        const errText = await dlRes.text().catch(() => "");
        throw new Error(
          `BC download HTTP ${dlRes.status}: ${errText.slice(0, 200)}`
        );
      }

      const size = await streamResponseToFile(dlRes, tmpPath);

      await insertAttachment({
        attachmentId: attId,
        contentType: dlRes.headers.get("content-type"),
        emailId,
        name: file.name,
        size,
        storagePath: tmpPath,
      });

      logger.info("BC file downloaded", {
        emailId,
        name: file.name,
        size,
        source: "buildingconnected",
      });
      inserted++;
    } catch (err) {
      try {
        await unlink(tmpPath);
      } catch {
        // Non-fatal cleanup
      }
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("BC file download failed", {
        emailId,
        error: msg,
        fileName: file.name,
        source: "buildingconnected",
      });
      failures.push({
        error: msg,
        source: "buildingconnected",
        url: `${link.url}#${file.name}`,
      });
    }
  }

  return inserted;
}

/** Build a deterministic attachment ID from source + URL hash. */
function bodyLinkAttachmentId(source: BodyLinkSource, url: string): string {
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 24);
  return `bodylink:${source}:${hash}`;
}

// ── Email processing ────────────────────────────────────────────

interface EmailRow {
  body_full: string | null;
  body_html: string | null;
  id: number;
  mailbox_email: string;
}

function getUnscannedEmails(limit: number): Promise<EmailRow[]> {
  return db
    .query<EmailRow, [number, number]>(
      `SELECT e.id, e.body_html, e.body_full, m.email AS mailbox_email
       FROM emails e
       JOIN mailboxes m ON e.mailbox_id = m.id
       WHERE (e.body_link_scan_status IS NULL OR e.body_link_scan_status = 'pending')
         AND (e.body_html IS NOT NULL OR e.body_full IS NOT NULL)
         AND e.received_at > now() - interval '90 days'
       ORDER BY e.received_at DESC
       LIMIT $1
       OFFSET $2`
    )
    .all(limit, 0);
}

interface LinkFailure {
  error: string;
  source: BodyLinkSource;
  url: string;
}

function deriveStatus(
  inserted: number,
  failures: LinkFailure[],
  linksFound: number
): BodyLinkScanStatus {
  if (linksFound === 0) {
    return "no_links";
  }
  if (inserted > 0) {
    return "success";
  }
  if (
    failures.some(
      (f) =>
        f.error.toLowerCase().includes("password protected") ||
        f.error.toLowerCase().includes("captcha")
    )
  ) {
    return "gated";
  }
  return "failed";
}

/** Download a single link and insert as attachment stub. Returns true on success. */
async function downloadAndInsertLink(
  link: BodyFileLink,
  emailId: number,
  failures: LinkFailure[]
): Promise<boolean> {
  const attId = bodyLinkAttachmentId(link.source, link.url);
  await mkdir(BODY_LINK_STORAGE_DIR, { recursive: true });
  const tmpPath = `${BODY_LINK_STORAGE_DIR}/bodylink-${emailId}-${attId.slice(-12)}.bin`;

  let file: DownloadedFile;
  try {
    file = await downloadBodyLink(link, tmpPath);
  } catch (downloadErr) {
    try {
      await unlink(tmpPath);
    } catch {
      // Non-fatal cleanup failure.
    }
    throw downloadErr;
  }

  try {
    await insertAttachment({
      attachmentId: attId,
      contentType: file.contentType,
      emailId,
      name: file.name,
      size: file.size,
      storagePath: tmpPath,
    });
    logger.info("Body link downloaded", {
      emailId,
      name: file.name,
      size: file.size,
      source: link.source,
    });
    return true;
  } catch (dbErr) {
    try {
      await unlink(tmpPath);
    } catch {
      // Non-fatal cleanup failure.
    }
    const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
    failures.push({ error: `db: ${msg}`, source: link.source, url: link.url });
    return false;
  }
}

function summarizeFailures(failures: LinkFailure[]): string | null {
  if (failures.length === 0) {
    return null;
  }
  return failures
    .slice(0, 3)
    .map((f) => `${f.source}: ${f.error}`)
    .join(" | ");
}

interface ProcessResult {
  failures: number;
  inserted: number;
  linksFound: number;
  status: BodyLinkScanStatus;
}

const NO_LINKS_RESULT: ProcessResult = {
  failures: 0,
  inserted: 0,
  linksFound: 0,
  status: "no_links",
};

async function processEmail(
  email: EmailRow,
  deadlineMs: number
): Promise<ProcessResult> {
  // Check if already scanned
  const state = await getBodyLinkScanState(email.id);
  if (isBodyLinkScanCompleteForVersion(state, SCAN_VERSION)) {
    return { ...NO_LINKS_RESULT, status: state?.status ?? "no_links" };
  }

  // Extract URLs
  const links = extractBodyFileLinks(
    email.body_html ?? "",
    email.body_full ?? ""
  );
  if (links.length === 0) {
    await recordBodyLinkScanResult({
      attachmentsAdded: 0,
      emailId: email.id,
      error: null,
      linksFound: 0,
      status: "no_links",
      version: SCAN_VERSION,
    });
    return NO_LINKS_RESULT;
  }

  const selected = links.slice(0, MAX_LINKS_PER_EMAIL);
  const allFailures: LinkFailure[] = [];
  let inserted = 0;

  for (const link of selected) {
    // Budget check per link — bail if time is running out
    if (deadlineMs - Date.now() < RUNTIME_WARNING_MS) {
      logger.warn("Skipping remaining links — budget exhausted", {
        emailId: email.id,
        linksRemaining: selected.length - inserted,
      });
      break;
    }

    // BC links use a separate multi-file flow (list files → stream each)
    if (link.source === "buildingconnected") {
      try {
        inserted += await downloadAndInsertBcLink(
          link,
          email.id,
          allFailures,
          deadlineMs
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn("BC link processing failed", {
          emailId: email.id,
          error: msg,
          url: link.url,
        });
        allFailures.push({ error: msg, source: link.source, url: link.url });
      }
      continue;
    }

    try {
      const ok = await downloadAndInsertLink(link, email.id, allFailures);
      if (ok) {
        inserted++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("Body link download failed", {
        emailId: email.id,
        error: msg,
        source: link.source,
        url: link.url,
      });
      allFailures.push({ error: msg, source: link.source, url: link.url });
    }
  }

  const status = deriveStatus(inserted, allFailures, links.length);
  await recordBodyLinkScanResult({
    attachmentsAdded: inserted,
    emailId: email.id,
    error: summarizeFailures(allFailures),
    linksFound: links.length,
    status,
    version: SCAN_VERSION,
  });

  return {
    failures: allFailures.length,
    inserted,
    linksFound: links.length,
    status,
  };
}

// ── Task ────────────────────────────────────────────────────────

export const bodyLinkIntake = schedules.task({
  id: "body-link-intake",
  queue: BODY_LINK_INTAKE_QUEUE,
  cron: "*/10 * * * *",
  maxDuration: 900,
  run: async () => {
    const emails = await getUnscannedEmails(BATCH_SIZE);
    if (emails.length === 0) {
      return { processed: 0, inserted: 0, noLinks: 0, failed: 0, gated: 0 };
    }

    const startedAtMs = Date.now();

    logger.info("Scanning emails for body links", { count: emails.length });

    const counts = { inserted: 0, noLinks: 0, failed: 0, gated: 0 };
    let processed = 0;

    for (const email of emails) {
      const { stop, remainingMs } = shouldStopForRuntimeBudget(startedAtMs);
      if (stop) {
        logger.warn("Body link intake stopped early to avoid max duration", {
          processed,
          total: emails.length,
          remainingMs,
        });
        break;
      }

      try {
        const deadlineMs = startedAtMs + MAX_RUNTIME_MS;
        const result = await processEmail(email, deadlineMs);
        counts.inserted += result.inserted;
        processed += 1;
        if (result.status === "no_links") {
          counts.noLinks++;
        }
        if (result.status === "failed") {
          counts.failed++;
        }
        if (result.status === "gated") {
          counts.gated++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn("Email body link scan failed", {
          emailId: email.id,
          error: msg,
        });
        processed += 1;
        counts.failed++;
      }
    }

    logger.info("Body link intake complete", { processed, ...counts });
    return { processed, ...counts };
  },
});
