/**
 * Files Intake Webhook Handler
 *
 * Route: POST /api/webhooks/files-intake
 *
 * Receives forwarded email data from the Cloudflare files-email-intake
 * worker. Saves ALL attachments to disk (not just PDFs), optionally
 * saves email body text, and enqueues a files_intake job for processing.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@lib/db/hub";

const INTAKE_DIR = join(import.meta.dir, "../../../data/files-intake");
const LOG = "[webhook:files-intake]";

interface IncomingAttachment {
  filename: string;
  contentType: string;
  size: number;
  content: string; // base64
}

interface IncomingPayload {
  forwarderEmail: string;
  forwardedAt: string;
  originalSubject: string;
  originalFrom: string;
  bodyText: string;
  bodyHasContent?: boolean;
  attachments: IncomingAttachment[];
}

const enqueueStmt = db.prepare(
  "INSERT INTO webhook_jobs (job_type, payload) VALUES ('files_intake', ?) RETURNING id"
);

export async function handleFilesIntakeWebhook(
  req: Request
): Promise<Response> {
  let body: IncomingPayload;
  try {
    body = (await req.json()) as IncomingPayload;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const hasAttachments = (body.attachments?.length ?? 0) > 0;
  const hasBody = body.bodyHasContent === true;

  if (!hasAttachments && !hasBody) {
    return Response.json(
      { error: "No attachments or body content provided" },
      { status: 400 }
    );
  }

  // Create job directory
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const jobDir = join(INTAKE_DIR, jobId);
  await mkdir(jobDir, { recursive: true });

  // Save ALL attachments to disk
  const attachmentPaths: string[] = [];
  for (const att of body.attachments ?? []) {
    const filePath = join(jobDir, att.filename);
    const buffer = Buffer.from(att.content, "base64");
    await Bun.write(filePath, buffer);
    attachmentPaths.push(filePath);
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
