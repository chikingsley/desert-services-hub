/**
 * Platform Email Extraction
 *
 * Extracts the real sender/company from platform-originated emails.
 */
import { db } from "@lib/db/hub";

export const EXCLUDED_DOMAINS = new Set(["avanan-mail.net"]);

export const EXCLUDED_SUBJECT_PATTERNS = [
  /^accepted:/i,
  /^declined:/i,
  /^tentative:/i,
  /^canceled:/i,
  /^invitation:/i,
  /meeting request/i,
  /^bidscope summary/i,
];

type PlatformDomainConfig = {
  name: string;
  patterns: RegExp[];
  fromEmailPattern?: RegExp;
  companyFirst?: boolean;
  subjectPatterns?: RegExp[];
  excludeSubjects?: RegExp[];
};

export const PLATFORM_DOMAINS: Record<string, PlatformDomainConfig> = {
  "buildingconnected.com": {
    name: "BuildingConnected",
    patterns: [
      /^(.+?)\s+of\s+(.+?)\s+sent your company/m,
      /(.+?)\s+from\s+(.+?)\s+has invited you to bid/,
      /(.+?)\s+from\s+(.+?)\s+sent your company/,
      /^([A-Za-z][A-Za-z0-9\s,.'-]+)\s+has closed$/m,
      /Let\s+(.+?)\s+at\s+(.+?)\s+know/,
    ],
    subjectPatterns: [/^New message from (.+)$/i, /^(.+?)\s+has closed\s+/i],
    excludeSubjects: [
      /^We already have that opportunity$/i,
      /^Action requested/i,
      /confirm.*profile/i,
      /^Get \$\d+/i,
      /^Welcome to/i,
      /^Bid delivered:/i,
      /^Bid revision delivered:/i,
      /^Budget delivered:/i,
      /^Bid viewed:/i,
      /^Budget viewed:/i,
    ],
  },
  "procoretech.com": {
    name: "Procore",
    patterns: [
      /Hi\s+[^,]+,\s*([^.]+?)\s*\.\s*has invited you/,
      /([^.]+?)\s*\.\s*has invited you to collaborate/,
    ],
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
      /(.+?)\s+has invited you to bid/,
      /\)\s+([A-Z][^-]+(?:LLC|Inc|Corp)?)\s*-\s*([A-Za-z\s]+)\s*\d{2}\/\d{2}/,
      /From:\s*(.+?)$/m,
    ],
    excludeSubjects: [/^Get clear on your company's ROI$/i, /^BidScope Summary/i],
  },
  "bidmail.com": {
    name: "BidMail",
    patterns: [
      /From([A-Za-z\s,.']+(?:Inc\.|LLC|Corp|Co\.))([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*\([^)]+@[^)]+\)/,
      /From([A-Z][A-Z\s]+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*\([^)]+@[^)]+\)/,
      /From([A-Za-z\s,.']+(?:Inc\.|LLC|Corp|Co\.))([A-Z][A-Z\s]+)\s*\([^)]+@[^)]+\)/,
      /From([A-Za-z\s,.'-]+(?:Inc\.|LLC|Corp|Co\.))[A-Za-z\s]+\s*\([^)]+@[^)]+\)/,
    ],
    companyFirst: true,
    subjectPatterns: [/^([^:]+):\s*.+/],
  },
  "pype.io": {
    name: "Pype",
    patterns: [
      /([A-Za-z\s,.]+(?:Inc\.|LLC|Corp)?)\s+has chosen to use Pype Closeout/,
      /the project,\s*([^.]+)\./,
    ],
  },
  "docusign.net": {
    name: "DocuSign",
    patterns: [],
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
    subjectPatterns: [/^(.+?)\s+has invited you to bid/i, /\(([^)]+)\)\s*$/],
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
    patterns: [],
  },
  "smartbidnet.com": {
    name: "SmartBidNet",
    patterns: [],
  },
};

export interface PlatformExtraction {
  platformName: string;
  realSenderName: string | null;
  realSenderCompany: string | null;
  realSenderEmail: string | null;
  realSenderDomain: string | null;
}

export function shouldExclude(
  domain: string | null,
  subject: string | null
): boolean {
  if (domain && EXCLUDED_DOMAINS.has(domain.toLowerCase())) {
    return true;
  }

  if (subject) {
    for (const pattern of EXCLUDED_SUBJECT_PATTERNS) {
      if (pattern.test(subject)) {
        return true;
      }
    }
  }

  return false;
}

export function isPlatformEmail(domain: string | null): boolean {
  if (!domain) {
    return false;
  }
  return domain.toLowerCase() in PLATFORM_DOMAINS;
}

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

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

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

function extractEmailsFromBody(body: string): string[] {
  const found = body.match(EMAIL_REGEX) || [];
  return [...new Set(found)].filter((email) => {
    const emailDomain = email.split("@")[1]?.toLowerCase();
    return Boolean(emailDomain && !PLATFORM_EMAIL_DOMAINS.has(emailDomain));
  });
}

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

  if (config.fromEmailPattern && fromEmail) {
    const emailMatch = fromEmail.match(config.fromEmailPattern);
    if (emailMatch?.[1]) {
      result.realSenderCompany = emailMatch[1].replace(/_/g, " ");
    }
  }

  if (config.subjectPatterns && subject && !result.realSenderCompany) {
    for (const pattern of config.subjectPatterns) {
      const match = subject.match(pattern);
      if (match?.[1]) {
        result.realSenderCompany = match[1].trim();
        break;
      }
    }
  }

  if (body && !result.realSenderCompany) {
    for (const pattern of config.patterns) {
      const match = body.match(pattern);
      if (!match) {
        continue;
      }

      if (match.length === 3) {
        if (config.companyFirst) {
          result.realSenderCompany = match[1]?.trim() ?? null;
          result.realSenderName = match[2]?.trim() ?? null;
        } else {
          result.realSenderName = match[1]?.trim() ?? null;
          result.realSenderCompany = match[2]?.trim() ?? null;
        }
      } else if (match.length === 2) {
        result.realSenderCompany = match[1]?.trim() ?? null;
      }

      break;
    }
  }

  if (body) {
    const emails = extractEmailsFromBody(body);
    if (emails.length > 0) {
      result.realSenderEmail = emails[0] ?? null;
      result.realSenderDomain = emails[0]?.split("@")[1]?.toLowerCase() ?? null;
    }
  }

  if (
    result.realSenderEmail ||
    result.realSenderName ||
    result.realSenderCompany
  ) {
    return result;
  }

  return null;
}

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
      const domain = email.from_domain?.toLowerCase() ?? null;

      if (shouldExclude(domain, email.subject)) {
        excluded++;
        await updateStmt.run(0, null, null, null, null, null, 1, email.id);
        continue;
      }

      if (!isPlatformEmail(domain)) {
        await updateStmt.run(0, null, null, null, null, null, 0, email.id);
        continue;
      }

      if (shouldExcludePlatformEmail(domain, email.subject)) {
        excluded++;
        await updateStmt.run(0, null, null, null, null, null, 1, email.id);
        continue;
      }

      platformTotal++;

      const body = email.body_full || email.body_preview;
      const extraction = extractRealSender(domain, email.from_email, body, email.subject);

      if (extraction) {
        platformExtracted++;
        await updateStmt.run(
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
        const platformName = domain ? (PLATFORM_DOMAINS[domain]?.name ?? null) : null;
        await updateStmt.run(1, platformName, null, null, null, null, 0, email.id);
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
    console.log(`  ${p.platform ?? "unknown"}: ${extracted}/${total} extracted (${pct}%)`);
  }
}

if (import.meta.main) {
  processPlatformEmails().catch((error) => {
    console.error("processPlatformEmails failed:", error);
    process.exit(1);
  });
}
