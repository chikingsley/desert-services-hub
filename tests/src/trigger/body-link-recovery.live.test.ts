import { describe, expect, test } from "bun:test";
import { db } from "@lib/db/client";
import type { IntakeAttachmentRow } from "@documents-intake/db/intake-attachments";
import { loadEmailAttachmentBuffer } from "@/apps/trigger-dev/src/trigger/attachment-intake";

const runLive = process.env.RUN_LIVE_BODYLINK_RECOVERY_TEST === "1";
const liveTest = runLive ? test : test.skip;

async function getFailedBodyLinkCandidates(
  limit: number
): Promise<IntakeAttachmentRow[]> {
  return db
    .query<IntakeAttachmentRow, [number]>(
      `SELECT
         d.id as attachment_id_pk,
         d.outlook_attachment_id as graph_attachment_id,
         d.file_name as name,
         d.content_type,
         d.file_size as size,
         d.storage_path,
         d.source,
         d.monday_asset_id,
         d.monday_column_id,
         d.monday_item_id,
         d.estimate_id,
         d.local_path,
         e.id as email_id,
         e.message_id,
         e.internet_message_id,
         e.project_id,
         e.subject,
         e.from_email,
         e.thread_id,
         e.conversation_id,
         m.email as mailbox_email
       FROM documents d
       LEFT JOIN emails e ON e.id = d.email_id
       LEFT JOIN mailboxes m ON m.id = e.mailbox_id
       WHERE d.source = 'email_attachment'
         AND d.outlook_attachment_id LIKE 'bodylink:%'
         AND d.extraction_status = 'failed'
         AND coalesce(d.extraction_error, '') ILIKE '%missing local storage_path%'
         AND e.id IS NOT NULL
       ORDER BY
         CASE split_part(d.outlook_attachment_id, ':', 2)
           WHEN 'dropbox' THEN 0
           WHEN 'onedrive' THEN 1
           WHEN 'egnyte' THEN 2
           ELSE 3
         END,
         d.updated_at DESC
       LIMIT $1`
    )
    .all(limit);
}

describe("body-link recovery (live)", () => {
  liveTest(
    "recovers two failed body-link attachments by redownloading from email body links",
    async () => {
      const candidates = await getFailedBodyLinkCandidates(40);
      expect(candidates.length).toBeGreaterThan(0);

      const recovered: Array<{
        bytes: number;
        id: number;
        source: string | null;
      }> = [];
      const failures: string[] = [];

      for (const candidate of candidates) {
        try {
          const buffer = await loadEmailAttachmentBuffer(candidate);
          if (buffer.byteLength > 0) {
            recovered.push({
              id: candidate.attachment_id_pk,
              source: candidate.graph_attachment_id?.split(":")[1] ?? null,
              bytes: buffer.byteLength,
            });
          }
        } catch (error) {
          failures.push(
            `${candidate.attachment_id_pk}: ${error instanceof Error ? error.message : String(error)}`
          );
        }

        if (recovered.length >= 2) {
          break;
        }
      }

      console.log("Recovered candidates:", recovered);
      if (failures.length > 0) {
        console.log("Sample failures:", failures.slice(0, 8));
      }

      expect(recovered.length).toBeGreaterThanOrEqual(2);
      expect(recovered[0]?.bytes ?? 0).toBeGreaterThan(0);
      expect(recovered[1]?.bytes ?? 0).toBeGreaterThan(0);
    },
    180_000
  );
});
