/**
 * Download Eva -> Jayson "narrative intake" attachments into the AutoNarrative workspace.
 *
 * What it does:
 * - Queries hub Postgres for emails from Eva to Jayson that include Word docs (.doc/.docx/.docm)
 * - Downloads non-inline Word attachments via Microsoft Graph (app auth)
 * - Writes to: packages/narratives/data/intake/eva-to-jayson/by-email/<email_db_id>/
 * - Handles common failure mode where Jayson deleted the message:
 *   falls back to any other synced mailbox copy (same internet_message_id), then
 *   finally tries Eva's mailbox via Graph filter by internetMessageId.
 *
 * Usage:
 *   bun packages/narratives/scripts/download-eva-to-jayson-attachments.ts --limit 5
 *   bun packages/narratives/scripts/download-eva-to-jayson-attachments.ts --since 2024-11-01
 *   bun packages/narratives/scripts/download-eva-to-jayson-attachments.ts
 *
 * Notes:
 * - Requires AZURE_* Graph credentials and DATABASE_URL to be present (repo .env is fine; Bun loads it).
 * - This is a read-only operation against mailboxes.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { getAppClient } from "@email-cli/commands/config";
import { db } from "@lib/db/client";

import { escapeODataStringLiteral, sanitizeFilename } from "./shared";

const EVA = "eva@desertservices.net";
const JAYSON = "jayson@desertservices.net";

const WORD_EXT_RE = /\.(docx?|docm)$/i;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface EmailRow {
  email_db_id: number;
  message_id: string;
  mailbox_email: string;
  received_at: string;
  subject: string;
  internet_message_id: string | null;
  attachment_names: string;
}

interface AltRow {
  email_db_id: number;
  message_id: string;
  mailbox_email: string;
  received_at: string;
}

// ============================================================================
// Download logic
// ============================================================================

async function downloadWordAttachmentsFromMessage(params: {
  messageId: string;
  mailboxEmail: string;
  outDir: string;
}): Promise<{ downloaded: string[]; available: string[] }> {
  const client = getAppClient();

  const attachments = await client.getAttachments(
    params.messageId,
    params.mailboxEmail
  );
  const available = attachments
    .filter((a) => !a.isInline || WORD_EXT_RE.test(a.name))
    .map((a) => a.name);

  const wanted = attachments.filter((a) => WORD_EXT_RE.test(a.name));

  if (wanted.length === 0) {
    return { available, downloaded: [] };
  }

  const downloaded: string[] = [];
  for (const att of wanted) {
    await sleep(120);

    const safeName = sanitizeFilename(att.name);
    const outPath = join(params.outDir, safeName);

    if (existsSync(outPath)) {
      downloaded.push(safeName);
      continue;
    }

    const MAX_RETRIES = 5;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const content = await client.downloadAttachment(
          params.messageId,
          att.id,
          params.mailboxEmail
        );
        await Bun.write(outPath, content);
        downloaded.push(safeName);
        lastErr = null;
        break;
      } catch (error) {
        lastErr = error;
        const statusCode = (error as { statusCode?: number })?.statusCode;
        if (statusCode === 404) {
          throw error;
        }
        const backoffMs = Math.min(30_000, 1000 * 2 ** attempt);
        const jitterMs = Math.floor(Math.random() * 250);
        await sleep(backoffMs + jitterMs);
      }
    }
    if (lastErr) {
      throw lastErr;
    }
  }

  return { available, downloaded };
}

// ============================================================================
// Marker helpers
// ============================================================================

function hasDoneMarker(outDir: string): boolean {
  return existsSync(join(outDir, ".done.json"));
}

function markDone(outDir: string, payload: Record<string, unknown>): void {
  writeFileSync(
    join(outDir, ".done.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );
  const failedPath = join(outDir, ".failed.json");
  if (existsSync(failedPath)) {
    unlinkSync(failedPath);
  }
}

function markFailed(outDir: string, payload: Record<string, unknown>): void {
  writeFileSync(
    join(outDir, ".failed.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );
}

function _hasAnyWordFiles(outDir: string): boolean {
  if (!existsSync(outDir)) {
    return false;
  }
  return readdirSync(outDir).some((name) => WORD_EXT_RE.test(name));
}

// ============================================================================
// DB queries
// ============================================================================

async function queryEvaToJaysonEmails(
  sinceDate: Date | null
): Promise<EmailRow[]> {
  let query = `
    select
      e.id as email_db_id,
      e.message_id,
      m.email as mailbox_email,
      e.received_at,
      coalesce(e.subject, '') as subject,
      e.internet_message_id,
      coalesce(e.attachment_names, '[]') as attachment_names
    from emails e
    join mailboxes m on m.id = e.mailbox_id
    where lower(m.email) = lower($1)
      and e.from_email ilike 'eva@%'
      and e.to_emails ilike '%jayson@%'
      and e.has_attachments = 1
      and e.attachment_names ilike '%.doc%'
  `;
  const params: unknown[] = [JAYSON];

  if (sinceDate) {
    query += " and e.received_at >= $2";
    params.push(sinceDate.toISOString());
  }

  query += " order by e.received_at desc";
  return await db.query<EmailRow>(query).all(...params);
}

// ============================================================================
// Attempt-building logic
// ============================================================================

interface DownloadAttempt {
  mailboxEmail: string;
  messageId: string;
  emailDbId?: number;
}

async function buildDownloadAttempts(
  row: EmailRow
): Promise<DownloadAttempt[]> {
  const attempts: DownloadAttempt[] = [
    {
      emailDbId: row.email_db_id,
      mailboxEmail: JAYSON,
      messageId: row.message_id,
    },
  ];

  if (row.internet_message_id) {
    const altRows = await db
      .query<AltRow>(
        `
        select
          e.id as email_db_id,
          e.message_id,
          m.email as mailbox_email,
          e.received_at
        from emails e
        join mailboxes m on m.id = e.mailbox_id
        where e.internet_message_id = $1
        order by
          case
            when lower(m.email) = lower($2) then 0
            when lower(m.email) = lower($3) then 1
            else 2
          end,
          e.received_at desc
        `
      )
      .all(row.internet_message_id, EVA, JAYSON);

    for (const alt of altRows) {
      if (
        alt.mailbox_email.toLowerCase() === JAYSON.toLowerCase() &&
        alt.message_id === row.message_id
      ) {
        continue;
      }
      attempts.push({
        emailDbId: alt.email_db_id,
        mailboxEmail: alt.mailbox_email,
        messageId: alt.message_id,
      });
    }

    attempts.push({
      mailboxEmail: EVA,
      messageId: "__LOOKUP_BY_INTERNET_MESSAGE_ID__",
    });
  }

  return attempts;
}

// ============================================================================
// Per-email processing
// ============================================================================

async function processOneEmail(params: {
  row: EmailRow;
  index: number;
  total: number;
  byEmailDir: string;
  resultsTsvPath: string;
  dryRun: boolean;
}): Promise<void> {
  const { row } = params;
  const outDir = join(params.byEmailDir, String(row.email_db_id));
  mkdirSync(outDir, { recursive: true });

  if (hasDoneMarker(outDir)) {
    return;
  }

  const baseLog = {
    email_db_id: row.email_db_id,
    internet_message_id: row.internet_message_id,
    received_at: row.received_at,
    subject: row.subject,
  };

  const prefix = `[${params.index + 1}/${params.total}] email_id=${row.email_db_id}`;
  console.log(`${prefix} downloading...`);

  if (params.dryRun) {
    markDone(outDir, { ...baseLog, dryRun: true });
    appendFileSync(
      params.resultsTsvPath,
      `${row.email_db_id}\t${row.received_at}\t${row.subject}\tDRY_RUN\t\t\t0\t[]\n`,
      "utf8"
    );
    return;
  }

  const attempts = await buildDownloadAttempts(row);
  let succeeded = false;
  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      const resolved = await resolveAttempt(attempt, row);
      if (!resolved) {
        continue;
      }

      const result = await downloadWordAttachmentsFromMessage({
        mailboxEmail: resolved.mailboxEmail,
        messageId: resolved.messageId,
        outDir,
      });

      if (result.downloaded.length === 0) {
        continue;
      }

      markDone(outDir, {
        ...baseLog,
        available_names: result.available,
        downloaded_names: result.downloaded,
        used_email_db_id: resolved.usedEmailDbId,
        used_mailbox: resolved.mailboxEmail,
        used_message_id: resolved.messageId,
      });

      appendFileSync(
        params.resultsTsvPath,
        `${row.email_db_id}\t${row.received_at}\t${row.subject.replaceAll("\t", " ")}\tOK\t${resolved.mailboxEmail}\t${resolved.usedEmailDbId ?? ""}\t${result.downloaded.length}\t${JSON.stringify(result.downloaded)}\n`,
        "utf8"
      );

      succeeded = true;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!succeeded) {
    markFailed(outDir, {
      ...baseLog,
      error: String(
        (lastError as Error | null)?.message ?? lastError ?? "unknown"
      ),
    });
    appendFileSync(
      params.resultsTsvPath,
      `${row.email_db_id}\t${row.received_at}\t${row.subject.replaceAll("\t", " ")}\tFAILED\t\t\t0\t[]\n`,
      "utf8"
    );
  }
}

async function resolveAttempt(
  attempt: DownloadAttempt,
  row: EmailRow
): Promise<{
  mailboxEmail: string;
  messageId: string;
  usedEmailDbId: number | null;
} | null> {
  if (attempt.messageId !== "__LOOKUP_BY_INTERNET_MESSAGE_ID__") {
    return {
      mailboxEmail: attempt.mailboxEmail,
      messageId: attempt.messageId,
      usedEmailDbId: attempt.emailDbId ?? null,
    };
  }

  const internetMessageId = row.internet_message_id;
  if (!internetMessageId) {
    return null;
  }

  const client = getAppClient();
  const matches = await client.filterEmails({
    filter: `internetMessageId eq '${escapeODataStringLiteral(internetMessageId)}'`,
    limit: 5,
    userId: EVA,
  });
  const match = matches.find((m) => m.hasAttachments) ?? matches[0];
  if (!match) {
    return null;
  }

  return {
    mailboxEmail: EVA,
    messageId: match.id,
    usedEmailDbId: null,
  };
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const { values } = parseArgs({
    allowPositionals: false,
    args: Bun.argv.slice(2),
    options: {
      out: {
        type: "string",
        default: "packages/narratives/data/intake/eva-to-jayson",
      },
      since: { type: "string" },
      limit: { type: "string" },
      dryRun: { type: "boolean", default: false },
    },
  });

  const outBase = String(values.out);
  const dryRun = Boolean(values.dryRun);
  const limit = values.limit ? Number.parseInt(String(values.limit), 10) : null;
  const sinceStr = values.since ? String(values.since) : null;
  const sinceDate = sinceStr ? new Date(`${sinceStr}T00:00:00Z`) : null;

  const byEmailDir = join(outBase, "by-email");
  mkdirSync(byEmailDir, { recursive: true });

  const resultsTsvPath = join(outBase, "download-results.tsv");
  writeFileSync(
    resultsTsvPath,
    "email_db_id\treceived_at\tsubject\tstatus\tused_mailbox\tused_email_db_id\tdownloaded_count\tdownloaded_names\n",
    "utf8"
  );

  const rows = await queryEvaToJaysonEmails(sinceDate);

  const emailsTsvPath = join(outBase, "emails.tsv");
  const tsvHeader =
    "email_db_id\tmessage_id\tmailbox_email\treceived_at\tsubject\tinternet_message_id\tattachment_names\n";
  const tsvLines = rows.map((r) =>
    [
      r.email_db_id,
      r.message_id,
      r.mailbox_email,
      r.received_at,
      r.subject.replaceAll("\t", " ").replaceAll("\n", " "),
      r.internet_message_id ?? "",
      r.attachment_names.replaceAll("\t", " ").replaceAll("\n", " "),
    ].join("\t")
  );
  writeFileSync(emailsTsvPath, `${tsvHeader}${tsvLines.join("\n")}\n`, "utf8");

  const toProcess = limit ? rows.slice(0, limit) : rows;
  console.log(
    `Found ${rows.length} Jayson mailbox emails (eva->jayson) with Word attachments. Processing ${toProcess.length}.`
  );

  for (let i = 0; i < toProcess.length; i++) {
    const row = toProcess[i];
    await processOneEmail({
      byEmailDir,
      dryRun,
      index: i,
      resultsTsvPath,
      row,
      total: toProcess.length,
    });
  }

  console.log(`Done. Output: ${outBase}`);
}

await main();
