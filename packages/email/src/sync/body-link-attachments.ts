/**
 * Body link attachment orchestration — extracts sharing links from email bodies,
 * downloads files via providers or Playwright fallback, and reports results.
 *
 * Utilities live in @lib/downloads/*; this module is the email-sync-specific workflow.
 */
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { extractBodyFileLinks } from "@lib/downloads/extract-links";
import { downloadDirectFile } from "@lib/downloads/fetch";
import { downloadOneDriveFile } from "@lib/downloads/providers";
import type {
  BodyFileLink,
  BodyLinkDownloadFailure,
  BodyLinkDownloadReport,
  BodyLinkSource,
  DownloadBodyLinkAttachmentsInput,
  DownloadedBodyLinkAttachment,
  DownloadedFile,
} from "@lib/downloads/types";
import {
  normalizeDropboxDownloadUrl,
  sanitizePathSegment,
} from "@lib/downloads/utils";
import {
  isDropboxFolderUrl,
  type PlaywrightDownloadedFile,
  tryPlaywrightFallbackDownload,
} from "./body-link-playwright-download";

const LOG = "[email:body-links]";
const BODY_LINK_ATTACHMENTS_DIR =
  process.env.EMAIL_BODY_LINK_DIR?.trim() || "/app/data/attachments/body-links";
const DEFAULT_MAX_LINKS = 12;

type LocalDownloadedFile = DownloadedFile | PlaywrightDownloadedFile;

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

function buildBodyLinkAttachmentId(
  source: BodyLinkSource,
  url: string
): string {
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 24);
  return `bodylink:${source}:${hash}`;
}

async function downloadEgnyteFile(
  link: BodyFileLink,
  destDir: string
): Promise<LocalDownloadedFile> {
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

async function downloadDropboxFile(
  link: BodyFileLink,
  destDir: string
): Promise<LocalDownloadedFile> {
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
): Promise<LocalDownloadedFile> {
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
