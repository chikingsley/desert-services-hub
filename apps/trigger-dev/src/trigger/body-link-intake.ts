/**
 * Body Link Intake — Trigger.dev scheduled task
 *
 * Scans email bodies for file-sharing URLs and downloads the files.
 * Supported platforms:
 *   - OneDrive / SharePoint (resolved via Graph API)
 *   - Dropbox (direct download with dl=1)
 *   - Egnyte (direct download)
 *   - BuildingConnected (delegated to bc-worker container via Playwright)
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
import { db } from "@lib/db/client";
import { insertAttachment } from "@lib/db/repositories/attachment";
import {
  getBodyLinkScanState,
  isBodyLinkScanCompleteForVersion,
  recordBodyLinkScanResult,
} from "@lib/db/repositories/email";
import type { BodyLinkScanStatus } from "@lib/db/types";
import { logger, schedules } from "@trigger.dev/sdk";
import { graphGet } from "./graph";

const BATCH_SIZE = 500;
const SCAN_VERSION = 1;
const MAX_LINKS_PER_EMAIL = 12;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const BODY_LINK_STORAGE_DIR =
  process.env.EMAIL_BODY_LINK_STORAGE_DIR?.trim() ||
  "/app/data/attachments/body-links";

const BC_WORKER_BASE_URL =
  process.env.BC_WORKER_BASE_URL?.trim() || "http://bc-worker:47824";

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
  buffer: Buffer;
  contentType: string | null;
  name: string;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = DOWNLOAD_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
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

/** Download a file via direct HTTP. Rejects if response is HTML. */
async function downloadDirect(
  url: string,
  fallbackName: string
): Promise<DownloadedFile> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type");
  if (isHtmlResponse(contentType)) {
    throw new Error("URL resolved to HTML page instead of downloadable file");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new Error("Downloaded file is empty");
  }
  return {
    buffer,
    contentType,
    name: filenameFromResponse(response, fallbackName),
  };
}

/** Resolve a OneDrive/SharePoint share URL via Graph API → direct download. */
async function downloadOneDrive(url: string): Promise<DownloadedFile> {
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
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new Error("OneDrive file is empty");
  }
  return {
    buffer,
    contentType: response.headers.get("content-type"),
    name: item.name,
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

/** Download from BuildingConnected via bc-worker's Playwright endpoint. */
async function downloadBuildingConnected(url: string): Promise<DownloadedFile> {
  const response = await fetch(
    `${BC_WORKER_BASE_URL}/api/buildingconnected/download`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }
  );

  const result = (await response.json()) as {
    data?: string;
    error?: string;
    name?: string;
    pageTitle?: string;
    size?: number;
    success: boolean;
  };

  if (!result.success) {
    throw new Error(result.error ?? "bc-worker download failed");
  }
  if (!(result.data && result.name)) {
    throw new Error("bc-worker returned no file data");
  }

  return {
    buffer: Buffer.from(result.data, "base64"),
    contentType: null,
    name: result.name,
  };
}

/** Download a body-link file using the appropriate strategy. */
function downloadBodyLink(link: BodyFileLink): Promise<DownloadedFile> {
  switch (link.source) {
    case "onedrive":
      return downloadOneDrive(link.url);
    case "dropbox":
      return downloadDirect(normalizeDropboxUrl(link.url), "dropbox-file");
    case "egnyte":
      return downloadDirect(link.url, "egnyte-file");
    case "buildingconnected":
      return downloadBuildingConnected(link.url);
    default:
      throw new Error(`Unsupported body link source: ${link.source}`);
  }
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
  const file = await downloadBodyLink(link);
  const attId = bodyLinkAttachmentId(link.source, link.url);

  const ext = file.name.includes(".")
    ? (file.name.split(".").pop()?.toLowerCase() ?? "bin")
    : "bin";
  await mkdir(BODY_LINK_STORAGE_DIR, { recursive: true });
  const tmpPath = `${BODY_LINK_STORAGE_DIR}/bodylink-${emailId}-${attId.slice(-12)}.${ext}`;
  await Bun.write(tmpPath, file.buffer);

  try {
    await insertAttachment({
      attachmentId: attId,
      contentType: file.contentType,
      emailId,
      name: file.name,
      size: file.buffer.byteLength,
      storagePath: tmpPath,
    });
    logger.info("Body link downloaded", {
      emailId,
      name: file.name,
      size: file.buffer.byteLength,
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

async function processEmail(email: EmailRow): Promise<ProcessResult> {
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
  cron: "*/10 * * * *",
  maxDuration: 480,
  run: async () => {
    const emails = await getUnscannedEmails(BATCH_SIZE);
    if (emails.length === 0) {
      return { processed: 0, inserted: 0, noLinks: 0, failed: 0, gated: 0 };
    }

    logger.info("Scanning emails for body links", { count: emails.length });

    const counts = { inserted: 0, noLinks: 0, failed: 0, gated: 0 };

    for (const email of emails) {
      try {
        const result = await processEmail(email);
        counts.inserted += result.inserted;
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
        counts.failed++;
      }
    }

    const processed = emails.length;
    logger.info("Body link intake complete", { processed, ...counts });
    return { processed, ...counts };
  },
});
