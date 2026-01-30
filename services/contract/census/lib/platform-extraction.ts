/**
 * Platform Email Extraction
 *
 * Many emails come from bid platforms (BuildingConnected, Procore, BlueBook)
 * where the from_email is the platform, but the REAL sender is embedded in
 * the email body or subject. This module extracts the actual company/sender.
 *
 * Also handles exclusions for domains we want to skip entirely.
 */
import { db } from "../db/connection";

// ============================================================================
// Domain Configuration
// ============================================================================

/**
 * Domains to completely exclude from processing.
 * These are internal system emails that provide no value.
 */
export const EXCLUDED_DOMAINS = new Set([
  "avanan-mail.net", // Spam quarantine reports
]);

/**
 * Subject patterns to exclude (calendar invites, digests, etc.)
 */
export const EXCLUDED_SUBJECT_PATTERNS = [
  /^accepted:/i,
  /^declined:/i,
  /^tentative:/i,
  /^canceled:/i,
  /^invitation:/i,
  /meeting request/i,
  /^bidscope summary/i, // BlueBook daily digests
];

/**
 * Platform domains where the actual sender is embedded in the body.
 * Key: domain (or domain pattern)
 * Value: extraction config
 */
export const PLATFORM_DOMAINS: Record<
  string,
  {
    name: string;
    patterns: RegExp[];
    fromEmailPattern?: RegExp;
    /** If true, patterns capture (company, name) instead of (name, company) */
    companyFirst?: boolean;
    /** Patterns to extract company from subject line */
    subjectPatterns?: RegExp[];
    /** Subject patterns to exclude (system notifications) */
    excludeSubjects?: RegExp[];
  }
> = {
  "buildingconnected.com": {
    name: "BuildingConnected",
    patterns: [
      // "[Name] of [Company] sent your company" - flexible name to handle accents, III, etc.
      /^(.+?)\s+of\s+(.+?)\s+sent your company/m,
      // "[Name] from [Company] has invited you to bid"
      /(.+?)\s+from\s+(.+?)\s+has invited you to bid/,
      // "[Name] from [Company] sent your company"
      /(.+?)\s+from\s+(.+?)\s+sent your company/,
      // "[Company] has closed" - company before "has closed" (in body, first line)
      /^([A-Za-z][A-Za-z0-9\s,.'-]+)\s+has closed$/m,
      // "Let [Name] at [Company] know"
      /Let\s+(.+?)\s+at\s+(.+?)\s+know/,
    ],
    // Extract from subject: "New message from [Company]" or "[Company] has closed [Project]"
    subjectPatterns: [/^New message from (.+)$/i, /^(.+?)\s+has closed\s+/i],
    // Subjects to exclude (system notifications, your own delivery/view confirmations)
    excludeSubjects: [
      /^We already have that opportunity$/i,
      /^Action requested/i,
      /confirm.*profile/i,
      /^Get \$\d+/i, // Referral marketing
      /^Welcome to/i,
      /^Bid delivered:/i, // Your own bid delivery
      /^Bid revision delivered:/i, // Your own revision delivery
      /^Budget delivered:/i, // Your own budget delivery
      /^Bid viewed:/i, // Someone viewed your bid
      /^Budget viewed:/i, // Someone viewed your budget
    ],
  },
  "procoretech.com": {
    name: "Procore",
    patterns: [
      // "Hi [Name], [Company] has invited you"
      /Hi\s+[^,]+,\s*([^.]+?)\s*\.\s*has invited you/,
      // "[Company] has invited you to collaborate"
      /([^.]+?)\s*\.\s*has invited you to collaborate/,
    ],
    // Also extract from email like "EOS_Builders_LLC@us02.procoretech.com"
    fromEmailPattern: /^([^@]+)@.*procoretech\.com$/i,
  },
  "us02.procoretech.com": {
    name: "Procore",
    patterns: [
      /Hi\s+[^,]+,\s*([^.]+?)\s*\.\s*has invited you/,
      /([^.]+?)\s*\.\s*has invited you to collaborate/,
    ],
    fromEmailPattern: /^([^@]+)@.*procoretech\.com$/i,
  },
  "bbbid.thebluebook.com": {
    name: "BlueBook",
    patterns: [
      // "[Company] has invited you to bid"
      /(.+?)\s+has invited you to bid/,
      // In digest: "[Project] [Company] - [Name]" before date
      /\)\s+([A-Z][^-]+(?:LLC|Inc|Corp)?)\s*-\s*([A-Za-z\s]+)\s*\d{2}\/\d{2}/,
      // "From: [Company]"
      /From:\s*(.+?)$/m,
    ],
    // Exclude marketing/analytics/digest emails
    excludeSubjects: [
      /^Get clear on your company's ROI$/i, // Analytics dashboard promo
      /^BidScope Summary/i, // Daily digest - no single sender
    ],
  },
  "bidmail.com": {
    name: "BidMail",
    patterns: [
      // Pattern 1: Company with suffix (Inc./LLC/Corp) followed by person name
      // "FromColorado Structures, Inc.Irvine Estimator (email)"
      /From([A-Za-z\s,.']+(?:Inc\.|LLC|Corp|Co\.))([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*\([^)]+@[^)]+\)/,
      // Pattern 2: ALL CAPS company name followed by Mixed Case person
      // "FromKDC CONSTRUCTIONJosh Nelson (email)"
      /From([A-Z][A-Z\s]+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*\([^)]+@[^)]+\)/,
      // Pattern 3: Company with suffix followed by ALL CAPS person
      // "FromEleven Western Builders, Inc.TAMI SHEARER (email)"
      /From([A-Za-z\s,.']+(?:Inc\.|LLC|Corp|Co\.))([A-Z][A-Z\s]+)\s*\([^)]+@[^)]+\)/,
      // Pattern 4: Company with suffix followed by department name
      // "FromOn-Site Builders, Inc.Estimating Department (email)"
      /From([A-Za-z\s,.'-]+(?:Inc\.|LLC|Corp|Co\.))[A-Za-z\s]+\s*\([^)]+@[^)]+\)/,
    ],
    companyFirst: true,
    // Extract company from subject: "[Company]: ..." (any content after colon)
    subjectPatterns: [/^([^:]+):\s*.+/],
  },
  "pype.io": {
    name: "Pype",
    patterns: [
      // "[Company] has chosen to use Pype Closeout for [Project]"
      /([A-Za-z\s,.]+(?:Inc\.|LLC|Corp)?)\s+has chosen to use Pype Closeout/,
      // Check for project info: "the project, [Project Name]"
      /the project,\s*([^.]+)\./,
    ],
  },
  "docusign.net": {
    name: "DocuSign",
    patterns: [
      // DocuSign bodies have the sender name and email on separate lines
      // We extract the email from body via extractEmailsFromBody
    ],
    // from_name has pattern "Name via Docusign"
    fromEmailPattern: /^(.+?)\s+via\s+Docusign$/i,
  },
  "docusign.com": {
    name: "DocuSign",
    patterns: [],
    fromEmailPattern: /^(.+?)\s+via\s+Docusign$/i,
  },
  "planhub.com": {
    name: "PlanHub",
    patterns: [],
    // Subject patterns:
    // 1. "[Company] has invited you to bid a project in your area"
    // 2. "[Project] [Location] ([Company])" - company in parentheses at end
    subjectPatterns: [/^(.+?)\s+has invited you to bid/i, /\(([^)]+)\)\s*$/],
    // Exclude PlanHub's own marketing and bid reminders
    excludeSubjects: [
      /^PlanHub\s*-?\s*Subcontractor/i,
      /- Only \d+ day\(s\) left to submit bid$/i,
    ],
  },
  "message.planhub.com": {
    name: "PlanHub",
    patterns: [],
    subjectPatterns: [/^(.+?)\s+has invited you to bid/i, /\(([^)]+)\)\s*$/],
    excludeSubjects: [
      /^PlanHub\s*-?\s*Subcontractor/i,
      /- Only \d+ day\(s\) left to submit bid$/i,
    ],
  },
  "com2.smartbidnet.com": {
    name: "SmartBidNet",
    patterns: [
      // Body has email like "dacemcclure@esiconstruction.com" - extract domain for linking
      // The extractEmailsFromBody function will handle this
    ],
    // from_name is the actual sender (person name)
  },
  "smartbidnet.com": {
    name: "SmartBidNet",
    patterns: [],
  },
};

// ============================================================================
// Extraction Functions
// ============================================================================

export interface PlatformExtraction {
  platformName: string;
  realSenderName: string | null;
  realSenderCompany: string | null;
  realSenderEmail: string | null;
  realSenderDomain: string | null;
}

/**
 * Check if an email should be excluded from processing.
 */
export function shouldExclude(
  domain: string | null,
  subject: string | null
): boolean {
  // Check domain exclusions
  if (domain && EXCLUDED_DOMAINS.has(domain.toLowerCase())) {
    return true;
  }

  // Check subject exclusions (calendar invites, digests)
  if (subject) {
    for (const pattern of EXCLUDED_SUBJECT_PATTERNS) {
      if (pattern.test(subject)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if an email is from a platform domain.
 */
export function isPlatformEmail(domain: string | null): boolean {
  if (!domain) {
    return false;
  }
  return domain.toLowerCase() in PLATFORM_DOMAINS;
}

/**
 * Check if a platform email should be excluded based on subject.
 */
export function shouldExcludePlatformEmail(
  domain: string | null,
  subject: string | null
): boolean {
  if (!(domain && subject)) {
    return false;
  }

  const config = PLATFORM_DOMAINS[domain.toLowerCase()];
  if (!config?.excludeSubjects) {
    return false;
  }

  for (const pattern of config.excludeSubjects) {
    if (pattern.test(subject)) {
      return true;
    }
  }
  return false;
}

// Regex to find email addresses in body text
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Platform domains to filter out when looking for real sender emails
const PLATFORM_EMAIL_DOMAINS = new Set([
  "buildingconnected.com",
  "procore.com",
  "procoretech.com",
  "us02.procoretech.com",
  "bbbid.thebluebook.com",
  "thebluebook.com",
  "bidmail.com",
  "pype.io",
  "planhub.com",
  "message.planhub.com",
  "smartbidnet.com",
  "com2.smartbidnet.com",
  "desertservices.net",
  "desertservices.app",
]);

/**
 * Extract email addresses from body, filtering out platform/internal emails.
 */
function extractEmailsFromBody(body: string): string[] {
  const found = body.match(EMAIL_REGEX) || [];
  return [...new Set(found)].filter((email) => {
    const emailDomain = email.split("@")[1]?.toLowerCase();
    return emailDomain && !PLATFORM_EMAIL_DOMAINS.has(emailDomain);
  });
}

/**
 * Extract real sender info from a platform email.
 */
export function extractRealSender(
  domain: string | null,
  fromEmail: string | null,
  body: string | null,
  subject: string | null
): PlatformExtraction | null {
  if (!domain) {
    return null;
  }

  const config = PLATFORM_DOMAINS[domain.toLowerCase()];
  if (!config) {
    return null;
  }

  const result: PlatformExtraction = {
    platformName: config.name,
    realSenderName: null,
    realSenderCompany: null,
    realSenderEmail: null,
    realSenderDomain: null,
  };

  // Try extracting from email address first (for Procore-style domains)
  if (config.fromEmailPattern && fromEmail) {
    const emailMatch = fromEmail.match(config.fromEmailPattern);
    if (emailMatch?.[1]) {
      // Convert underscores to spaces, e.g., "EOS_Builders_LLC" -> "EOS Builders LLC"
      result.realSenderCompany = emailMatch[1].replace(/_/g, " ");
    }
  }

  // Try extracting from subject (e.g., "New message from [Company]")
  if (config.subjectPatterns && subject && !result.realSenderCompany) {
    for (const pattern of config.subjectPatterns) {
      const match = subject.match(pattern);
      if (match?.[1]) {
        result.realSenderCompany = match[1].trim();
        break;
      }
    }
  }

  // Try extracting from body
  if (body && !result.realSenderCompany) {
    for (const pattern of config.patterns) {
      const match = body.match(pattern);
      if (match) {
        if (match.length === 3) {
          // Pattern captured both name and company
          if (config.companyFirst) {
            // BidMail and similar: body has company then name
            result.realSenderCompany = match[1].trim();
            result.realSenderName = match[2].trim();
          } else {
            // Standard: body has name then company
            result.realSenderName = match[1].trim();
            result.realSenderCompany = match[2].trim();
          }
        } else if (match.length === 2) {
          // Pattern captured only company
          result.realSenderCompany = match[1].trim();
        }
        break;
      }
    }
  }

  // Extract real email address from body (the important part!)
  if (body) {
    const emails = extractEmailsFromBody(body);
    if (emails.length > 0) {
      // Take the first external email found
      result.realSenderEmail = emails[0];
      result.realSenderDomain = emails[0].split("@")[1]?.toLowerCase() ?? null;
    }
  }

  // Only return if we got something useful (email/domain is most valuable)
  if (
    result.realSenderEmail ||
    result.realSenderName ||
    result.realSenderCompany
  ) {
    return result;
  }

  return null;
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Add columns for platform extraction if they don't exist.
 */
function ensureColumns(): void {
  const columns = [
    { name: "is_platform_email", type: "INTEGER DEFAULT 0" },
    { name: "platform_name", type: "TEXT" },
    { name: "real_sender_name", type: "TEXT" },
    { name: "real_sender_company", type: "TEXT" },
    { name: "real_sender_email", type: "TEXT" },
    { name: "real_sender_domain", type: "TEXT" },
    { name: "is_excluded", type: "INTEGER DEFAULT 0" },
  ];

  for (const col of columns) {
    try {
      db.run(`ALTER TABLE emails ADD COLUMN ${col.name} ${col.type}`);
      console.log(`Added column: ${col.name}`);
    } catch {
      // Column already exists
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

/**
 * Process all emails for platform extraction and exclusions.
 */
export function processPlatformEmails(): void {
  console.log("Processing platform emails...\n");

  ensureColumns();

  // Get all emails
  const emails = db
    .query<EmailRow, []>(
      "SELECT id, from_email, from_domain, subject, body_full, body_preview FROM emails"
    )
    .all();

  console.log(`Processing ${emails.length} emails...\n`);

  const updateStmt = db.prepare(`
    UPDATE emails SET
      is_platform_email = ?,
      platform_name = ?,
      real_sender_name = ?,
      real_sender_company = ?,
      real_sender_email = ?,
      real_sender_domain = ?,
      is_excluded = ?
    WHERE id = ?
  `);

  let excluded = 0;
  let platformTotal = 0;
  let platformExtracted = 0;

  db.run("BEGIN TRANSACTION");

  for (const email of emails) {
    const domain = email.from_domain?.toLowerCase() ?? null;

    // Check exclusion (domain + subject patterns)
    const isExcluded = shouldExclude(domain, email.subject);
    if (isExcluded) {
      excluded++;
      updateStmt.run(0, null, null, null, null, null, 1, email.id);
      continue;
    }

    // Check platform
    const isPlatform = isPlatformEmail(domain);
    if (isPlatform) {
      // Check platform-specific subject exclusions
      if (shouldExcludePlatformEmail(domain, email.subject)) {
        excluded++;
        updateStmt.run(0, null, null, null, null, null, 1, email.id);
        continue;
      }

      platformTotal++;
      const body = email.body_full || email.body_preview;
      const extraction = extractRealSender(
        domain,
        email.from_email,
        body,
        email.subject
      );

      if (extraction) {
        platformExtracted++;
        updateStmt.run(
          1,
          extraction.platformName,
          extraction.realSenderName,
          extraction.realSenderCompany,
          extraction.realSenderEmail,
          extraction.realSenderDomain,
          0,
          email.id
        );
      } else {
        const platformName = domain
          ? (PLATFORM_DOMAINS[domain]?.name ?? null)
          : null;
        updateStmt.run(1, platformName, null, null, null, null, 0, email.id);
      }
    } else {
      updateStmt.run(0, null, null, null, null, null, 0, email.id);
    }
  }

  db.run("COMMIT");

  console.log("\n=== Results ===");
  console.log(`Total processed: ${emails.length}`);
  console.log(`Excluded (avanan-mail.net, etc.): ${excluded}`);
  console.log(`Platform emails: ${platformTotal}`);
  console.log(`Platform with real sender extracted: ${platformExtracted}`);
  console.log(
    `Extraction rate: ${((platformExtracted / platformTotal) * 100).toFixed(1)}%`
  );

  // Show breakdown by platform
  console.log("\n=== Platform Breakdown ===");
  const platformStats = db
    .query<{ platform: string; total: number; extracted: number }, []>(
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
    const pct = ((p.extracted / p.total) * 100).toFixed(1);
    console.log(
      `  ${p.platform}: ${p.extracted}/${p.total} extracted (${pct}%)`
    );
  }

  // Sample extractions
  console.log("\n=== Sample Extractions ===");
  const samples = db
    .query<{ platform: string; company: string; name: string | null }, []>(
      `SELECT platform_name as platform, real_sender_company as company, real_sender_name as name
       FROM emails
       WHERE real_sender_company IS NOT NULL
       LIMIT 10`
    )
    .all();

  for (const s of samples) {
    const nameStr = s.name ? ` (${s.name})` : "";
    console.log(`  [${s.platform}] ${s.company}${nameStr}`);
  }
}

// CLI entry point
if (import.meta.main) {
  processPlatformEmails();
}
