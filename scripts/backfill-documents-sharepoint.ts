import { existsSync } from "node:fs";

import { db } from "@lib/db/client";
import { shouldPersistSourceToSharePointByPolicy } from "@email/sender-policy";
import { createGraphClient } from "@lib/graph/mail";
import {
  createSharePointClientFromEnv,
  uploadBufferToUncategorized,
} from "@sharepoint/intake-upload";

const DEFAULT_LIMIT = 50;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_TIMEOUT_MS = 60_000;

interface CandidateRow {
  email_classification: string | null;
  email_id: number | null;
  email_is_excluded: number | null;
  file_name: string | null;
  file_path: string | null;
  id: number;
  local_path: string | null;
  mailbox_email: string | null;
  message_id: string | null;
  outlook_attachment_id: string | null;
  storage_path: string | null;
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  max: number
): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function parseOptionalPositiveInt(
  raw: string | undefined,
  max: number
): number | null {
  if (!raw) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return Math.min(parsed, max);
}

function hasFlag(name: string): boolean {
  return Bun.argv.includes(name);
}

function getArgValue(name: string): string | undefined {
  const direct = Bun.argv.find((arg) => arg.startsWith(`${name}=`));
  if (direct) {
    return direct.slice(name.length + 1);
  }

  const index = Bun.argv.indexOf(name);
  return index >= 0 ? Bun.argv[index + 1] : undefined;
}

function resolveLocalPath(row: CandidateRow): string | null {
  const candidates = [row.local_path, row.storage_path, row.file_path];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed?.startsWith("/app/data/") && existsSync(trimmed)) {
      return trimmed;
    }
  }

  return null;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(timeoutMessage)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function loadCandidateBuffer(
  row: CandidateRow
): Promise<{ buffer: Buffer; source: "graph" | "local" }> {
  const localPath = resolveLocalPath(row);
  if (localPath) {
    return {
      buffer: Buffer.from(await Bun.file(localPath).arrayBuffer()),
      source: "local",
    };
  }

  if (!(row.message_id && row.outlook_attachment_id && row.mailbox_email)) {
    throw new Error("Missing Graph metadata and no local file is available");
  }

  const graph = createGraphClient();
  return {
    buffer: await graph.downloadAttachment(
      row.message_id,
      row.outlook_attachment_id,
      row.mailbox_email
    ),
    source: "graph",
  };
}

async function persistCandidate(
  row: CandidateRow,
  dryRun: boolean,
  timeoutMs: number
): Promise<{
  id: number;
  sharepointPath?: string;
  source?: "graph" | "local";
  status: "dry_run" | "failed" | "skipped_policy" | "updated";
}> {
  try {
    if (
      !shouldPersistSourceToSharePointByPolicy({
        classification: row.email_classification,
        isExcluded: row.email_is_excluded === 1,
      })
    ) {
      return { id: row.id, status: "skipped_policy" };
    }

    const { buffer, source } = await withTimeout(
      loadCandidateBuffer(row),
      timeoutMs,
      `Document ${row.id} source load timed out after ${timeoutMs}ms`
    );
    if (dryRun) {
      return { id: row.id, source, status: "dry_run" };
    }

    const sharePointClient = createSharePointClientFromEnv();
    if (!sharePointClient) {
      throw new Error("SharePoint client not configured");
    }

    const persisted = await withTimeout(
      uploadBufferToUncategorized(sharePointClient, {
        buffer,
        originalFileName: row.file_name ?? `document-${row.id}`,
      }),
      timeoutMs,
      `Document ${row.id} SharePoint upload timed out after ${timeoutMs}ms`
    );

    await db.transaction(async () => {
      await db.run(
        `UPDATE documents
         SET sharepoint_path = $2,
             sharepoint_url = $3,
             updated_at = now()
         WHERE id = $1`,
        [row.id, persisted.sharepointPath, persisted.sharepointUrl]
      );

      if (row.email_id && row.outlook_attachment_id) {
        await db.run(
          `UPDATE documents
           SET sharepoint_path = COALESCE($3, sharepoint_path),
               sharepoint_url = COALESCE($4, sharepoint_url),
               updated_at = now()
           WHERE source = 'email_attachment'
             AND email_id = $1
             AND outlook_attachment_id = $2`,
          [
            row.email_id,
            row.outlook_attachment_id,
            persisted.sharepointPath,
            persisted.sharepointUrl,
          ]
        );
      }
    });

    return {
      id: row.id,
      sharepointPath: persisted.sharepointPath,
      source,
      status: "updated",
    };
  } catch (error) {
    console.error(
      `[sharepoint-backfill] document ${row.id} failed:`,
      error instanceof Error ? error.message : String(error)
    );
    return { id: row.id, status: "failed" };
  }
}

async function main(): Promise<void> {
  const limit = parsePositiveInt(getArgValue("--limit"), DEFAULT_LIMIT, 500);
  const concurrency = parsePositiveInt(
    getArgValue("--concurrency"),
    DEFAULT_CONCURRENCY,
    10
  );
  const maxId = parseOptionalPositiveInt(
    getArgValue("--max-id"),
    2_147_483_647
  );
  const timeoutMs = parsePositiveInt(
    getArgValue("--timeout-ms"),
    DEFAULT_TIMEOUT_MS,
    600_000
  );
  const dryRun = hasFlag("--dry-run");

  const rows = await db
    .query<CandidateRow, [number, number | null]>(
      `SELECT
         d.id,
         d.email_id,
         d.file_name,
         d.file_path,
         d.local_path,
         d.storage_path,
         d.outlook_attachment_id,
         e.classification AS email_classification,
         e.is_excluded AS email_is_excluded,
         e.message_id,
         m.email AS mailbox_email
       FROM documents d
       JOIN emails e ON e.id = d.email_id
       JOIN mailboxes m ON m.id = e.mailbox_id
       WHERE d.source = 'parsed'
         AND d.extraction_status = 'success'
         AND d.sharepoint_path IS NULL
         AND d.outlook_attachment_id IS NOT NULL
         AND COALESCE(e.is_excluded, 0) = 0
         AND (e.classification IS NULL OR e.classification NOT IN ('HR', 'IT', 'SPAM'))
         AND ($2::int IS NULL OR d.id < $2)
       ORDER BY d.id DESC
       LIMIT $1`
    )
    .all(limit, maxId);

  if (rows.length === 0) {
    console.log(
      JSON.stringify({
        concurrency,
        dryRun,
        limit,
        maxId,
        scanned: 0,
        status: "no_candidates",
        timeoutMs,
      })
    );
    return;
  }

  const summary = {
    dryRun,
    failed: 0,
    limit,
    maxId,
    nextMaxId: rows.at(-1)?.id ?? null,
    scanned: rows.length,
    skipped: 0,
    timeoutMs,
    updated: 0,
  };

  for (let index = 0; index < rows.length; index += concurrency) {
    const batch = rows.slice(index, index + concurrency);
    const results = await Promise.all(
      batch.map(async (row) => await persistCandidate(row, dryRun, timeoutMs))
    );

    for (const result of results) {
      if (result.status === "updated") {
        summary.updated += 1;
        console.log(
          `[sharepoint-backfill] updated ${result.id} via ${result.source}: ${result.sharepointPath}`
        );
      } else if (result.status === "failed") {
        summary.failed += 1;
      } else if (result.status === "skipped_policy") {
        summary.skipped += 1;
        console.log(`[sharepoint-backfill] skipped ${result.id} by policy`);
      } else {
        summary.updated += 1;
        console.log(
          `[sharepoint-backfill] dry-run ${result.id} via ${result.source}`
        );
      }
    }
  }

  console.log(JSON.stringify(summary));
}

await main();
