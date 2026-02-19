import {
  CURRENT_BODY_LINK_SCAN_VERSION,
  processBodyLinksForEmail,
} from "@email/sync/body-link-sync";
import { db } from "@lib/db/client";
import { appendEmailAttachmentNames } from "@lib/db/repositories/email";

interface BackfillEmailRow {
  body_full: string | null;
  body_html: string | null;
  id: number;
  mailbox_email: string;
  received_at: string;
  subject: string | null;
}

interface BackfillOptions {
  before: string | null;
  force: boolean;
  limit: number;
  mailboxes: string;
  maxLinks: number | undefined;
  since: string;
}

function getArgValue(args: string[], flag: string): string | undefined {
  const equalsArg = args.find((arg) => arg.startsWith(`--${flag}=`));
  if (equalsArg) {
    return equalsArg.split("=", 2)[1];
  }

  const argIndex = args.indexOf(`--${flag}`);
  const value = args[argIndex + 1];
  if (argIndex === -1 || !value || value.startsWith("--")) {
    return undefined;
  }
  return value;
}

function parsePositiveInteger(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function parseOptions(args: string[]): BackfillOptions {
  const mailboxValue = getArgValue(args, "mailbox");
  const sinceValue = getArgValue(args, "since") ?? "2026-01-01";
  const beforeValue = getArgValue(args, "before") ?? null;
  const limit = parsePositiveInteger(getArgValue(args, "limit")) ?? 200;
  const maxLinks = parsePositiveInteger(getArgValue(args, "max-links"));

  return {
    before: beforeValue,
    force: args.includes("--force"),
    limit,
    mailboxes:
      mailboxValue
        ?.split(",")
        .map((mailbox) => mailbox.trim().toLowerCase())
        .filter(Boolean)
        .join(",") ?? "",
    maxLinks,
    since: sinceValue,
  };
}

function printHelp(): void {
  console.log(`
Body-Link Backfill

Usage:
  bun packages/email/cli/cli.ts body-link-backfill [options]

Options:
  --mailbox <list>    Mailbox(es), comma-separated (default: all)
  --since <date>      Include emails received on/after date (default: 2026-01-01)
  --before <date>     Include emails received before date (optional)
  --limit <n>         Max emails to process (default: 200)
  --max-links <n>     Max body links per email (optional)
  --force             Re-scan emails already marked complete
`);
}

async function loadCandidateEmails(
  options: BackfillOptions
): Promise<BackfillEmailRow[]> {
  return await db
    .query<
      BackfillEmailRow,
      [string, string | null, string, number, boolean, number]
    >(
      `SELECT
         e.id,
         e.subject,
         e.received_at::text,
         e.body_html,
         e.body_full,
         m.email AS mailbox_email
       FROM emails e
       JOIN mailboxes m ON m.id = e.mailbox_id
       WHERE e.received_at >= $1
         AND ($2::timestamptz IS NULL OR e.received_at < $2::timestamptz)
         AND ($3 = '' OR lower(m.email) = ANY(string_to_array($3, ',')))
         AND (
           e.body_html ILIKE '%egnyte.com/fl/%' OR e.body_full ILIKE '%egnyte.com/fl/%' OR
           e.body_html ILIKE '%dropbox.com/%' OR e.body_full ILIKE '%dropbox.com/%' OR
           e.body_html ILIKE '%app.buildingconnected.com/goto/%' OR
           e.body_full ILIKE '%app.buildingconnected.com/goto/%' OR
           e.body_html ILIKE '%onedrive.live.com/%' OR e.body_full ILIKE '%onedrive.live.com/%' OR
           e.body_html ILIKE '%sharepoint.com/%' OR e.body_full ILIKE '%sharepoint.com/%'
         )
         AND (
           $5::boolean = TRUE
           OR COALESCE(e.body_link_scan_version, 0) < $6
           OR COALESCE(e.body_link_scan_status, 'pending')
             NOT IN ('no_links', 'success', 'gated', 'failed')
         )
       ORDER BY
         CASE
           WHEN COALESCE(e.body_link_scan_version, 0) >= $6
            AND COALESCE(e.body_link_scan_status, 'pending')
              IN ('no_links', 'success', 'gated', 'failed')
           THEN 1
           ELSE 0
         END,
         e.received_at DESC
       LIMIT $4`
    )
    .all(
      options.since,
      options.before,
      options.mailboxes,
      options.limit,
      options.force,
      CURRENT_BODY_LINK_SCAN_VERSION
    );
}

export async function handleBodyLinkBackfill(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const options = parseOptions(args);
  const candidates = await loadCandidateEmails(options);

  console.log("=".repeat(68));
  console.log("BODY-LINK BACKFILL");
  console.log("=".repeat(68));
  console.log(`Since: ${options.since}`);
  console.log(`Before: ${options.before ?? "none"}`);
  console.log(`Mailbox filter: ${options.mailboxes || "all"}`);
  console.log(`Limit: ${options.limit}`);
  console.log(`Force re-scan: ${options.force ? "yes" : "no"}`);
  console.log(`Candidate emails: ${candidates.length}`);
  if (options.maxLinks) {
    console.log(`Max links per email: ${options.maxLinks}`);
  }
  console.log("=".repeat(68));

  let processed = 0;
  let skipped = 0;
  let attachmentsInserted = 0;
  let linksFound = 0;
  let failures = 0;

  const statusCounts = new Map<string, number>();

  for (const [index, email] of candidates.entries()) {
    const result = await processBodyLinksForEmail({
      bodyHtml: email.body_html,
      bodyText: email.body_full,
      emailId: email.id,
      forceRescan: options.force,
      mailboxEmail: email.mailbox_email,
      maxLinks: options.maxLinks,
    });

    statusCounts.set(result.status, (statusCounts.get(result.status) ?? 0) + 1);
    linksFound += result.linksFound;
    failures += result.failures.length;

    if (result.skipped) {
      skipped += 1;
    } else {
      processed += 1;
      attachmentsInserted += result.attachmentsInserted;
    }

    if (result.names.length > 0) {
      await appendEmailAttachmentNames(email.id, result.names);
    }

    if ((index + 1) % 25 === 0 || index + 1 === candidates.length) {
      console.log(
        `[body-link-backfill] ${index + 1}/${candidates.length} processed=${processed} skipped=${skipped} attachments=${attachmentsInserted} failures=${failures}`
      );
    }
  }

  console.log("-".repeat(68));
  console.log(`Processed emails: ${processed}`);
  console.log(`Skipped emails: ${skipped}`);
  console.log(`Links found: ${linksFound}`);
  console.log(`Attachments inserted: ${attachmentsInserted}`);
  console.log(`Failures: ${failures}`);
  for (const [status, count] of [...statusCounts.entries()].sort()) {
    console.log(`Status ${status}: ${count}`);
  }
}
