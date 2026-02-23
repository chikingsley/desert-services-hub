/**
 * Intake Webhook Handler
 *
 * Route: POST /api/webhooks/intake
 *
 * Receives forwarded email data from the Cloudflare intake-worker.
 * Saves attachments to disk and enqueues an intake job for processing.
 *
 * File-sharing links (OneDrive, Egnyte, Dropbox) in email bodies are
 * now handled by the Trigger.dev body-link-intake task, which scans
 * email bodies for URLs and downloads them separately.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@lib/db/client";
import { z } from "zod";

const INTAKE_DIR =
  process.env.INTAKE_DIR?.trim() ||
  join(import.meta.dir, "../../../../data/intake");
const LOG = "[webhook:intake]";

const INVALID_FILENAME_CHARS_RE = /[/\\?%*:|"<>]/g;
const LEADING_DOTS_RE = /^\.+/;

function sanitizeFilename(name: string, replacer = "_"): string {
  const clean = name
    .replace(INVALID_FILENAME_CHARS_RE, replacer)
    .replace(LEADING_DOTS_RE, "")
    .trim()
    .slice(0, 255);
  return clean.length > 0 ? clean : "file";
}

function extensionFromContentType(contentType: string | null): string {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("pdf")) return ".pdf";
  if (ct.includes("zip")) return ".zip";
  if (ct.includes("csv")) return ".csv";
  if (ct.includes("plain")) return ".txt";
  if (ct.includes("png")) return ".png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return ".jpg";
  if (ct.includes("sheet")) return ".xlsx";
  if (ct.includes("wordprocessingml")) return ".docx";
  if (ct.includes("presentationml")) return ".pptx";
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

// ── Schemas ─────────────────────────────────────────────────────

const incomingAttachmentSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
  size: z.number(),
  content: z.string(),
});

const intakePayloadSchema = z.object({
  forwarderEmail: z.string(),
  forwardedAt: z.string(),
  originalSubject: z.string(),
  originalFrom: z.string(),
  bodyText: z.string(),
  bodyHasContent: z.boolean().optional(),
  attachments: z.array(incomingAttachmentSchema).catch([]),
  fileLinks: z
    .array(z.object({ url: z.string(), source: z.string() }))
    .optional(),
});

type IncomingAttachment = z.infer<typeof incomingAttachmentSchema>;

const enqueueStmt = db.query(
  "SELECT public.enqueue_background_job('intake', ($1::text)::jsonb, NULL, 3, FALSE)::bigint AS id"
);

// ── Helpers ─────────────────────────────────────────────────────

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

// ── Handler ─────────────────────────────────────────────────────

export async function handleIntakeWebhook(req: Request): Promise<Response> {
  const parsed = intakePayloadSchema.safeParse(
    await req.json().catch(() => null)
  );
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    );
  }
  const body = parsed.data;

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

  // File links (OneDrive, Egnyte, Dropbox) are now handled by
  // the Trigger.dev body-link-intake task after email sync.
  if (hasLinks) {
    console.log(
      `${LOG} ${body.fileLinks?.length ?? 0} file link(s) detected — will be processed by body-link-intake task`
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
