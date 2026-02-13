#!/usr/bin/env bun

/**
 * Migrate stored `emails.message_id` values to Graph immutable IDs.
 *
 * Why:
 * - Default Graph message IDs can change when items move folders.
 * - Immutable IDs stay stable within the mailbox, so attachment/document fetches
 *   don't break as easily after organizer moves.
 *
 * Notes:
 * - This migration only updates rows when the immutable target ID is not already
 *   present in `emails.message_id` (to avoid unique-key collisions).
 * - Colliding rows are counted and left unchanged for later dedupe/merge.
 *
 * Usage:
 *   bun apps/cli-tools/email-cli/src/sync/immutable-ids.ts
 *   bun apps/cli-tools/email-cli/src/sync/immutable-ids.ts --mailbox contracts@desertservices.net,denise@desertservices.net
 *   bun apps/cli-tools/email-cli/src/sync/immutable-ids.ts --batch-size 500 --max-rows 10000
 *   bun apps/cli-tools/email-cli/src/sync/immutable-ids.ts --dry-run
 */

import { GraphEmailClient } from "@email/client";
import { db } from "@lib/db/hub";

interface MailboxWorkRow {
  id: number;
  email: string;
  email_rows: number;
}

interface EmailRow {
  id: number;
  message_id: string;
}

interface BatchMappingRow {
  email_id: number;
  old_id: string;
  new_id: string;
}

interface MailboxStats {
  mailbox: string;
  scanned: number;
  translationMisses: number;
  alreadyImmutable: number;
  candidates: number;
  updated: number;
  collisions: number;
}

function getArgValue(args: string[], flag: string): string | undefined {
  const eqArg = args.find((a) => a.startsWith(`--${flag}=`));
  if (eqArg) {
    return eqArg.slice(`--${flag}=`.length);
  }
  const idx = args.indexOf(`--${flag}`);
  const nextArg = args[idx + 1];
  if (idx !== -1 && nextArg && !nextArg.startsWith("--")) {
    return nextArg;
  }
  return undefined;
}

async function getMailboxesToProcess(
  mailboxArg?: string
): Promise<MailboxWorkRow[]> {
  if (mailboxArg) {
    const requested = mailboxArg
      .split(",")
      .map((m) => m.trim().toLowerCase())
      .filter(Boolean);

    const rows = await db
      .query<MailboxWorkRow>(
        `SELECT m.id, m.email, COUNT(e.id)::int AS email_rows
         FROM mailboxes m
         LEFT JOIN emails e ON e.mailbox_id = m.id
         WHERE lower(m.email) = ANY (string_to_array(?, ','))
         GROUP BY m.id, m.email
         ORDER BY m.email`
      )
      .all(requested.join(","));

    const found = new Set(rows.map((r) => r.email.toLowerCase()));
    for (const mailbox of requested) {
      if (!found.has(mailbox)) {
        console.warn(`[immutable-ids] Mailbox not found: ${mailbox}`);
      }
    }

    return rows.filter((r) => r.email_rows > 0);
  }

  return await db
    .query<MailboxWorkRow>(
      `SELECT m.id, m.email, COUNT(e.id)::int AS email_rows
       FROM mailboxes m
       JOIN emails e ON e.mailbox_id = m.id
       GROUP BY m.id, m.email
       ORDER BY m.email`
    )
    .all();
}

async function updateBatchMappings(
  mappings: BatchMappingRow[],
  dryRun: boolean
): Promise<{ updated: number; collisions: number }> {
  if (mappings.length === 0) {
    return { updated: 0, collisions: 0 };
  }

  const payload = JSON.stringify(mappings);

  if (dryRun) {
    const row = await db
      .query<{ updated: number; collisions: number }, [string]>(
        `WITH map_rows AS (
           SELECT
             (x->>'email_id')::integer AS email_id,
             x->>'old_id' AS old_id,
             x->>'new_id' AS new_id
           FROM jsonb_array_elements(?::jsonb) AS x
         ),
         colliding AS (
           SELECT DISTINCT m.email_id
           FROM map_rows m
           JOIN emails e2
             ON e2.message_id = m.new_id
            AND e2.id <> m.email_id
         )
         SELECT
           ((SELECT COUNT(*) FROM map_rows) - (SELECT COUNT(*) FROM colliding))::int AS updated,
           (SELECT COUNT(*)::int FROM colliding) AS collisions`
      )
      .get(payload);

    return {
      updated: row?.updated ?? 0,
      collisions: row?.collisions ?? 0,
    };
  }

  const row = await db
    .query<{ updated: number; collisions: number }, [string]>(
      `WITH map_rows AS (
         SELECT
           (x->>'email_id')::integer AS email_id,
           x->>'old_id' AS old_id,
           x->>'new_id' AS new_id
         FROM jsonb_array_elements(?::jsonb) AS x
       ),
       colliding AS (
         SELECT DISTINCT m.email_id
         FROM map_rows m
         JOIN emails e2
           ON e2.message_id = m.new_id
          AND e2.id <> m.email_id
       ),
       updated AS (
         UPDATE emails e
            SET message_id = m.new_id
           FROM map_rows m
          WHERE e.id = m.email_id
            AND e.message_id = m.old_id
            AND NOT EXISTS (
              SELECT 1
              FROM colliding c
              WHERE c.email_id = e.id
            )
         RETURNING e.id
       )
       SELECT
         (SELECT COUNT(*)::int FROM updated) AS updated,
         (SELECT COUNT(*)::int FROM colliding) AS collisions`
    )
    .get(payload);

  return {
    updated: row?.updated ?? 0,
    collisions: row?.collisions ?? 0,
  };
}

async function processMailbox(options: {
  client: GraphEmailClient;
  mailbox: MailboxWorkRow;
  batchSize: number;
  dryRun: boolean;
  maxRows: number | null;
}): Promise<MailboxStats> {
  const { client, mailbox, batchSize, dryRun, maxRows } = options;

  const stats: MailboxStats = {
    mailbox: mailbox.email,
    scanned: 0,
    translationMisses: 0,
    alreadyImmutable: 0,
    candidates: 0,
    updated: 0,
    collisions: 0,
  };

  let cursorId = 0;

  while (true) {
    const remaining =
      maxRows === null ? batchSize : Math.max(0, maxRows - stats.scanned);
    if (remaining === 0) {
      break;
    }
    const effectiveBatch = Math.min(batchSize, remaining);

    const rows = await db
      .query<EmailRow, [number, number, number]>(
        `SELECT id, message_id
         FROM emails
         WHERE mailbox_id = ?
           AND id > ?
         ORDER BY id
         LIMIT ?`
      )
      .all(mailbox.id, cursorId, effectiveBatch);

    if (rows.length === 0) {
      break;
    }

    cursorId = rows.at(-1)?.id ?? cursorId;
    stats.scanned += rows.length;

    const translated = await client.translateMessageIdsToImmutable(
      rows.map((r) => r.message_id),
      mailbox.email
    );

    const mappings: BatchMappingRow[] = [];
    for (const row of rows) {
      const immutableId = translated.get(row.message_id);
      if (!immutableId) {
        stats.translationMisses++;
        continue;
      }
      if (immutableId === row.message_id) {
        stats.alreadyImmutable++;
        continue;
      }
      mappings.push({
        email_id: row.id,
        old_id: row.message_id,
        new_id: immutableId,
      });
    }

    stats.candidates += mappings.length;

    const applied = await updateBatchMappings(mappings, dryRun);
    stats.updated += applied.updated;
    stats.collisions += applied.collisions;

    if (
      stats.scanned % (batchSize * 10) === 0 ||
      rows.length < effectiveBatch
    ) {
      console.log(
        `[immutable-ids] ${mailbox.email}: scanned=${stats.scanned}/${maxRows ?? mailbox.email_rows} candidates=${stats.candidates} updated=${stats.updated} collisions=${stats.collisions}`
      );
    }
  }

  return stats;
}

async function createDelegatedClient(
  preferredUsername?: string
): Promise<GraphEmailClient> {
  const config = {
    azureTenantId: process.env.AZURE_TENANT_ID ?? "",
    azureClientId: process.env.AZURE_CLIENT_ID ?? "",
    azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
    batchSize: 250,
  };

  if (
    !(config.azureTenantId && config.azureClientId && config.azureClientSecret)
  ) {
    throw new Error("Missing Azure credentials in environment variables");
  }

  const client = new GraphEmailClient(config);
  await client.initUserAuth(preferredUsername);
  return client;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const mailboxArg = getArgValue(args, "mailbox");
  const authMode = (getArgValue(args, "auth") ?? "app").toLowerCase();
  const preferredUsername = getArgValue(args, "username");
  const batchSizeArg = Number.parseInt(
    getArgValue(args, "batch-size") ?? "500",
    10
  );
  const maxRowsArgRaw = getArgValue(args, "max-rows");
  const maxRowsArg =
    maxRowsArgRaw !== undefined ? Number.parseInt(maxRowsArgRaw, 10) : null;
  const dryRun = args.includes("--dry-run");

  const batchSize = Number.isFinite(batchSizeArg)
    ? Math.max(1, Math.min(1000, batchSizeArg))
    : 500;
  const maxRows =
    maxRowsArg !== null && Number.isFinite(maxRowsArg) && maxRowsArg > 0
      ? maxRowsArg
      : null;

  const mailboxes = await getMailboxesToProcess(mailboxArg);
  if (mailboxes.length === 0) {
    console.log("[immutable-ids] No mailboxes with email rows found.");
    process.exit(0);
  }

  const totalRows = mailboxes.reduce((sum, mb) => sum + mb.email_rows, 0);

  console.log("=".repeat(60));
  console.log("EMAIL MESSAGE_ID -> IMMUTABLE_ID MIGRATION");
  console.log("=".repeat(60));
  console.log(`Mode: ${dryRun ? "DRY RUN" : "APPLY"}`);
  console.log(`Mailboxes: ${mailboxes.length}`);
  console.log(`Rows in scope: ${totalRows.toLocaleString()}`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Max rows per mailbox: ${maxRows ?? "unbounded"}`);
  console.log("=".repeat(60));

  if (authMode !== "user") {
    console.error(
      '[immutable-ids] Graph translateExchangeIds does not support application permissions. Re-run with "--auth user" (device login).'
    );
    process.exit(2);
  }

  const startedAt = Date.now();

  let totalScanned = 0;
  let totalMisses = 0;
  let totalAlreadyImmutable = 0;
  let totalCandidates = 0;
  let totalUpdated = 0;
  let totalCollisions = 0;
  const client = await createDelegatedClient(preferredUsername);

  for (const mailbox of mailboxes) {
    const stats = await processMailbox({
      client,
      mailbox,
      batchSize,
      dryRun,
      maxRows,
    });

    totalScanned += stats.scanned;
    totalMisses += stats.translationMisses;
    totalAlreadyImmutable += stats.alreadyImmutable;
    totalCandidates += stats.candidates;
    totalUpdated += stats.updated;
    totalCollisions += stats.collisions;

    console.log(
      `[immutable-ids] done ${stats.mailbox}: scanned=${stats.scanned}, misses=${stats.translationMisses}, alreadyImmutable=${stats.alreadyImmutable}, candidates=${stats.candidates}, updated=${stats.updated}, collisions=${stats.collisions}`
    );
  }

  const elapsedMs = Date.now() - startedAt;
  const rowsPerMinute =
    elapsedMs > 0 ? (totalScanned / elapsedMs) * 60_000 : totalScanned;

  console.log("-".repeat(60));
  console.log(
    `[immutable-ids] COMPLETE (${dryRun ? "dry-run" : "apply"}): scanned=${totalScanned.toLocaleString()}, misses=${totalMisses.toLocaleString()}, alreadyImmutable=${totalAlreadyImmutable.toLocaleString()}, candidates=${totalCandidates.toLocaleString()}, updated=${totalUpdated.toLocaleString()}, collisions=${totalCollisions.toLocaleString()}, elapsedMs=${elapsedMs}, rowsPerMinute=${rowsPerMinute.toFixed(2)}`
  );

  if (totalCollisions > 0) {
    console.log(
      "[immutable-ids] Note: collisions were skipped (target immutable ID already existed)."
    );
  }
}
