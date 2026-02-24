/**
 * Intake Webhook Handler
 *
 * Route: POST /api/webhooks/intake
 *
 * Receives forwarded email data from the Cloudflare intake-worker.
 * Saves attachments to disk (audit trail) and triggers the Trigger.dev
 * document-intake task for processing.
 *
 * File-sharing links (OneDrive, Egnyte, Dropbox) in email bodies are
 * handled by the Trigger.dev body-link-intake task, which scans
 * email bodies for URLs and downloads them separately.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const INTAKE_DIR =
  process.env.INTAKE_DIR?.trim() ||
  join(import.meta.dir, "../../../../data/intake");
const LOG = "[webhook:intake]";

const TRIGGER_API_URL =
  process.env.TRIGGER_API_URL?.trim() || "http://localhost:8030";
const TRIGGER_SECRET_KEY = process.env.TRIGGER_SECRET_KEY?.trim() || "";

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

// ── Trigger.dev API helper ──────────────────────────────────────

interface TriggerFile {
  contentBase64: string;
  filename: string;
}

async function triggerDocumentIntake(payload: {
  originalSubject: string;
  originalFrom: string;
  bodyText: string;
  forwarderEmail: string;
  files: TriggerFile[];
}): Promise<string | null> {
  const response = await fetch(
    `${TRIGGER_API_URL}/api/v1/tasks/document-intake/trigger`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TRIGGER_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload, options: {} }),
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Trigger.dev API ${response.status}: ${text.slice(0, 200)}`
    );
  }

  const result = (await response.json()) as { id?: string };
  return result.id ?? null;
}

// ── Helpers ─────────────────────────────────────────────────────

async function saveAttachmentsToDisk(
  attachments: IncomingAttachment[],
  jobDir: string
): Promise<void> {
  for (const att of attachments) {
    const filename = sanitizeFilename(
      ensureFilenameExtension(att.filename || "attachment", att.contentType),
      "-"
    );
    const filePath = join(jobDir, filename);
    const buffer = Buffer.from(att.content, "base64");
    await Bun.write(filePath, buffer);
  }
}

function buildTriggerFiles(
  attachments: IncomingAttachment[],
  bodyText: string | null
): TriggerFile[] {
  const files: TriggerFile[] = [];

  for (const att of attachments) {
    const filename = sanitizeFilename(
      ensureFilenameExtension(att.filename || "attachment", att.contentType),
      "-"
    );
    files.push({ filename, contentBase64: att.content });
  }

  // Include body text as a file if it has meaningful content
  if (bodyText && bodyText.trim().length > 0) {
    files.push({
      filename: "email-body.txt",
      contentBase64: Buffer.from(bodyText).toString("base64"),
    });
  }

  return files;
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

  // Save to disk for audit trail
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const jobDir = join(INTAKE_DIR, jobId);
  await mkdir(jobDir, { recursive: true });
  await saveAttachmentsToDisk(body.attachments ?? [], jobDir);

  if (hasBody && body.bodyText.trim().length > 0) {
    await Bun.write(join(jobDir, "email-body.txt"), body.bodyText);
  }

  // File links (OneDrive, Egnyte, Dropbox) are handled by
  // the Trigger.dev body-link-intake task after email sync.
  if (hasLinks) {
    console.log(
      `${LOG} ${body.fileLinks?.length ?? 0} file link(s) detected — will be processed by body-link-intake task`
    );
  }

  // Build file list and trigger Trigger.dev task
  const files = buildTriggerFiles(
    body.attachments ?? [],
    hasBody ? body.bodyText : null
  );

  if (files.length === 0) {
    console.log(`${LOG} No processable files — skipping task trigger`);
    return Response.json({ ok: true, files: 0 }, { status: 200 });
  }

  const runId = await triggerDocumentIntake({
    originalSubject: body.originalSubject ?? "",
    originalFrom: body.originalFrom ?? "",
    bodyText: body.bodyText ?? "",
    forwarderEmail: body.forwarderEmail ?? "",
    files,
  });

  console.log(
    `${LOG} Triggered document-intake run ${runId}: ${files.length} file(s) from "${body.originalSubject}"`
  );

  return Response.json(
    { ok: true, runId, files: files.length },
    { status: 202 }
  );
}
