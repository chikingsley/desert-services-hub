/**
 * Attachment Intake — Trigger.dev scheduled task
 *
 * Processes pending document attachments from two sources:
 *   - email_attachment: Download from Microsoft Graph API, extract, link to email/project
 *   - monday_asset: Download from Monday.com API, extract with nativeExtract
 *
 * Both paths deduplicate by internet_message_id and SHA256 content hash.
 * This task runs on a 5-minute schedule to process the backlog.
 *
 * IMPORTANT: Runner containers have ephemeral filesystems isolated from the
 * pdf-analysis service. All extraction sends file content as base64 via
 * nativeExtractFromBuffer — never local file paths.
 */

import { shouldSkipAttachment } from "@documents-intake/attachment-policy";
import { processFilesIntake } from "@documents-intake/files-intake";
import { updateAttachmentExtraction } from "@lib/db/repositories/attachment";
import {
  deleteFailedParsedDocs,
  findContentHashAttachmentDuplicate,
  findInternetMessageAttachmentDuplicate,
  getIntakeAttachmentRows,
  type IntakeAttachmentRow,
  markAttachmentDeduped,
  setAttachmentContentHash,
  updateDocumentBackfillLinks,
} from "@lib/db/repositories/intake-attachments";
import { logger, schedules } from "@trigger.dev/sdk/v3";
import { graphGet, graphGetBinary } from "./graph";

const BATCH_SIZE = 50;
const DOWNLOAD_TIMEOUT_MS = 30_000;

// ── Graph API attachment download ───────────────────────────────

async function downloadAttachment(
  mailboxEmail: string,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const userPath = encodeURIComponent(mailboxEmail);
  const msgPath = encodeURIComponent(messageId);
  const attPath = encodeURIComponent(attachmentId);

  // Standard endpoint returns JSON with base64 contentBytes
  const att = await graphGet<{ contentBytes?: string }>(
    `users/${userPath}/messages/${msgPath}/attachments/${attPath}`
  );

  if (att.contentBytes) {
    return Buffer.from(att.contentBytes, "base64");
  }

  // Fallback: $value endpoint returns raw binary (large attachments)
  return graphGetBinary(
    `users/${userPath}/messages/${msgPath}/attachments/${attPath}/$value`
  );
}

function computeHash(buffer: Buffer): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(buffer);
  return hasher.digest("hex");
}

// ── Monday asset download ───────────────────────────────────────

async function downloadMondayAsset(
  mondayItemId: string,
  mondayAssetId: string
): Promise<Buffer | null> {
  const { getItemAssets } = await import("@monday/client/assets");
  const assets = await getItemAssets(mondayItemId);
  const asset = assets.find((a) => a.id === mondayAssetId);

  if (!asset?.public_url) {
    return null;
  }

  const response = await fetch(asset.public_url);
  if (!response.ok) {
    return null;
  }

  return Buffer.from(await response.arrayBuffer());
}

// ── Process one attachment ──────────────────────────────────────

type Outcome = "extracted" | "skipped" | "deduped" | "failed";

async function processMondayAsset(att: IntakeAttachmentRow): Promise<Outcome> {
  if (!(att.monday_item_id && att.monday_asset_id)) {
    await updateAttachmentExtraction(
      att.attachment_id_pk,
      "failed",
      null,
      "Monday asset missing item_id or asset_id"
    );
    return "failed";
  }

  const buffer = await downloadMondayAsset(
    att.monday_item_id,
    att.monday_asset_id
  );

  if (!buffer) {
    await updateAttachmentExtraction(
      att.attachment_id_pk,
      "failed",
      null,
      `Monday asset not available: item=${att.monday_item_id}, asset=${att.monday_asset_id}`
    );
    return "failed";
  }

  // Content hash dedup
  const hash = computeHash(buffer);
  await setAttachmentContentHash(att.attachment_id_pk, hash);

  const hashDupe = await findContentHashAttachmentDuplicate(
    hash,
    att.attachment_id_pk
  );
  if (hashDupe) {
    await markAttachmentDeduped(att.attachment_id_pk);
    return "deduped";
  }

  // Extract via base64 — no temp files needed
  const { processMondayAssetDocument } = await import(
    "@documents-intake/processors/monday-asset"
  );
  const { COLUMN_HINTS } = await import("@monday/sync/pipeline-config");

  const columnHint = att.monday_column_id
    ? (COLUMN_HINTS[att.monday_column_id] ?? undefined)
    : undefined;

  const outcome = await processMondayAssetDocument({
    filePath: att.name,
    buffer,
    columnHint,
  });

  const { markMondayAssetExtractionSuccess } = await import(
    "@lib/db/repositories/intake-attachments"
  );
  await markMondayAssetExtractionSuccess(
    att.attachment_id_pk,
    outcome.documentType,
    outcome.summary
  );

  return "extracted";
}

async function processEmailAttachment(
  att: IntakeAttachmentRow
): Promise<Outcome> {
  // Check internet_message_id dedup (same email forwarded to multiple mailboxes)
  if (att.internet_message_id) {
    const dupe = await findInternetMessageAttachmentDuplicate(
      att.internet_message_id,
      att.name,
      att.size ?? null,
      att.attachment_id_pk
    );
    if (dupe) {
      await markAttachmentDeduped(att.attachment_id_pk);
      return "deduped";
    }
  }

  // Need Graph API coordinates to download
  if (!(att.message_id && att.graph_attachment_id && att.mailbox_email)) {
    await updateAttachmentExtraction(
      att.attachment_id_pk,
      "failed",
      null,
      "Missing message_id, graph_attachment_id, or mailbox_email for download"
    );
    return "failed";
  }

  // Clean up any previously failed parsed docs for this attachment
  if (att.email_id && att.graph_attachment_id) {
    await deleteFailedParsedDocs(att.email_id, att.graph_attachment_id);
  }

  // Download from Graph API with timeout
  const buffer = await Promise.race([
    downloadAttachment(
      att.mailbox_email,
      att.message_id,
      att.graph_attachment_id
    ),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Download timed out")),
        DOWNLOAD_TIMEOUT_MS
      )
    ),
  ]);

  // Content hash dedup
  const hash = computeHash(buffer);
  await setAttachmentContentHash(att.attachment_id_pk, hash);

  const hashDupe = await findContentHashAttachmentDuplicate(
    hash,
    att.attachment_id_pk
  );
  if (hashDupe) {
    await markAttachmentDeduped(att.attachment_id_pk);
    return "deduped";
  }

  // Extract via base64 — pass buffer alongside path for cross-container transport
  const results = await processFilesIntake({
    attachmentPaths: [att.name],
    attachmentBuffers: [buffer],
    originalSubject: att.subject ?? "",
    originalFrom: att.from_email ?? "",
    bodyText: "",
    forwarderEmail: att.mailbox_email ?? "",
  });

  // Link extracted documents back to email/project
  let anySuccess = false;
  for (const r of results) {
    if (r.documentId) {
      await updateDocumentBackfillLinks(
        r.documentId,
        att.email_id,
        att.graph_attachment_id,
        att.project_id
      );
      anySuccess = true;
    }
  }

  if (anySuccess) {
    await updateAttachmentExtraction(att.attachment_id_pk, "success");
    return "extracted";
  }

  const errMsg = results[0]?.error ?? "No document created";
  await updateAttachmentExtraction(
    att.attachment_id_pk,
    "failed",
    null,
    errMsg
  );
  return "failed";
}

async function processOne(att: IntakeAttachmentRow): Promise<Outcome> {
  // Skip non-processable content types and likely inline images
  if (
    shouldSkipAttachment({
      contentType: att.content_type,
      fileName: att.name,
      size: att.size,
    })
  ) {
    await updateAttachmentExtraction(att.attachment_id_pk, "skipped");
    return "skipped";
  }

  if (att.source === "monday_asset") {
    return processMondayAsset(att);
  }
  return processEmailAttachment(att);
}

// ── Task ────────────────────────────────────────────────────────

export const attachmentIntake = schedules.task({
  id: "attachment-intake",
  cron: "*/5 * * * *",
  maxDuration: 300,
  run: async () => {
    const attachments = await getIntakeAttachmentRows(BATCH_SIZE);
    if (attachments.length === 0) {
      return { processed: 0, extracted: 0, skipped: 0, deduped: 0, failed: 0 };
    }

    logger.info("Processing attachments", { count: attachments.length });

    const counts = { extracted: 0, skipped: 0, deduped: 0, failed: 0 };

    for (const att of attachments) {
      try {
        const outcome = await processOne(att);
        counts[outcome]++;

        logger.info("Attachment processed", {
          id: att.attachment_id_pk,
          name: att.name,
          outcome,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn("Attachment processing failed", {
          id: att.attachment_id_pk,
          name: att.name,
          error: msg,
        });
        await updateAttachmentExtraction(
          att.attachment_id_pk,
          "failed",
          null,
          msg.slice(0, 1000)
        );
        counts.failed++;
      }
    }

    const processed =
      counts.extracted + counts.skipped + counts.deduped + counts.failed;
    logger.info("Attachment intake complete", { processed, ...counts });

    return { processed, ...counts };
  },
});
