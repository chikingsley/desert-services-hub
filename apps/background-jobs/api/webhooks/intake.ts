/**
 * Intake Webhook Handler
 *
 * Route: POST /api/webhooks/intake
 *
 * Receives forwarded email data from the Cloudflare intake-worker.
 * Saves attachments to disk, downloads files from sharing links
 * (OneDrive, Egnyte, Dropbox), and enqueues an intake job for processing.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@lib/db/client";
import {
  downloadDropboxFile,
  downloadEgnyteFile,
  downloadOneDriveFile,
} from "@lib/downloads/providers";
import type { BodyFileLink, BodyLinkSource } from "@lib/downloads/types";
import {
  ensureFilenameExtension,
  sanitizeFilename,
} from "@lib/downloads/utils";

const INTAKE_DIR =
  process.env.INTAKE_DIR?.trim() ||
  join(import.meta.dir, "../../../../data/intake");
const LOG = "[webhook:intake]";

// =============================================================================
// Types
// =============================================================================

interface IncomingAttachment {
  filename: string;
  contentType: string;
  size: number;
  content: string; // base64
}

interface FileLink {
  url: string;
  source: "onedrive" | "egnyte" | "dropbox";
}

interface IncomingPayload {
  forwarderEmail: string;
  forwardedAt: string;
  originalSubject: string;
  originalFrom: string;
  bodyText: string;
  bodyHasContent?: boolean;
  attachments: IncomingAttachment[];
  fileLinks?: FileLink[];
}

const enqueueStmt = db.query(
  "SELECT public.enqueue_background_job('intake', ($1::text)::jsonb, NULL, 3, FALSE)::bigint AS id"
);

// =============================================================================
// File Download Handlers
// =============================================================================

function toBodyFileLink(link: FileLink): BodyFileLink {
  return { source: link.source as BodyLinkSource, url: link.url };
}

async function downloadFileLink(
  link: FileLink,
  destDir: string
): Promise<{ path: string; filename: string } | null> {
  try {
    const bodyLink = toBodyFileLink(link);
    let downloaded: Awaited<ReturnType<typeof downloadOneDriveFile>>;
    switch (link.source) {
      case "onedrive":
        downloaded = await downloadOneDriveFile(bodyLink, destDir);
        break;
      case "egnyte":
        downloaded = await downloadEgnyteFile(bodyLink, destDir);
        break;
      case "dropbox":
        downloaded = await downloadDropboxFile(bodyLink, destDir);
        break;
      default:
        return null;
    }
    console.log(
      `${LOG}   Downloaded ${downloaded.name} (${(downloaded.size / 1024 / 1024).toFixed(1)}MB) from ${link.source}`
    );
    return { path: downloaded.storagePath, filename: downloaded.name };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG}   Failed to download ${link.source} file: ${msg}`);
    console.error(`${LOG}     URL: ${link.url}`);
    return null;
  }
}

// =============================================================================
// Main Handler
// =============================================================================

async function saveAttachmentsToDisk(
  attachments: IncomingAttachment[],
  jobDir: string
): Promise<string[]> {
  const paths: string[] = [];
  for (const att of attachments) {
    const filename = sanitizeFilename(
      ensureFilenameExtension(att.filename || "attachment", att.contentType),
      "-"
    );
    const filePath = join(jobDir, filename);
    const buffer = Buffer.from(att.content, "base64");
    await Bun.write(filePath, buffer);
    paths.push(filePath);
  }
  return paths;
}

async function downloadFileLinks(
  links: FileLink[],
  jobDir: string
): Promise<string[]> {
  const paths: string[] = [];
  for (const link of links) {
    const result = await downloadFileLink(link, jobDir);
    if (result) {
      paths.push(result.path);
    }
  }
  return paths;
}

export async function handleIntakeWebhook(req: Request): Promise<Response> {
  let body: IncomingPayload;
  try {
    body = (await req.json()) as IncomingPayload;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const hasAttachments = (body.attachments?.length ?? 0) > 0;
  const hasLinks = (body.fileLinks?.length ?? 0) > 0;
  const hasBody = body.bodyHasContent === true;

  if (!(hasAttachments || hasLinks || hasBody)) {
    return Response.json(
      { error: "No attachments, links, or body content provided" },
      { status: 400 }
    );
  }

  // Create job directory
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const jobDir = join(INTAKE_DIR, jobId);
  await mkdir(jobDir, { recursive: true });

  const attachmentPaths = await saveAttachmentsToDisk(
    body.attachments ?? [],
    jobDir
  );

  const downloadedPaths = await downloadFileLinks(body.fileLinks ?? [], jobDir);
  attachmentPaths.push(...downloadedPaths);

  if (hasLinks) {
    console.log(
      `${LOG} Downloaded ${downloadedPaths.length}/${body.fileLinks?.length ?? 0} linked file(s)`
    );
  }

  // Save body text as a file if it has meaningful content
  if (hasBody && body.bodyText.trim().length > 0) {
    const bodyPath = join(jobDir, "email-body.txt");
    await Bun.write(bodyPath, body.bodyText);
    attachmentPaths.push(bodyPath);
  }

  // Enqueue job
  const payload = JSON.stringify({
    originalSubject: body.originalSubject ?? "",
    originalFrom: body.originalFrom ?? "",
    bodyText: body.bodyText ?? "",
    attachmentPaths,
    forwarderEmail: body.forwarderEmail ?? "",
  });

  const row = (await enqueueStmt.get(payload)) as { id: number } | null;
  const jobDbId = row?.id ?? null;

  console.log(
    `${LOG} Enqueued job #${jobDbId}: ${attachmentPaths.length} file(s) from "${body.originalSubject}"`
  );

  return Response.json(
    { ok: true, jobId: jobDbId, files: attachmentPaths.length },
    { status: 202 }
  );
}
