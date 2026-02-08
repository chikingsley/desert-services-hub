/**
 * Dust Permit Intake Webhook Handler
 *
 * Route: POST /api/webhooks/dust-permit-intake
 *
 * Receives forwarded email data from the Cloudflare email worker.
 * Saves PDF attachments to disk, enqueues a dust_permit_intake job.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@lib/db/hub";

const INTAKE_DIR = join(import.meta.dir, "../../../data/dust-permit-intake");

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
  attachments: IncomingAttachment[];
}

const enqueueStmt = db.prepare(
  "INSERT INTO webhook_jobs (job_type, payload) VALUES ('dust_permit_intake', ?) RETURNING id"
);

export async function handleDustPermitWebhook(req: Request): Promise<Response> {
  let body: IncomingPayload;
  try {
    body = (await req.json()) as IncomingPayload;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (!body.attachments?.length) {
    return Response.json({ error: "No attachments provided" }, { status: 400 });
  }

  // Filter to PDFs only
  const pdfs = body.attachments.filter(
    (a) =>
      a.contentType === "application/pdf" ||
      a.filename.toLowerCase().endsWith(".pdf")
  );

  if (pdfs.length === 0) {
    return Response.json(
      { error: "No PDF attachments found" },
      { status: 400 }
    );
  }

  // Create job directory
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const jobDir = join(INTAKE_DIR, jobId);
  await mkdir(jobDir, { recursive: true });

  // Save PDFs to disk
  const attachmentPaths: string[] = [];
  for (const pdf of pdfs) {
    const filePath = join(jobDir, pdf.filename);
    const buffer = Buffer.from(pdf.content, "base64");
    await Bun.write(filePath, buffer);
    attachmentPaths.push(filePath);
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
    `[webhook:dust-permit] Enqueued job #${jobDbId}: ${pdfs.length} PDF(s) from "${body.originalSubject}"`
  );

  return Response.json(
    { ok: true, jobId: jobDbId, pdfs: pdfs.length },
    { status: 202 }
  );
}
