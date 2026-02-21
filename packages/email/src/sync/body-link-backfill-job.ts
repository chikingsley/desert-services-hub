import { processBodyLinksForEmail } from "@email/sync/body-link-sync";
import { db } from "@lib/db/client";

interface BackfillEmailRow {
  body_full: string | null;
  body_html: string | null;
  id: number;
  mailbox_email: string;
  received_at: string;
  subject: string | null;
}

export interface BodyLinkBackfillOptions {
  since: Date;
  limit: number;
  mailbox?: string;
  maxLinks?: number;
}

export async function runBodyLinkBackfill(
  options: BodyLinkBackfillOptions
): Promise<void> {
  let query = `
    SELECT e.id, e.subject, e.received_at, m.email as mailbox_email, e.body_full, e.body_html
    FROM emails e
    JOIN mailboxes m ON m.id = e.mailbox_id
    WHERE e.received_at >= $1
  `;
  const params: string[] = [options.since.toISOString()];

  if (options.mailbox) {
    params.push(options.mailbox);
    query += " AND m.email = $2";
  }

  query += ` ORDER BY e.received_at DESC LIMIT ${options.limit}`;

  const candidates = await db.query<BackfillEmailRow>(query).all(...params);

  if (candidates.length === 0) {
    console.log(
      `[worker] Body link backfill: no candidates found since ${options.since.toISOString()}`
    );
    return;
  }

  let processed = 0;
  let skipped = 0;
  let attachmentsInserted = 0;
  let linksFound = 0;
  let failures = 0;

  for (const email of candidates) {
    try {
      const result = await processBodyLinksForEmail({
        bodyHtml: email.body_html,
        bodyText: email.body_full,
        emailId: email.id,
        forceRescan: false,
        mailboxEmail: email.mailbox_email,
        maxLinks: options.maxLinks,
      });

      processed++;
      if (result.skipped) {
        skipped++;
      } else {
        attachmentsInserted += result.attachmentsInserted;
        linksFound += result.linksFound;
      }
    } catch (err) {
      failures++;
      console.error(
        `[worker] Body link backfill failed for email ${email.id}:`,
        err
      );
    }
  }

  console.log(
    `[worker] Body link backfill: processed=${processed}, skipped=${skipped}, linksFound=${linksFound}, attachmentsInserted=${attachmentsInserted}, failures=${failures}`
  );
}
