/**
 * BuildingConnected File Sync
 *
 * Pulls BuildingConnected-signaled email attachments from Graph, runs document intake,
 * then stores the resulting files in SharePoint (project folder when confidently linked,
 * otherwise a BuildingConnected archive path).
 */
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { processFilesIntake } from "@background-jobs/lib/intake/files-intake";
import type { GraphEmailClient } from "@email/client";
import { isSubjectCompatibleWithProject } from "@email/project-subject-guard";
import { createGraphClient } from "@email/sync/config";
import { db } from "@lib/db/hub";
import { updateAttachmentExtraction } from "@lib/db/repositories/attachment";
import {
  createSharePointClientFromEnv,
  uploadLocalFileToProjectSubfolder,
} from "@sharepoint/intake-upload";
import { buildSharePointUrl, sanitizeName } from "@sharepoint/paths";
import type { BuildingConnectedSignalFields } from "./signal";
import { hasBuildingConnectedSignal } from "./signal";

const LOG = "[buildingconnected-file-sync]";
const BACKFILL_DIR = "/app/data/buildingconnected-file-sync";
const CONCURRENCY = 3;
const PATH_EDGE_SLASHES_RE = /^\/+|\/+$/g;

const DISABLED_FLAG_VALUES = new Set(["0", "false", "no", "off"]);

function parseEnabledFlag(value: string | undefined, fallback = true): boolean {
  if (!value?.trim()) {
    return fallback;
  }
  return !DISABLED_FLAG_VALUES.has(value.trim().toLowerCase());
}

const BUILDINGCONNECTED_SYNC_ARCHIVE_UPLOAD = parseEnabledFlag(
  process.env.BUILDINGCONNECTED_SYNC_ARCHIVE_UPLOAD ??
    process.env.ATTACHMENT_BACKFILL_UPLOAD_BC_ARCHIVE,
  true
);
const BUILDINGCONNECTED_SYNC_SHAREPOINT_REQUIRED = parseEnabledFlag(
  process.env.BUILDINGCONNECTED_SYNC_SHAREPOINT_REQUIRED,
  true
);
const BUILDINGCONNECTED_SYNC_ARCHIVE_ROOT = (
  process.env.BUILDINGCONNECTED_SYNC_ARCHIVE_ROOT ??
  process.env.ATTACHMENT_BACKFILL_BC_ARCHIVE_ROOT ??
  "Customer Projects/Submitted/_Platform Intake/BuildingConnected"
)
  .trim()
  .replace(PATH_EDGE_SLASHES_RE, "");

type SharePointClientInstance = NonNullable<
  ReturnType<typeof createSharePointClientFromEnv>
>;

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
  received_at: string | null;
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
// Skip Rules — inline images, calendar invites, signatures
// ============================================================================

const INLINE_IMAGE_PATTERNS = [
  /^image\d{3}\./i, // image001.png, image002.jpg
  /^Outlook-/i, // Outlook-abc123.png
  /logo/i, // anything with "logo"
  /^icon/i, // icon files
  /^spacer\./i, // spacer.gif
];

const SKIP_CONTENT_TYPES = new Set([
  "text/calendar",
  "application/x-ms-wmz",
  "message/rfc822",
  "application/ics",
  "application/pkcs7-signature",
  "application/x-pkcs7-signature",
]);

function shouldSkip(att: UnprocessedAttachment): boolean {
  const ct = att.content_type?.toLowerCase() ?? "";

  // Skip non-processable types (calendar invites, signatures, embedded emails)
  if (SKIP_CONTENT_TYPES.has(ct)) {
    return true;
  }

  // Skip inline/signature images: small size OR matching name patterns
  if (ct.startsWith("image/")) {
    if ((att.size ?? 0) < 50_000) {
      return true;
    }
    for (const pattern of INLINE_IMAGE_PATTERNS) {
      if (pattern.test(att.name)) {
        return true;
      }
    }
  }

  return false;
}

function docTypeToSharePointSubfolder(documentType: string | null): string {
  const t = (documentType ?? "").toLowerCase();
  if (t.includes("noi")) {
    return "NOI";
  }
  if (t.includes("plan")) {
    return "Plans";
  }
  if (t.includes("estimate")) {
    return "Estimates";
  }
  return "Contracts";
}

function getUtcDateParts(iso: string | null): {
  year: string;
  month: string;
  day: string;
} {
  const parsed = iso ? new Date(iso) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return {
    day: String(date.getUTCDate()).padStart(2, "0"),
    month: String(date.getUTCMonth() + 1).padStart(2, "0"),
    year: date.getUTCFullYear().toString(),
  };
}

function splitExtension(fileName: string): { stem: string; ext: string } {
  const idx = fileName.lastIndexOf(".");
  if (idx <= 0 || idx === fileName.length - 1) {
    return { ext: "", stem: fileName };
  }
  return { ext: fileName.slice(idx), stem: fileName.slice(0, idx) };
}

function buildStableAltName(fileName: string, stableSuffix: string): string {
  const safeSuffix = sanitizeName(stableSuffix).replaceAll(/\s+/g, "-");
  const { stem, ext } = splitExtension(fileName);
  return `${stem}-intake-${safeSuffix}${ext}`;
}

function buildBuildingConnectedArchiveFolder(
  att: UnprocessedAttachment
): string {
  const { year, month, day } = getUtcDateParts(att.received_at);
  const mailbox =
    sanitizeName(att.mailbox_email || "unknown-mailbox") || "unknown-mailbox";
  return `${BUILDINGCONNECTED_SYNC_ARCHIVE_ROOT}/${year}/${month}/${day}/${mailbox}`;
}

async function uploadAttachmentToBuildingConnectedArchive(
  sp: SharePointClientInstance,
  att: UnprocessedAttachment,
  content: Buffer
): Promise<string | null> {
  if (
    !(
      BUILDINGCONNECTED_SYNC_ARCHIVE_UPLOAD &&
      BUILDINGCONNECTED_SYNC_ARCHIVE_ROOT
    )
  ) {
    return null;
  }

  const folderPath = buildBuildingConnectedArchiveFolder(att);
  await sp.ensureFolder(folderPath);

  const desiredName =
    sanitizeName(att.name || `attachment-${att.attachment_id_pk}`) ||
    `attachment-${att.attachment_id_pk}`;
  const desiredPath = `${folderPath}/${desiredName}`;

  let finalName = desiredName;
  if (await sp.exists(desiredPath)) {
    const altName = buildStableAltName(
      desiredName,
      `${att.email_id}-${att.attachment_id_pk}`
    );
    const altPath = `${folderPath}/${altName}`;
    if (await sp.exists(altPath)) {
      return buildSharePointUrl(folderPath);
    }
    finalName = altName;
  }

  await sp.upload(folderPath, finalName, content);
  return buildSharePointUrl(folderPath);
}

// ============================================================================
// Queries
// ============================================================================

const getUnprocessedAttachments = db.query<UnprocessedAttachment, [number]>(`
  SELECT
    a.id as attachment_id_pk,
    a.outlook_attachment_id as graph_attachment_id,
    a.name,
    a.content_type,
    a.size,
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
    e.received_at,
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

const updateDocumentBackfillLinks = db.prepare(`
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Multi-branch operational flow handles parse, linking, and SharePoint fallback atomically.
async function processOneAttachment(
  att: UnprocessedAttachment,
  client: GraphEmailClient,
  sharePointClient: SharePointClientInstance | null
): Promise<AttachmentOutcome> {
  const hasBuildingConnected = hasBuildingConnectedSignal(att);
  if (!hasBuildingConnected) {
    await updateAttachmentExtraction(att.attachment_id_pk, "skipped");
    return { type: "skipped" };
  }
  const shouldSkipForParse = shouldSkip(att);

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

  const buffer = await client.downloadAttachment(
    att.message_id,
    att.graph_attachment_id,
    att.mailbox_email
  );

  await Bun.write(localPath, buffer);

  let uploadedToProject = false;
  let uploadedToBuildingConnectedArchive = false;

  const ensureBuildingConnectedArchiveUpload = async (): Promise<void> => {
    if (uploadedToBuildingConnectedArchive || uploadedToProject) {
      return;
    }

    if (!sharePointClient) {
      if (BUILDINGCONNECTED_SYNC_SHAREPOINT_REQUIRED) {
        throw new Error(
          "SharePoint client unavailable (missing AZURE_* credentials)"
        );
      }
      return;
    }

    const folderUrl = await uploadAttachmentToBuildingConnectedArchive(
      sharePointClient,
      att,
      buffer
    );
    if (!folderUrl && BUILDINGCONNECTED_SYNC_SHAREPOINT_REQUIRED) {
      throw new Error(
        "BuildingConnected archive upload is disabled (set BUILDINGCONNECTED_SYNC_ARCHIVE_UPLOAD=1)"
      );
    }
    if (folderUrl) {
      console.log(`${LOG}   BC archive upload: "${att.name}" -> ${folderUrl}`);
      uploadedToBuildingConnectedArchive = true;
    }
  };

  if (shouldSkipForParse) {
    try {
      await ensureBuildingConnectedArchiveUpload();
      await updateAttachmentExtraction(att.attachment_id_pk, "skipped");
      return { type: "skipped" };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await updateAttachmentExtraction(
        att.attachment_id_pk,
        "failed",
        null,
        msg.slice(0, 1000)
      );
      return { error: `${att.name}: ${msg}`, type: "failed" };
    }
  }

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

        if (sharePointClient && projectIdForDocument !== null) {
          try {
            const uploaded = await uploadLocalFileToProjectSubfolder(
              sharePointClient,
              {
                localPath,
                originalFileName: att.name,
                projectId: projectIdForDocument,
                stableSuffix: String(r.documentId),
                subfolder: docTypeToSharePointSubfolder(r.documentType ?? null),
              }
            );
            if (uploaded) {
              uploadedToProject = true;
              console.log(
                `${LOG}   SharePoint project upload: "${att.name}" -> ${uploaded.folderUrl}`
              );
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.warn(
              `${LOG}   SharePoint project upload failed for "${att.name}": ${msg}`
            );
          }
        }

        anySuccess = true;
      }
    }

    await ensureBuildingConnectedArchiveUpload();

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
  const sharePointClient = createSharePointClientFromEnv();

  if (!sharePointClient && BUILDINGCONNECTED_SYNC_SHAREPOINT_REQUIRED) {
    throw new Error(
      `${LOG} SharePoint client unavailable; BuildingConnected sync requires AZURE_* credentials`
    );
  }

  // Process in chunks of CONCURRENCY
  for (let i = 0; i < attachments.length; i += CONCURRENCY) {
    const chunk = attachments.slice(i, i + CONCURRENCY);

    const outcomes = await Promise.allSettled(
      chunk.map(async (att) => {
        try {
          return await processOneAttachment(att, client, sharePointClient);
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
