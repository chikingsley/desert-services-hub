/**
 * BuildingConnected File Sync
 *
 * Pulls BuildingConnected-signaled email attachments from Graph and runs document intake.
 */
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { processFilesIntake } from "@documents-intake/files-intake";
import type { GraphEmailClient } from "@email/client";
import { isSubjectCompatibleWithProject } from "@email/project-subject-guard";
import { createGraphClient } from "@email/sync/config";
import { db } from "@lib/db/client";
import { updateAttachmentExtraction } from "@lib/db/repositories/attachment";
import type { BuildingConnectedSignalFields } from "./signal";
import { hasBuildingConnectedSignal } from "./signal";

const LOG = "[buildingconnected-file-sync]";
const BACKFILL_DIR = "/app/data/buildingconnected-file-sync";
const CONCURRENCY = 3;

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  min = 1
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, parsed);
}

const BUILDINGCONNECTED_SYNC_DOWNLOAD_TIMEOUT_MS = parsePositiveInt(
  process.env.BUILDINGCONNECTED_SYNC_DOWNLOAD_TIMEOUT_MS,
  20_000,
  1000
);

// ============================================================================
// Types
// ============================================================================

interface UnprocessedAttachment extends BuildingConnectedSignalFields {
  attachment_id_pk: number;
  graph_attachment_id: string;
  name: string;
  content_type: string | null;
  size: number | null;
  email_id: number;
  message_id: string;
  project_id: number | null;
  subject: string | null;
  mailbox_email: string;
}

export interface BuildingConnectedSyncResult {
  processed: number;
  skipped: number;
  succeeded: number;
  failed: number;
  elapsedMs: number;
  attachmentsPerMinute: number;
  errors: string[];
}

export interface BuildingConnectedSyncOptions {
  batchSize?: number;
}

// ============================================================================
// Queries
// ============================================================================

const getUnprocessedAttachments = db.query<UnprocessedAttachment, [number]>(`
  SELECT
    a.id as attachment_id_pk,
    a.outlook_attachment_id as graph_attachment_id,
    a.file_name as name,
    a.content_type,
    a.file_size as size,
    e.id as email_id,
    e.message_id,
    e.project_id,
    e.subject,
    e.body_preview,
    e.from_email,
    e.from_domain,
    e.original_sender_email,
    e.original_sender_domain,
    e.real_sender_email,
    e.real_sender_domain,
    e.platform_name,
    m.email as mailbox_email
  FROM documents a
  JOIN emails e ON e.id = a.email_id
  JOIN mailboxes m ON m.id = e.mailbox_id
  WHERE a.source = 'email_attachment'
    AND (a.extraction_status IS NULL OR a.extraction_status = 'pending')
    AND (
      lower(coalesce(e.from_domain, '')) = 'buildingconnected.com'
      OR lower(coalesce(e.original_sender_domain, '')) = 'buildingconnected.com'
      OR lower(coalesce(e.real_sender_domain, '')) = 'buildingconnected.com'
      OR lower(coalesce(e.platform_name, '')) = 'buildingconnected'
      OR lower(coalesce(e.from_email, '')) LIKE '%@buildingconnected.com'
      OR lower(coalesce(e.original_sender_email, '')) LIKE '%@buildingconnected.com'
      OR lower(coalesce(e.real_sender_email, '')) LIKE '%@buildingconnected.com'
      OR coalesce(e.subject, '') ILIKE '%buildingconnected%'
      OR coalesce(e.body_preview, '') ILIKE '%buildingconnected.com%'
      OR coalesce(e.body_preview, '') ILIKE '%team@buildingconnected%'
    )
  ORDER BY e.received_at DESC
  LIMIT $1
`);

const updateDocumentBackfillLinks = db.query(`
  UPDATE documents
  SET email_id = $2,
      outlook_attachment_id = $3,
      project_id = $4
  WHERE id = $1
`);

// ============================================================================
// Single Attachment Processing
// ============================================================================

type AttachmentOutcome =
  | { type: "skipped" }
  | { type: "succeeded" }
  | { type: "failed"; error: string };

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Multi-branch operational flow handles parse and linking atomically.
async function processOneAttachment(
  att: UnprocessedAttachment,
  client: GraphEmailClient
): Promise<AttachmentOutcome> {
  const hasBuildingConnected = hasBuildingConnectedSignal(att);
  if (!hasBuildingConnected) {
    await updateAttachmentExtraction(att.attachment_id_pk, "skipped");
    return { type: "skipped" };
  }

  // File extension from attachment name
  const ext = att.name.includes(".")
    ? att.name.split(".").pop()?.toLowerCase()
    : "bin";
  const localPath = join(
    BACKFILL_DIR,
    `${att.email_id}-${att.attachment_id_pk}.${ext}`
  );

  // Download from Graph API
  console.log(
    `${LOG}   Downloading: "${att.name}" (${att.content_type}, ${att.size ?? "?"} bytes) from ${att.mailbox_email}`
  );

  const buffer = (await Promise.race([
    client.downloadAttachment(
      att.message_id,
      att.graph_attachment_id,
      att.mailbox_email
    ),
    new Promise<Buffer>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `Download timed out after ${BUILDINGCONNECTED_SYNC_DOWNLOAD_TIMEOUT_MS}ms`
            )
          ),
        BUILDINGCONNECTED_SYNC_DOWNLOAD_TIMEOUT_MS
      )
    ),
  ])) as Buffer;

  await Bun.write(localPath, buffer);

  try {
    // Run through the file analysis pipeline (Kreuzberg-first for PDFs, OCR fallback)
    const results = await processFilesIntake({
      attachmentPaths: [localPath],
      bodyText: "",
      forwarderEmail: att.mailbox_email,
      originalFrom: att.from_email ?? "",
      originalSubject: att.subject ?? "",
    });

    // Link document records to email, attachment, and project
    let anySuccess = false;
    let projectLinkSkipped = false;
    for (const r of results) {
      if (r.documentId) {
        let projectIdForDocument: number | null = att.project_id;
        const subjectForGuard = att.subject ?? "";
        if (
          projectIdForDocument !== null &&
          !(await isSubjectCompatibleWithProject({
            projectId: projectIdForDocument,
            subject: subjectForGuard,
          }))
        ) {
          projectIdForDocument = null;
          projectLinkSkipped = true;
        }

        await updateDocumentBackfillLinks.run(
          r.documentId,
          att.email_id,
          att.attachment_id_pk,
          projectIdForDocument
        );

        anySuccess = true;
      }
    }

    if (anySuccess) {
      await updateAttachmentExtraction(att.attachment_id_pk, "success");
      let projectSummary = "no project link";
      if (att.project_id !== null) {
        projectSummary = projectLinkSkipped
          ? "project link skipped by subject guard"
          : `project #${att.project_id}`;
      }
      console.log(`${LOG}   OK: ${att.name} -> ${projectSummary}`);
      return { type: "succeeded" };
    }

    const errMsg = results[0]?.error ?? "No document created";
    await updateAttachmentExtraction(
      att.attachment_id_pk,
      "failed",
      null,
      errMsg
    );
    return { error: `${att.name}: ${errMsg}`, type: "failed" };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await updateAttachmentExtraction(
      att.attachment_id_pk,
      "failed",
      null,
      msg.slice(0, 1000)
    );
    return { error: `${att.name}: ${msg}`, type: "failed" };
  } finally {
    // Clean up temp file
    try {
      await unlink(localPath);
    } catch {
      // Non-fatal
    }
  }
}

// ============================================================================
// Main — Concurrent Processing
// ============================================================================

export async function syncBuildingConnectedFiles(
  options: BuildingConnectedSyncOptions = {}
): Promise<BuildingConnectedSyncResult> {
  const startedAt = Date.now();
  const batchSize = Math.max(1, options.batchSize ?? 50);

  const result: BuildingConnectedSyncResult = {
    attachmentsPerMinute: 0,
    elapsedMs: 0,
    errors: [],
    failed: 0,
    processed: 0,
    skipped: 0,
    succeeded: 0,
  };

  const attachments = await getUnprocessedAttachments.all(batchSize);

  if (attachments.length === 0) {
    result.elapsedMs = Date.now() - startedAt;
    return result;
  }

  console.log(
    `${LOG} Processing batch of ${attachments.length} BuildingConnected attachments (concurrency: ${CONCURRENCY})`
  );

  await mkdir(BACKFILL_DIR, { recursive: true });

  // Single Graph client for the entire batch (token is cached internally)
  const client = createGraphClient();

  // Process in chunks of CONCURRENCY
  for (let i = 0; i < attachments.length; i += CONCURRENCY) {
    const chunk = attachments.slice(i, i + CONCURRENCY);

    const outcomes = await Promise.allSettled(
      chunk.map(async (att) => {
        try {
          return await processOneAttachment(att, client);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error(`${LOG}   FAIL: ${att.name}: ${msg}`);
          await updateAttachmentExtraction(
            att.attachment_id_pk,
            "failed",
            null,
            msg.slice(0, 1000)
          );
          return { error: `${att.name}: ${msg}`, type: "failed" as const };
        }
      })
    );

    for (const outcome of outcomes) {
      const o =
        outcome.status === "fulfilled"
          ? outcome.value
          : { error: String(outcome.reason), type: "failed" as const };

      switch (o.type) {
        case "skipped": {
          result.skipped++;
          break;
        }
        case "succeeded": {
          result.processed++;
          result.succeeded++;
          break;
        }
        case "failed": {
          result.processed++;
          result.failed++;
          result.errors.push(o.error);
          break;
        }
        default: {
          result.processed++;
          result.failed++;
          result.errors.push("Unknown outcome type");
          break;
        }
      }
    }
  }

  console.log(
    `${LOG} Batch complete: ${result.processed} processed (${result.succeeded} ok, ${result.failed} failed), ${result.skipped} skipped`
  );

  result.elapsedMs = Date.now() - startedAt;
  const processedOrSkipped = result.processed + result.skipped;
  result.attachmentsPerMinute =
    result.elapsedMs > 0
      ? (processedOrSkipped / result.elapsedMs) * 60_000
      : processedOrSkipped;

  return result;
}
