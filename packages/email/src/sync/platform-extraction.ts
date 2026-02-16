/**
 * Platform Email Extraction
 *
 * Extracts the real sender/company from platform-originated emails.
 */
import { db } from "@lib/db/hub";
import {
  extractRealSender,
  isPlatformEmail,
  PLATFORM_DOMAINS,
  type PlatformExtraction,
  shouldExclude,
  shouldExcludePlatformEmail,
} from "./platform-extraction-core";

async function ensureColumns(): Promise<void> {
  const columns = [
    { name: "is_platform_email", type: "INTEGER DEFAULT 0" },
    { name: "platform_name", type: "TEXT" },
    { name: "real_sender_name", type: "TEXT" },
    { name: "real_sender_company", type: "TEXT" },
    { name: "real_sender_email", type: "TEXT" },
    { name: "real_sender_domain", type: "TEXT" },
    { name: "is_excluded", type: "INTEGER DEFAULT 0" },
  ] as const;

  for (const col of columns) {
    try {
      await db.run(`ALTER TABLE emails ADD COLUMN ${col.name} ${col.type}`);
      console.log(`Added column: ${col.name}`);
    } catch {
      // Column likely already exists.
    }
  }
}

interface EmailRow {
  id: number;
  from_email: string | null;
  from_domain: string | null;
  subject: string | null;
  body_full: string | null;
  body_preview: string | null;
}

interface PlatformUpdateStmt {
  run: (...params: unknown[]) => Promise<unknown>;
}

type PlatformProcessOutcome =
  | "excluded"
  | "not_platform"
  | "platform_extracted"
  | "platform_unresolved";

async function markPlatformExcludedEmail(
  updateStmt: PlatformUpdateStmt,
  emailId: number
): Promise<void> {
  await updateStmt.run(0, null, null, null, null, null, 1, emailId);
}

async function markNonPlatformEmail(
  updateStmt: PlatformUpdateStmt,
  emailId: number
): Promise<void> {
  await updateStmt.run(0, null, null, null, null, null, 0, emailId);
}

async function saveExtractedPlatformEmail(
  updateStmt: PlatformUpdateStmt,
  emailId: number,
  extraction: PlatformExtraction
): Promise<void> {
  await updateStmt.run(
    1,
    extraction.platformName,
    extraction.realSenderName,
    extraction.realSenderCompany,
    extraction.realSenderEmail,
    extraction.realSenderDomain,
    0,
    emailId
  );
}

async function saveUnresolvedPlatformEmail(
  updateStmt: PlatformUpdateStmt,
  emailId: number,
  platformName: string | null
): Promise<void> {
  await updateStmt.run(1, platformName, null, null, null, null, 0, emailId);
}

async function processPlatformEmail(
  updateStmt: PlatformUpdateStmt,
  email: EmailRow
): Promise<PlatformProcessOutcome> {
  const domain = email.from_domain?.toLowerCase() ?? null;

  if (shouldExclude(domain, email.subject)) {
    await markPlatformExcludedEmail(updateStmt, email.id);
    return "excluded";
  }

  if (!isPlatformEmail(domain)) {
    await markNonPlatformEmail(updateStmt, email.id);
    return "not_platform";
  }

  if (shouldExcludePlatformEmail(domain, email.subject)) {
    await markPlatformExcludedEmail(updateStmt, email.id);
    return "excluded";
  }

  const body = email.body_full || email.body_preview;
  const extraction = extractRealSender(
    domain,
    email.from_email,
    body,
    email.subject
  );
  if (!extraction) {
    const platformName = domain
      ? (PLATFORM_DOMAINS[domain]?.name ?? null)
      : null;
    await saveUnresolvedPlatformEmail(updateStmt, email.id, platformName);
    return "platform_unresolved";
  }

  await saveExtractedPlatformEmail(updateStmt, email.id, extraction);
  return "platform_extracted";
}

export async function processPlatformEmails(): Promise<void> {
  console.log("Processing platform emails...\n");

  await ensureColumns();

  const platformDomains = Object.keys(PLATFORM_DOMAINS);
  const platformDomainsStr = platformDomains.map((d) => `'${d}'`).join(",");

  const emails = await db
    .query<EmailRow>(
      `SELECT id, from_email, from_domain, subject, body_full, body_preview FROM emails
       WHERE real_sender_email IS NULL
         AND (from_domain IN (${platformDomainsStr}) OR is_excluded IS NULL)`
    )
    .all();

  console.log(`Processing ${emails.length} emails...\n`);

  const updateStmt = db.prepare(
    `UPDATE emails SET
      is_platform_email = ?,
      platform_name = ?,
      real_sender_name = ?,
      real_sender_company = ?,
      real_sender_email = ?,
      real_sender_domain = ?,
      is_excluded = ?
    WHERE id = ?`
  );

  let excluded = 0;
  let platformTotal = 0;
  let platformExtracted = 0;

  await db.transaction(async () => {
    for (const email of emails) {
      const outcome = await processPlatformEmail(updateStmt, email);
      if (outcome === "excluded") {
        excluded++;
      }
      if (
        outcome === "platform_extracted" ||
        outcome === "platform_unresolved"
      ) {
        platformTotal++;
      }
      if (outcome === "platform_extracted") {
        platformExtracted++;
      }
    }
  });

  console.log("\n=== Results ===");
  console.log(`Total processed: ${emails.length}`);
  console.log(`Excluded: ${excluded}`);
  console.log(`Platform emails: ${platformTotal}`);
  console.log(`Platform with sender extracted: ${platformExtracted}`);

  const extractionRate =
    platformTotal === 0
      ? "0.0"
      : ((platformExtracted / platformTotal) * 100).toFixed(1);
  console.log(`Extraction rate: ${extractionRate}%`);

  console.log("\n=== Platform Breakdown ===");
  const platformStats = await db
    .query<{ platform: string | null; total: number; extracted: number }>(
      `SELECT
         platform_name as platform,
         COUNT(*) as total,
         SUM(CASE WHEN real_sender_company IS NOT NULL THEN 1 ELSE 0 END) as extracted
       FROM emails
       WHERE is_platform_email = 1
       GROUP BY platform_name`
    )
    .all();

  for (const p of platformStats) {
    const extracted = Number(p.extracted) || 0;
    const total = Number(p.total) || 0;
    const pct = total === 0 ? "0.0" : ((extracted / total) * 100).toFixed(1);
    console.log(
      `  ${p.platform ?? "unknown"}: ${extracted}/${total} extracted (${pct}%)`
    );
  }
}

if (import.meta.main) {
  processPlatformEmails().catch((error) => {
    console.error("processPlatformEmails failed:", error);
    process.exit(1);
  });
}
