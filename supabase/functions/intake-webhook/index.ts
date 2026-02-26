/* global Deno */

interface IncomingAttachment {
  content: string;
  contentType: string;
  filename: string;
  size: number;
}

interface FileLink {
  source: "onedrive" | "egnyte" | "dropbox";
  url: string;
}

interface IncomingPayload {
  attachments: IncomingAttachment[];
  bodyHasContent?: boolean;
  bodyText: string;
  fileLinks?: FileLink[];
  forwardedAt: string;
  forwarderEmail: string;
  originalFrom: string;
  originalSubject: string;
}

interface TriggerFile {
  contentBase64: string;
  filename: string;
}

interface TriggerPayload {
  bodyText: string;
  files: TriggerFile[];
  forwarderEmail: string;
  originalFrom: string;
  originalSubject: string;
}

interface IntakeWebhookEnv {
  triggerApiUrl: string;
  triggerSecretKey: string;
}

const INVALID_FILENAME_CHARS_RE = /[/\\?%*:|"<>]/g;
const LEADING_DOTS_RE = /^\.+/;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseAttachments(value: unknown): IncomingAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsed: IncomingAttachment[] = [];
  for (const raw of value) {
    const item = asObject(raw);
    if (!item) {
      continue;
    }
    const content = asString(item.content);
    if (!content) {
      continue;
    }
    parsed.push({
      content,
      contentType: asString(item.contentType),
      filename: asString(item.filename),
      size: Number.isFinite(item.size) ? Number(item.size) : 0,
    });
  }
  return parsed;
}

function parseFileLinks(value: unknown): FileLink[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const parsed: FileLink[] = [];
  for (const raw of value) {
    const item = asObject(raw);
    if (!item) {
      continue;
    }
    const url = asString(item.url);
    const source = asString(item.source);
    if (!url || !source) {
      continue;
    }
    if (source === "onedrive" || source === "egnyte" || source === "dropbox") {
      parsed.push({ source, url });
    }
  }
  return parsed;
}

export function parseIncomingPayload(value: unknown): IncomingPayload | null {
  const body = asObject(value);
  if (!body) {
    return null;
  }

  return {
    attachments: parseAttachments(body.attachments),
    bodyHasContent: body.bodyHasContent === true,
    bodyText: asString(body.bodyText),
    fileLinks: parseFileLinks(body.fileLinks),
    forwardedAt: asString(body.forwardedAt),
    forwarderEmail: asString(body.forwarderEmail),
    originalFrom: asString(body.originalFrom),
    originalSubject: asString(body.originalSubject),
  };
}

export function buildTriggerFiles(payload: IncomingPayload): TriggerFile[] {
  const files: TriggerFile[] = [];

  for (const att of payload.attachments) {
    const filename = sanitizeFilename(
      ensureFilenameExtension(att.filename || "attachment", att.contentType),
      "-"
    );
    files.push({ filename, contentBase64: att.content });
  }

  if (payload.bodyHasContent === true && payload.bodyText.trim().length > 0) {
    files.push({
      filename: "email-body.txt",
      contentBase64: Buffer.from(payload.bodyText).toString("base64"),
    });
  }

  return files;
}

async function triggerDocumentIntake(
  triggerPayload: TriggerPayload,
  env: IntakeWebhookEnv
): Promise<string | null> {
  const response = await fetch(
    `${env.triggerApiUrl}/api/v1/tasks/document-intake/trigger`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.triggerSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload: triggerPayload, options: {} }),
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Trigger.dev API ${response.status}: ${text.slice(0, 200)}`);
  }

  const result = (await response.json().catch(() => ({}))) as { id?: string };
  return result.id ?? null;
}

function hasAnyProcessableContent(payload: IncomingPayload): boolean {
  const hasAttachments = payload.attachments.length > 0;
  const hasLinks = (payload.fileLinks?.length ?? 0) > 0;
  const hasBody =
    payload.bodyHasContent === true && payload.bodyText.trim().length > 0;
  return hasAttachments || hasLinks || hasBody;
}

export function createIntakeWebhookHandler(env: IntakeWebhookEnv) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
      return json({ error: "Method Not Allowed" }, 405);
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    const payload = parseIncomingPayload(raw);
    if (!payload) {
      return json({ error: "Invalid payload" }, 400);
    }

    if (!hasAnyProcessableContent(payload)) {
      return json(
        { error: "No attachments, links, or body content provided" },
        400
      );
    }

    const files = buildTriggerFiles(payload);
    if (files.length === 0) {
      // Link-only intake: links are handled downstream by body-link-intake.
      return json({ ok: true, files: 0 }, 200);
    }

    if (!env.triggerSecretKey.trim()) {
      return json({ error: "TRIGGER_SECRET_KEY is not set" }, 500);
    }

    try {
      const runId = await triggerDocumentIntake(
        {
          originalSubject: payload.originalSubject,
          originalFrom: payload.originalFrom,
          bodyText: payload.bodyText,
          forwarderEmail: payload.forwarderEmail,
          files,
        },
        env
      );
      return json({ ok: true, runId, files: files.length }, 202);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ error: message }, 502);
    }
  };
}

function readEnv(): IntakeWebhookEnv {
  return {
    triggerApiUrl:
      Deno.env.get("TRIGGER_API_URL") ?? "https://trigger.desertservices.app",
    triggerSecretKey: Deno.env.get("TRIGGER_SECRET_KEY") ?? "",
  };
}

if (typeof Deno !== "undefined" && typeof Deno.serve === "function") {
  Deno.serve(createIntakeWebhookHandler(readEnv()));
}
