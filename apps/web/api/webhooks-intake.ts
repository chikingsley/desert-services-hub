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
import { db } from "@lib/db/hub";
import { getOneDriveFileFromShareUrl } from "@lib/graph/files";

const INTAKE_DIR = join(import.meta.dir, "../../../data/intake");
const LOG = "[webhook:intake]";

/** Per-file download timeout (2 minutes) */
const DOWNLOAD_TIMEOUT_MS = 120_000;

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

const enqueueStmt = db.prepare(
  "INSERT INTO webhook_jobs (job_type, payload) VALUES ('intake', ?) RETURNING id"
);

// =============================================================================
// File Download Handlers
// =============================================================================

function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 255);
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

async function downloadOneDriveFile(
  link: FileLink,
  destDir: string
): Promise<{ path: string; filename: string }> {
  const metadata = await getOneDriveFileFromShareUrl(link.url);
  const filename = sanitizeFilename(metadata.name);
  const filePath = join(destDir, filename);

  const response = await fetchWithTimeout(
    metadata.downloadUrl,
    DOWNLOAD_TIMEOUT_MS
  );
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) throw new Error("Empty file");
  await Bun.write(filePath, buffer);

  console.log(
    `${LOG}   Downloaded ${filename} (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB) from OneDrive`
  );
  return { path: filePath, filename };
}

async function downloadEgnyteFile(
  link: FileLink,
  destDir: string
): Promise<{ path: string; filename: string }> {
  const response = await fetchWithTimeout(link.url, DOWNLOAD_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`Egnyte download failed: ${response.status}`);
  }

  let filename = "egnyte-file";
  const disposition = response.headers.get("content-disposition");
  if (disposition) {
    const match = disposition.match(/filename[^;=\n]*=(["']?)([^"';\n]+)\1/);
    if (match?.[2]) filename = match[2];
  }
  // Detect content type to add extension if missing
  const ct = response.headers.get("content-type") ?? "";
  if (!filename.includes(".")) {
    if (ct.includes("pdf")) filename += ".pdf";
    else if (ct.includes("zip")) filename += ".zip";
  }

  filename = sanitizeFilename(filename);
  const filePath = join(destDir, filename);

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) throw new Error("Empty file");
  await Bun.write(filePath, buffer);

  console.log(
    `${LOG}   Downloaded ${filename} (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB) from Egnyte`
  );
  return { path: filePath, filename };
}

async function downloadDropboxFile(
  link: FileLink,
  destDir: string
): Promise<{ path: string; filename: string }> {
  // Convert share link to direct download
  let downloadUrl = link.url;
  if (downloadUrl.includes("dropbox.com")) {
    downloadUrl = downloadUrl.replace(/[?&]dl=0/, "?dl=1");
    if (!downloadUrl.includes("dl=1")) {
      downloadUrl +=
        (downloadUrl.includes("?") ? "&" : "?") + "dl=1";
    }
  }

  const response = await fetchWithTimeout(downloadUrl, DOWNLOAD_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`Dropbox download failed: ${response.status}`);
  }

  let filename = "dropbox-file";
  const disposition = response.headers.get("content-disposition");
  if (disposition) {
    const match = disposition.match(/filename[^;=\n]*=(["']?)([^"';\n]+)\1/);
    if (match?.[2]) filename = match[2];
  }
  filename = sanitizeFilename(filename);
  const filePath = join(destDir, filename);

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) throw new Error("Empty file");
  await Bun.write(filePath, buffer);

  console.log(
    `${LOG}   Downloaded ${filename} (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB) from Dropbox`
  );
  return { path: filePath, filename };
}

async function downloadFileLink(
  link: FileLink,
  destDir: string
): Promise<{ path: string; filename: string } | null> {
  try {
    switch (link.source) {
      case "onedrive":
        return await downloadOneDriveFile(link, destDir);
      case "egnyte":
        return await downloadEgnyteFile(link, destDir);
      case "dropbox":
        return await downloadDropboxFile(link, destDir);
    }
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

export async function handleIntakeWebhook(
  req: Request
): Promise<Response> {
  let body: IncomingPayload;
  try {
    body = (await req.json()) as IncomingPayload;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const hasAttachments = (body.attachments?.length ?? 0) > 0;
  const hasLinks = (body.fileLinks?.length ?? 0) > 0;
  const hasBody = body.bodyHasContent === true;

  if (!hasAttachments && !hasLinks && !hasBody) {
    return Response.json(
      { error: "No attachments, links, or body content provided" },
      { status: 400 }
    );
  }

  // Create job directory
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const jobDir = join(INTAKE_DIR, jobId);
  await mkdir(jobDir, { recursive: true });

  // Save direct attachments to disk
  const attachmentPaths: string[] = [];
  for (const att of body.attachments ?? []) {
    const filePath = join(jobDir, att.filename);
    const buffer = Buffer.from(att.content, "base64");
    await Bun.write(filePath, buffer);
    attachmentPaths.push(filePath);
  }

  // Download linked files
  let downloadedCount = 0;
  for (const link of body.fileLinks ?? []) {
    const result = await downloadFileLink(link, jobDir);
    if (result) {
      attachmentPaths.push(result.path);
      downloadedCount++;
    }
  }

  if (hasLinks) {
    console.log(
      `${LOG} Downloaded ${downloadedCount}/${body.fileLinks?.length ?? 0} linked file(s)`
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
