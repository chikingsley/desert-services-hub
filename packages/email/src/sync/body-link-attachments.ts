// biome-ignore lint/nursery/noExcessiveLinesPerFile: Consolidates extraction and download strategy for email body links.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { getOneDriveFileFromShareUrl } from "@lib/graph/files";
import {
  isDropboxFolderUrl,
  type PlaywrightDownloadedFile,
  tryPlaywrightFallbackDownload,
} from "./body-link-playwright-download";

const LOG = "[email:body-links]";
const BODY_LINK_ATTACHMENTS_DIR =
  process.env.EMAIL_BODY_LINK_DIR?.trim() || "/app/data/attachments/body-links";
const DOWNLOAD_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_LINKS = 12;

const ONEDRIVE_RE =
  /https:\/\/(?:(?:[^\s"<>]*sharepoint\.com)|(?:www\.)?onedrive\.live\.com)\/[^\s"<>]*/gi;
const EGNYTE_RE = /https:\/\/[^\s"<>]+\.egnyte\.com\/fl\/[^\s"<>]*/gi;
const DROPBOX_RE = /https:\/\/(?:www\.)?dropbox\.com\/[^\s"<>]*/gi;
const BUILDINGCONNECTED_RE =
  /https:\/\/app\.buildingconnected\.com\/goto\/[^\s"<>]*/gi;

const TRAILING_URL_ARTIFACT_PATTERN = /['">\s\]),.;]+$/;
const SHAREPOINT_COLON_PATH_RE = /\/:[a-z]:\//;
const CONTENT_DISPOSITION_FILENAME_PATTERN =
  /filename[^;=\n]*=(["']?)([^"';\n]+)\1/i;
const CONTENT_DISPOSITION_UTF8_FILENAME_PATTERN =
  /filename\*\s*=\s*UTF-8''([^;]+)/i;
const INVALID_FILENAME_CHARS_PATTERN = /[/\\?%*:|"<>]/g;
const LEADING_DOTS_PATTERN = /^\.+/;
const DROPBOX_DL0_PATTERN = /[?&]dl=0/;

export type BodyLinkSource =
  | "onedrive"
  | "egnyte"
  | "dropbox"
  | "buildingconnected";

export interface BodyFileLink {
  source: BodyLinkSource;
  url: string;
}

export interface DownloadedBodyLinkAttachment {
  attachmentId: string;
  source: BodyLinkSource;
  sourceUrl: string;
  name: string;
  contentType: string | null;
  size: number;
  storagePath: string;
}

export interface BodyLinkDownloadFailure {
  error: string;
  source: BodyLinkSource;
  url: string;
}

export interface BodyLinkDownloadReport {
  attachments: DownloadedBodyLinkAttachment[];
  failures: BodyLinkDownloadFailure[];
  linksAttempted: number;
  linksFound: number;
}

type DownloadedFile = PlaywrightDownloadedFile;

export interface DownloadBodyLinkAttachmentsInput {
  bodyHtml?: string | null;
  bodyText?: string | null;
  emailId: number;
  mailboxEmail: string;
  maxLinks?: number;
}

function buildFallbackError(
  directError: unknown,
  fallbackLastError: string | null
): string {
  if (fallbackLastError) {
    return fallbackLastError;
  }
  return directError instanceof Error
    ? directError.message
    : String(directError);
}

function sanitizeFilename(name: string): string {
  const clean = name
    .replace(INVALID_FILENAME_CHARS_PATTERN, "_")
    .replace(LEADING_DOTS_PATTERN, "")
    .trim()
    .slice(0, 255);
  return clean.length > 0 ? clean : "file";
}

function sanitizePathSegment(name: string): string {
  return sanitizeFilename(name.toLowerCase().replaceAll("@", "_at_"));
}

function extensionFromContentType(contentType: string | null): string {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("pdf")) {
    return ".pdf";
  }
  if (ct.includes("zip")) {
    return ".zip";
  }
  if (ct.includes("csv")) {
    return ".csv";
  }
  if (ct.includes("plain")) {
    return ".txt";
  }
  if (ct.includes("png")) {
    return ".png";
  }
  if (ct.includes("jpeg") || ct.includes("jpg")) {
    return ".jpg";
  }
  if (ct.includes("gif")) {
    return ".gif";
  }
  if (ct.includes("tiff")) {
    return ".tiff";
  }
  if (ct.includes("webp")) {
    return ".webp";
  }
  if (ct.includes("sheet")) {
    return ".xlsx";
  }
  if (ct.includes("wordprocessingml")) {
    return ".docx";
  }
  if (ct.includes("presentationml")) {
    return ".pptx";
  }
  return "";
}

function ensureFilenameExtension(
  filename: string,
  contentType: string | null
): string {
  if (filename.includes(".")) {
    return filename;
  }
  const ext = extensionFromContentType(contentType);
  return ext ? `${filename}${ext}` : filename;
}

function isLikelyOneDriveShareUrl(url: string): boolean {
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

function isLikelyBuildingConnectedGotoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("app.buildingconnected.com/goto/");
}

function normalizeMatchedUrl(raw: string): string {
  return raw
    .replace(TRAILING_URL_ARTIFACT_PATTERN, "")
    .replaceAll(/&amp;/gi, "&");
}

function extractUrlMatches(
  combined: string,
  pattern: RegExp,
  source: BodyLinkSource,
  shouldKeep: (url: string) => boolean,
  links: BodyFileLink[],
  seen: Set<string>
): void {
  for (const match of combined.matchAll(pattern)) {
    const url = normalizeMatchedUrl(match[0]);
    if (!shouldKeep(url) || seen.has(url)) {
      continue;
    }
    seen.add(url);
    links.push({ source, url });
  }
}

export function extractBodyFileLinks(
  html: string,
  text: string
): BodyFileLink[] {
  const combined = `${html || ""}\n${text || ""}`;
  const links: BodyFileLink[] = [];
  const seen = new Set<string>();

  extractUrlMatches(
    combined,
    ONEDRIVE_RE,
    "onedrive",
    isLikelyOneDriveShareUrl,
    links,
    seen
  );
  extractUrlMatches(combined, EGNYTE_RE, "egnyte", () => true, links, seen);
  extractUrlMatches(combined, DROPBOX_RE, "dropbox", () => true, links, seen);
  extractUrlMatches(
    combined,
    BUILDINGCONNECTED_RE,
    "buildingconnected",
    isLikelyBuildingConnectedGotoUrl,
    links,
    seen
  );

  return links;
}

function buildBodyLinkAttachmentId(
  source: BodyLinkSource,
  url: string
): string {
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 24);
  return `bodylink:${source}:${hash}`;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

function isHtmlResponse(contentType: string | null): boolean {
  return (contentType ?? "").toLowerCase().includes("text/html");
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseContentDispositionFilename(
  disposition: string | null
): string | null {
  if (!disposition) {
    return null;
  }

  const utf8Match = disposition.match(
    CONTENT_DISPOSITION_UTF8_FILENAME_PATTERN
  );
  if (utf8Match?.[1]) {
    return safeDecodeURIComponent(utf8Match[1]);
  }

  const simpleMatch = disposition.match(CONTENT_DISPOSITION_FILENAME_PATTERN);
  if (simpleMatch?.[2]) {
    return simpleMatch[2];
  }

  return null;
}

function filenameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const fromQuery =
      parsed.searchParams.get("filename") ?? parsed.searchParams.get("file");
    if (fromQuery) {
      return safeDecodeURIComponent(fromQuery);
    }

    const fromPath = basename(parsed.pathname);
    if (fromPath && fromPath !== "/" && fromPath !== ".") {
      return safeDecodeURIComponent(fromPath);
    }
  } catch {
    return null;
  }

  return null;
}

function buildUniquePath(destDir: string, filename: string): string {
  const clean = sanitizeFilename(filename);
  const dot = clean.lastIndexOf(".");
  const base = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : "";

  let candidate = join(destDir, clean);
  let suffix = 1;

  while (existsSync(candidate)) {
    candidate = join(destDir, `${base}-${suffix}${ext}`);
    suffix++;
  }

  return candidate;
}

async function writeUniqueFile(
  destDir: string,
  filename: string,
  buffer: Buffer
): Promise<string> {
  const candidate = buildUniquePath(destDir, filename);

  await Bun.write(candidate, buffer);
  return candidate;
}

async function downloadDirectFile(params: {
  allowHtmlResponse?: boolean;
  destDir: string;
  fallbackFilename: string;
  url: string;
}): Promise<DownloadedFile> {
  const response = await fetchWithTimeout(params.url, DOWNLOAD_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`download failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type");
  if (isHtmlResponse(contentType) && !params.allowHtmlResponse) {
    throw new Error("URL resolved to HTML page instead of downloadable file");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new Error("downloaded file is empty");
  }

  const candidate =
    parseContentDispositionFilename(
      response.headers.get("content-disposition")
    ) ||
    filenameFromUrl(params.url) ||
    params.fallbackFilename;
  const filename = ensureFilenameExtension(candidate, contentType);
  const storagePath = await writeUniqueFile(params.destDir, filename, buffer);

  return {
    contentType,
    name: basename(storagePath),
    size: buffer.byteLength,
    storagePath,
  };
}

async function downloadOneDriveFile(
  link: BodyFileLink,
  destDir: string
): Promise<DownloadedFile> {
  const metadata = await getOneDriveFileFromShareUrl(link.url);
  const response = await fetchWithTimeout(
    metadata.downloadUrl,
    DOWNLOAD_TIMEOUT_MS
  );
  if (!response.ok) {
    throw new Error(`OneDrive download failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new Error("OneDrive file is empty");
  }

  const filename = ensureFilenameExtension(metadata.name, contentType);
  const storagePath = await writeUniqueFile(destDir, filename, buffer);

  return {
    contentType,
    name: basename(storagePath),
    size: buffer.byteLength,
    storagePath,
  };
}

async function downloadEgnyteFile(
  link: BodyFileLink,
  destDir: string
): Promise<DownloadedFile> {
  const fallbackFilename = "egnyte-file";
  try {
    return await downloadDirectFile({
      url: link.url,
      destDir,
      fallbackFilename,
    });
  } catch (directError) {
    const fallback = await tryPlaywrightFallbackDownload({
      source: "egnyte",
      url: link.url,
      destDir,
      fallbackFilename,
    });
    if (fallback.file) {
      return fallback.file;
    }
    throw new Error(buildFallbackError(directError, fallback.lastError));
  }
}

function normalizeDropboxDownloadUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.set("dl", "1");
    return parsed.toString();
  } catch {
    let fallback = rawUrl.replace(DROPBOX_DL0_PATTERN, "?dl=1");
    if (!fallback.includes("dl=1")) {
      fallback += `${fallback.includes("?") ? "&" : "?"}dl=1`;
    }
    return fallback;
  }
}

async function downloadDropboxFile(
  link: BodyFileLink,
  destDir: string
): Promise<DownloadedFile> {
  const downloadUrl = link.url.includes("dropbox.com")
    ? normalizeDropboxDownloadUrl(link.url)
    : link.url;
  const fallbackFilename = isDropboxFolderUrl(link.url)
    ? "dropbox-folder.zip"
    : "dropbox-file";

  try {
    return await downloadDirectFile({
      url: downloadUrl,
      destDir,
      fallbackFilename,
    });
  } catch (directError) {
    const fallback = await tryPlaywrightFallbackDownload({
      source: "dropbox",
      url: downloadUrl,
      destDir,
      fallbackFilename,
    });
    if (fallback.file) {
      return fallback.file;
    }
    throw new Error(buildFallbackError(directError, fallback.lastError));
  }
}

async function downloadBuildingConnectedFile(
  link: BodyFileLink,
  destDir: string
): Promise<DownloadedFile> {
  const fallbackFilename = "buildingconnected-package";
  try {
    return await downloadDirectFile({
      url: link.url,
      destDir,
      fallbackFilename,
    });
  } catch (directError) {
    const fallback = await tryPlaywrightFallbackDownload({
      source: "buildingconnected",
      url: link.url,
      destDir,
      fallbackFilename,
    });
    if (fallback.file) {
      return fallback.file;
    }
    throw new Error(buildFallbackError(directError, fallback.lastError));
  }
}

function downloadBodyLinkFile(link: BodyFileLink, destDir: string) {
  switch (link.source) {
    case "onedrive":
      return downloadOneDriveFile(link, destDir);
    case "egnyte":
      return downloadEgnyteFile(link, destDir);
    case "dropbox":
      return downloadDropboxFile(link, destDir);
    case "buildingconnected":
      return downloadBuildingConnectedFile(link, destDir);
    default:
      return null;
  }
}

export async function downloadBodyLinkAttachments(
  input: DownloadBodyLinkAttachmentsInput
): Promise<DownloadedBodyLinkAttachment[]> {
  const result = await downloadBodyLinkAttachmentsWithReport(input);
  return result.attachments;
}

export async function downloadBodyLinkAttachmentsWithReport(
  input: DownloadBodyLinkAttachmentsInput
): Promise<BodyLinkDownloadReport> {
  const links = extractBodyFileLinks(
    input.bodyHtml ?? "",
    input.bodyText ?? ""
  );
  if (links.length === 0) {
    return {
      attachments: [],
      failures: [],
      linksAttempted: 0,
      linksFound: 0,
    };
  }

  const maxLinks = Math.max(1, input.maxLinks ?? DEFAULT_MAX_LINKS);
  const selected = links.slice(0, maxLinks);
  const destDir = join(
    BODY_LINK_ATTACHMENTS_DIR,
    sanitizePathSegment(input.mailboxEmail),
    String(input.emailId)
  );
  await mkdir(destDir, { recursive: true });

  const attachments: DownloadedBodyLinkAttachment[] = [];
  const failures: BodyLinkDownloadFailure[] = [];
  for (const link of selected) {
    try {
      const downloaded = await downloadBodyLinkFile(link, destDir);
      if (!downloaded) {
        continue;
      }

      attachments.push({
        attachmentId: buildBodyLinkAttachmentId(link.source, link.url),
        source: link.source,
        sourceUrl: link.url,
        name: downloaded.name,
        contentType: downloaded.contentType,
        size: downloaded.size,
        storagePath: downloaded.storagePath,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `${LOG} Failed ${link.source} body link for email ${input.emailId}: ${message}`
      );
      console.warn(`${LOG} URL: ${link.url}`);
      failures.push({
        error: message,
        source: link.source,
        url: link.url,
      });
    }
  }

  return {
    attachments,
    failures,
    linksAttempted: selected.length,
    linksFound: links.length,
  };
}
