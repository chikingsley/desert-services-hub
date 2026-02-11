/**
 * Download Eva -> Jayson "narrative intake" attachments into the AutoNarrative workspace.
 *
 * What it does:
 * - Queries hub Postgres for emails from Eva to Jayson that include Word docs (.doc/.docx/.docm)
 * - Downloads non-inline Word attachments via Microsoft Graph (app auth)
 * - Writes to: apps/narrative/data/intake/eva-to-jayson/by-email/<email_db_id>/
 * - Handles common failure mode where Jayson deleted the message:
 *   falls back to any other synced mailbox copy (same internet_message_id), then
 *   finally tries Eva's mailbox via Graph filter by internetMessageId.
 *
 * Usage:
 *   bun apps/narrative/scripts/download-eva-to-jayson-attachments.ts --limit 5
 *   bun apps/narrative/scripts/download-eva-to-jayson-attachments.ts --since 2024-11-01
 *   bun apps/narrative/scripts/download-eva-to-jayson-attachments.ts
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
import { getAppClient } from "@email/commands/config";
import { db } from "@lib/db/hub";

const EVA = "eva@desertservices.net";
const JAYSON = "jayson@desertservices.net";

const WORD_EXT_RE = /\.(docx?|docm)$/i;

function sanitizeFilename(name: string): string {
  // Prevent any accidental path traversal from attachment names.
  return name.replaceAll("/", "_").replaceAll("\\", "_");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeODataStringLiteral(value: string): string {
  // OData string literals escape single quotes by doubling them.
  return value.replaceAll("'", "''");
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
  // "Inline" usually means signature images, but we've seen Word docs show up
  // as inline when attached as cloud/reference files. Keep Word docs regardless
  // of isInline.
  const available = attachments
    .filter((a) => !a.isInline || WORD_EXT_RE.test(a.name))
    .map((a) => a.name);

  const wanted = attachments.filter((a) => WORD_EXT_RE.test(a.name));

  if (wanted.length === 0) {
    return { downloaded: [], available };
  }

  const downloaded: string[] = [];
  for (const att of wanted) {
    // Avoid hammering Graph: keep downloads comfortably under per-mailbox limits.
    await sleep(120);

    const safeName = sanitizeFilename(att.name);
    const outPath = join(params.outDir, safeName);

    // Skip if it already exists (allows resume).
    if (existsSync(outPath)) {
      downloaded.push(safeName);
      continue;
    }

    // Basic retry for transient Graph errors (429/5xx).
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
      } catch (err) {
        lastErr = err;
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404) {
          // Not recoverable for this mailbox/message.
          throw err;
        }
        // Exponential-ish backoff with jitter.
        const backoffMs = Math.min(30_000, 1000 * 2 ** attempt);
        const jitterMs = Math.floor(Math.random() * 250);
        await sleep(backoffMs + jitterMs);
      }
    }
    if (lastErr) {
      throw lastErr;
    }
  }

  return { downloaded, available };
}

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

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      out: {
        type: "string",
        default: "apps/narrative/data/intake/eva-to-jayson",
      },
      since: { type: "string" }, // YYYY-MM-DD
      limit: { type: "string" },
      dryRun: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  const outBase = String(values.out);
  const dryRun = Boolean(values.dryRun);
  const limit = values.limit ? Number.parseInt(String(values.limit), 10) : null;
  const sinceStr = values.since ? String(values.since) : null;
  const sinceDate = sinceStr ? new Date(`${sinceStr}T00:00:00Z`) : null;

  const byEmailDir = join(outBase, "by-email");
  mkdirSync(byEmailDir, { recursive: true });

  const emailsTsvPath = join(outBase, "emails.tsv");
  const resultsTsvPath = join(outBase, "download-results.tsv");

  // Fresh results file per run; keep the raw emails list stable.
  writeFileSync(
    resultsTsvPath,
    "email_db_id\treceived_at\tsubject\tstatus\tused_mailbox\tused_email_db_id\tdownloaded_count\tdownloaded_names\n",
    "utf8"
  );

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
    where lower(m.email) = lower(?)
      and e.from_email ilike 'eva@%'
      and e.to_emails ilike '%jayson@%'
      and e.has_attachments = 1
      and e.attachment_names ilike '%.doc%'
  `;
  const params: unknown[] = [JAYSON];

  if (sinceDate) {
    query += " and e.received_at >= ?";
    params.push(sinceDate.toISOString());
  }

  query += " order by e.received_at desc";

  const rows = await db.query<EmailRow>(query).all(...params);

  // Write a stable index of the input set.
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
    const outDir = join(byEmailDir, String(row.email_db_id));
    mkdirSync(outDir, { recursive: true });

    if (hasDoneMarker(outDir)) {
      continue;
    }

    const baseLog = {
      email_db_id: row.email_db_id,
      received_at: row.received_at,
      subject: row.subject,
      internet_message_id: row.internet_message_id,
    };

    const prefix = `[${i + 1}/${toProcess.length}] email_id=${row.email_db_id}`;
    console.log(`${prefix} downloading...`);

    if (dryRun) {
      markDone(outDir, { ...baseLog, dryRun: true });
      appendFileSync(
        resultsTsvPath,
        `${row.email_db_id}\t${row.received_at}\t${row.subject}\tDRY_RUN\t\t\t0\t[]\n`,
        "utf8"
      );
      continue;
    }

    const attempts: Array<{
      mailboxEmail: string;
      messageId: string;
      emailDbId?: number;
    }> = [];
    attempts.push({
      mailboxEmail: JAYSON,
      messageId: row.message_id,
      emailDbId: row.email_db_id,
    });

    // Add DB-known alternates by internet_message_id (often includes Eva's copy).
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
          where e.internet_message_id = ?
          order by
            case
              when lower(m.email) = lower(?) then 0
              when lower(m.email) = lower(?) then 1
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
          mailboxEmail: alt.mailbox_email,
          messageId: alt.message_id,
          emailDbId: alt.email_db_id,
        });
      }
    }

    // Finally, we can search Eva's mailbox by internetMessageId even if her copy
    // was not synced into Postgres (common if Sent Items isn't fully synced).
    if (row.internet_message_id) {
      attempts.push({
        mailboxEmail: EVA,
        messageId: "__LOOKUP_BY_INTERNET_MESSAGE_ID__",
      });
    }

    let succeeded = false;
    let lastError: unknown = null;

    for (const attempt of attempts) {
      try {
        let messageId = attempt.messageId;
        let mailboxEmail = attempt.mailboxEmail;
        let usedEmailDbId: number | null = attempt.emailDbId ?? null;

        if (messageId === "__LOOKUP_BY_INTERNET_MESSAGE_ID__") {
          const internetMessageId = row.internet_message_id;
          if (!internetMessageId) {
            continue;
          }
          const client = getAppClient();
          const matches = await client.filterEmails({
            userId: EVA,
            limit: 5,
            filter: `internetMessageId eq '${escapeODataStringLiteral(internetMessageId)}'`,
          });
          const match = matches.find((m) => m.hasAttachments) ?? matches[0];
          if (!match) {
            continue;
          }
          messageId = match.id;
          mailboxEmail = EVA;
          usedEmailDbId = null;
        }

        const result = await downloadWordAttachmentsFromMessage({
          messageId,
          mailboxEmail,
          outDir,
        });

        if (result.downloaded.length === 0) {
          // No Word docs on that copy; keep trying.
          continue;
        }

        markDone(outDir, {
          ...baseLog,
          used_mailbox: mailboxEmail,
          used_message_id: messageId,
          used_email_db_id: usedEmailDbId,
          downloaded_names: result.downloaded,
          available_names: result.available,
        });

        appendFileSync(
          resultsTsvPath,
          `${row.email_db_id}\t${row.received_at}\t${row.subject.replaceAll("\t", " ")}\tOK\t${mailboxEmail}\t${usedEmailDbId ?? ""}\t${result.downloaded.length}\t${JSON.stringify(result.downloaded)}\n`,
          "utf8"
        );

        succeeded = true;
        break;
      } catch (err) {
        lastError = err;
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
        resultsTsvPath,
        `${row.email_db_id}\t${row.received_at}\t${row.subject.replaceAll("\t", " ")}\tFAILED\t\t\t0\t[]\n`,
        "utf8"
      );
    }
  }

  console.log(`Done. Output: ${outBase}`);
}

await main();
