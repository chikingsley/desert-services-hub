import { createHash } from "node:crypto";
import { z } from "zod";

// ── Domain & Forward Detection ──────────────────────────────────

const INTERNAL_DOMAINS = new Set([
  "desertservices.net",
  "desertservices.app",
  "upwindcompanies.com",
]);
const COMMON_BASE_TLDS = new Set([
  "com",
  "net",
  "org",
  "io",
  "co",
  "us",
  "biz",
  "info",
  "app",
  "dev",
  "ai",
  "gov",
  "edu",
  "mil",
  "me",
  "tv",
  "cc",
]);

const FWD_PREFIX_RE = /^(fw|fwd|forwarded):/i;
const OUTLOOK_FORWARD_RE =
  /from:\s*(?:[^<\n]*<)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?\s*sent:/i;
const GMAIL_FORWARD_RE =
  /[-]+\s*(?:forwarded|original)\s+message\s*[-]+[\s\S]*?from:\s*(?:[^<\n]*<)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/i;
const GENERIC_FROM_RE =
  /from:\s*[^<\n]*<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/i;

export function extractDomain(email: string | null): string | null {
  if (!email) {
    return null;
  }
  const at = email.indexOf("@");
  if (at === -1) {
    return null;
  }

  const domain = email
    .slice(at + 1)
    .toLowerCase()
    .trim()
    .replace(/^<+|>+$/g, "")
    .replace(/["')\],;:]+$/g, "");

  return sanitizeDomain(domain);
}

function sanitizeDomain(domain: string): string | null {
  const cleaned = domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();

  if (!isLikelyValidDomain(cleaned)) {
    return null;
  }

  const labels = cleaned.split(".");
  const tld = labels[labels.length - 1] ?? "";
  const suspicious = findSuspiciousCompoundTld(tld);
  if (suspicious) {
    labels[labels.length - 1] = suspicious;
  }

  const normalized = labels.join(".");
  return isLikelyValidDomain(normalized) ? normalized : null;
}

function isLikelyValidDomain(domain: string): boolean {
  if (domain.length < 4 || domain.length > 253) {
    return false;
  }
  if (!domain.includes(".")) {
    return false;
  }
  if (!/^[a-z0-9.-]+$/.test(domain)) {
    return false;
  }
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) {
    return false;
  }

  const labels = domain.split(".");
  if (
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        label.startsWith("-") ||
        label.endsWith("-")
    )
  ) {
    return false;
  }

  const tld = labels[labels.length - 1] ?? "";
  return /^[a-z]{2,24}$/.test(tld);
}

function findSuspiciousCompoundTld(tld: string): string | null {
  for (const base of COMMON_BASE_TLDS) {
    if (tld === base) {
      return null;
    }
    if (tld.startsWith(base) && tld.length > base.length) {
      return base;
    }
  }
  return null;
}

function extractOriginalSender(body: string | null): string | null {
  if (!body) {
    return null;
  }
  const m =
    body.match(OUTLOOK_FORWARD_RE) ??
    body.match(GMAIL_FORWARD_RE) ??
    body.match(GENERIC_FROM_RE);
  return m?.[1]?.toLowerCase() ?? null;
}

export interface DomainEnrichment {
  fromDomain: string | null;
  isForwarded: boolean;
  isInternal: boolean;
  originalSenderDomain: string | null;
  originalSenderEmail: string | null;
}

export function computeDomainEnrichment(
  fromEmail: string | null,
  subject: string | null,
  bodyFull: string | null,
  bodyPreview: string | null
): DomainEnrichment {
  const fromDomain = extractDomain(fromEmail);
  const isInternal = fromDomain ? INTERNAL_DOMAINS.has(fromDomain) : false;
  const isForwarded = subject ? FWD_PREFIX_RE.test(subject.trim()) : false;

  let originalSenderEmail: string | null = null;
  let originalSenderDomain: string | null = null;
  if (isForwarded) {
    originalSenderEmail =
      extractOriginalSender(bodyFull) ?? extractOriginalSender(bodyPreview);
    originalSenderDomain = originalSenderEmail
      ? extractDomain(originalSenderEmail)
      : null;
  }

  return {
    fromDomain,
    isForwarded,
    isInternal,
    originalSenderDomain,
    originalSenderEmail,
  };
}

// ── Platform Email Extraction ───────────────────────────────────

interface PlatformDomainConfig {
  companyFirst?: boolean;
  excludeSubjects?: RegExp[];
  fromEmailPattern?: RegExp;
  name: string;
  patterns: RegExp[];
  subjectPatterns?: RegExp[];
}

const PLATFORM_DOMAINS: Record<string, PlatformDomainConfig> = {
  "bbbid.thebluebook.com": {
    name: "BlueBook",
    patterns: [
      /(.+?)\s+has invited you to bid/,
      /\)\s+([A-Z][^-]+(?:LLC|Inc|Corp)?)\s*-\s*([A-Za-z\s]+)\s*\d{2}\/\d{2}/,
      /From:\s*(.+?)$/m,
    ],
    excludeSubjects: [
      /^Get clear on your company's ROI$/i,
      /^BidScope Summary/i,
    ],
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
  "com2.smartbidnet.com": { name: "SmartBidNet", patterns: [] },
  "docusign.com": {
    name: "DocuSign",
    patterns: [],
    fromEmailPattern: /^(.+?)\s+via\s+Docusign$/i,
  },
  "docusign.net": {
    name: "DocuSign",
    patterns: [],
    fromEmailPattern: /^(.+?)\s+via\s+Docusign$/i,
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
  "planhub.com": {
    name: "PlanHub",
    patterns: [],
    subjectPatterns: [/^(.+?)\s+has invited you to bid/i, /\(([^)]+)\)\s*$/],
    excludeSubjects: [
      /^PlanHub\s*-?\s*Subcontractor/i,
      /- Only \d+ day\(s\) left to submit bid$/i,
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
  "pype.io": {
    name: "Pype",
    patterns: [
      /([A-Za-z\s,.]+(?:Inc\.|LLC|Corp)?)\s+has chosen to use Pype Closeout/,
      /the project,\s*([^.]+)\./,
    ],
  },
  "smartbidnet.com": { name: "SmartBidNet", patterns: [] },
  "us02.procoretech.com": {
    name: "Procore",
    patterns: [
      /Hi\s+[^,]+,\s*([^.]+?)\s*\.\s*has invited you/,
      /([^.]+?)\s*\.\s*has invited you to collaborate/,
    ],
    fromEmailPattern: /^([^@]+)@.*procoretech\.com$/i,
  },
};

export interface PlatformExtraction {
  platformName: string;
  realSenderCompany: string | null;
  realSenderDomain: string | null;
  realSenderEmail: string | null;
  realSenderName: string | null;
}

const BODY_EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
export const PLATFORM_SENDER_LLM_PROVIDER =
  process.env.PLATFORM_SENDER_LLM_PROVIDER?.trim() || "openrouter";
export const PLATFORM_SENDER_PROMPT_VERSION = "platform_sender_v1";

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

const PLATFORM_SENDER_LLM_DOMAINS = new Set([
  "bbbid.thebluebook.com",
  "bidmail.com",
  "buildingconnected.com",
  "com2.smartbidnet.com",
  "docusign.com",
  "docusign.net",
  "message.planhub.com",
  "planhub.com",
  "procore.com",
  "procoretech.com",
  "pype.io",
  "smartbidnet.com",
  "thebluebook.com",
  "us02.procoretech.com",
]);

const platformSenderLlmSchema = z.object({
  companyDomain: z.string().trim().min(1).nullable().optional(),
  companyName: z.string().trim().min(1).nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  personEmail: z.string().trim().min(1).nullable().optional(),
  personName: z.string().trim().min(1).nullable().optional(),
  reason: z.string().trim().min(1).nullable().optional(),
});

function extractEmailsFromBody(body: string): string[] {
  const found = body.match(BODY_EMAIL_RE) ?? [];
  return [...new Set(found)].filter((email) => {
    const d = email.split("@")[1]?.toLowerCase();
    return Boolean(d && !PLATFORM_EMAIL_DOMAINS.has(d));
  });
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeStrictEmail(value: string | null | undefined): string | null {
  const email = normalizeOptionalString(value)?.toLowerCase() ?? null;
  if (!email) {
    return null;
  }

  const at = email.lastIndexOf("@");
  if (at <= 0) {
    return null;
  }

  const rawDomain = email
    .slice(at + 1)
    .trim()
    .replace(/^<+|>+$/g, "")
    .replace(/["')\],;:]+$/g, "");
  const normalizedDomain = extractDomain(email);
  if (!normalizedDomain || rawDomain !== normalizedDomain) {
    return null;
  }

  return email;
}

function normalizeStrictDomain(value: string | null | undefined): string | null {
  const domain = normalizeOptionalString(value)?.toLowerCase() ?? null;
  if (!domain) {
    return null;
  }

  const normalizedDomain = sanitizeDomain(domain);
  if (!normalizedDomain || normalizedDomain !== domain) {
    return null;
  }

  return normalizedDomain;
}

function getPlatformName(domain: string): string {
  return PLATFORM_DOMAINS[domain]?.name ?? {
    "procore.com": "Procore",
    "thebluebook.com": "BlueBook",
  }[domain] ?? domain;
}

export function buildPlatformSenderPrompt(
  domain: string,
  fromName: string | null,
  body: string | null,
  subject: string | null
): string {
  return `Prompt version: "${PLATFORM_SENDER_PROMPT_VERSION}"

You extract the real external sender identity from platform relay emails for Desert Services, a construction services company.

The relay platform domain is "${domain}".

Return ONLY valid JSON:
{
  "personName": string | null,
  "personEmail": string | null,
  "companyName": string | null,
  "companyDomain": string | null,
  "confidence": number,
  "reason": string
}

Rules:
- Extract the real external sender, not the relay platform.
- If you cannot confidently determine a field, return null for that field.
- "personEmail" must be the exact external sender email when present.
- "companyDomain" must be the external company domain, never the relay platform domain.
- Do not invent data.

Context:
${JSON.stringify(
    {
      body: body?.slice(0, 12_000) ?? null,
      fromName,
      subject,
    },
    null,
    2
  )}`;
}

function normalizePlatformSenderResult(
  relayDomain: string,
  data: z.infer<typeof platformSenderLlmSchema>
): PlatformExtraction | null {
  const realSenderName = normalizeOptionalString(data.personName);
  const realSenderCompany = normalizeOptionalString(data.companyName);
  const personEmailCandidate = normalizeStrictEmail(data.personEmail);
  const companyDomainCandidate = normalizeStrictDomain(data.companyDomain);

  const realSenderEmail = personEmailCandidate;
  const emailDomain = realSenderEmail ? extractDomain(realSenderEmail) : null;
  const companyDomain = companyDomainCandidate;
  const realSenderDomain = emailDomain ?? companyDomain;

  if (realSenderDomain && PLATFORM_EMAIL_DOMAINS.has(realSenderDomain)) {
    return null;
  }

  if (!(realSenderEmail || realSenderDomain)) {
    return null;
  }

  if (!(realSenderName || realSenderCompany || realSenderEmail || realSenderDomain)) {
    return null;
  }

  return {
    platformName: getPlatformName(relayDomain),
    realSenderCompany,
    realSenderDomain,
    realSenderEmail,
    realSenderName,
  };
}

export async function extractRealSenderWithLlm(
  domain: string | null,
  fromName: string | null,
  body: string | null,
  subject: string | null
): Promise<PlatformExtraction | null> {
  const relayDomain = domain?.toLowerCase().trim() ?? "";
  if (!relayDomain || !PLATFORM_SENDER_LLM_DOMAINS.has(relayDomain)) {
    return null;
  }

  const prompt = buildPlatformSenderPrompt(relayDomain, fromName, body, subject);
  const { chat } = await import("@documents-intake/pdf-analysis");

  try {
    const response = await chat(prompt, PLATFORM_SENDER_LLM_PROVIDER);
    const parsed = platformSenderLlmSchema.safeParse(response.data);
    if (!parsed.success) {
      return null;
    }
    return normalizePlatformSenderResult(relayDomain, parsed.data);
  } catch {
    return null;
  }
}

function isExcludedSubject(
  config: PlatformDomainConfig,
  subject: string | null
): boolean {
  if (!(subject && config.excludeSubjects)) {
    return false;
  }
  return config.excludeSubjects.some((p) => p.test(subject));
}

function extractCompanyFromDisplayName(
  config: PlatformDomainConfig,
  fromName: string | null
): string | null {
  if (!(config.fromEmailPattern && fromName)) {
    return null;
  }
  // Only match display name (e.g. "Mike Johnson via Docusign"), never raw email
  const m = fromName.match(config.fromEmailPattern);
  return m?.[1]?.replaceAll(/_/g, " ") ?? null;
}

function extractCompanyFromSubject(
  config: PlatformDomainConfig,
  subject: string | null
): string | null {
  if (!(config.subjectPatterns && subject)) {
    return null;
  }
  for (const pattern of config.subjectPatterns) {
    const m = subject.match(pattern);
    if (m?.[1]) {
      return m[1].trim();
    }
  }
  return null;
}

function extractIdentityFromBody(
  config: PlatformDomainConfig,
  body: string | null
): { company: string | null; name: string | null } {
  if (!body) {
    return { company: null, name: null };
  }
  for (const pattern of config.patterns) {
    const m = body.match(pattern);
    if (!m) {
      continue;
    }
    if (m.length === 3) {
      return config.companyFirst
        ? { company: m[1]?.trim() ?? null, name: m[2]?.trim() ?? null }
        : { company: m[2]?.trim() ?? null, name: m[1]?.trim() ?? null };
    }
    if (m.length === 2) {
      return { company: m[1]?.trim() ?? null, name: null };
    }
  }
  return { company: null, name: null };
}

export function extractRealSender(
  domain: string | null,
  fromName: string | null,
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
  if (isExcludedSubject(config, subject)) {
    return null;
  }

  const result: PlatformExtraction = {
    platformName: config.name,
    realSenderName: null,
    realSenderCompany: null,
    realSenderEmail: null,
    realSenderDomain: null,
  };

  // Try display name → subject → body for company/name
  result.realSenderCompany =
    extractCompanyFromDisplayName(config, fromName) ??
    extractCompanyFromSubject(config, subject);

  if (!result.realSenderCompany) {
    const fromBody = extractIdentityFromBody(config, body);
    result.realSenderCompany = fromBody.company;
    result.realSenderName = fromBody.name;
  }

  // Extract real email from body
  if (body) {
    const bodyEmails = extractEmailsFromBody(body);
    if (bodyEmails[0]) {
      result.realSenderEmail = bodyEmails[0];
      result.realSenderDomain =
        result.realSenderEmail.split("@")[1]?.toLowerCase() ?? null;
    }
  }

  const hasSignal =
    result.realSenderEmail || result.realSenderName || result.realSenderCompany;
  return hasSignal ? result : null;
}

// ── Account Find-or-Create ──────────────────────────────────────

/** Domains that should never create accounts (internal, platform relays, free email) */
const IGNORED_ACCOUNT_DOMAINS = new Set([
  "desertservices.net",
  "desertservices.app",
  "upwindcompanies.com",
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
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "avanan-mail.net",
]);

export async function findOrCreateAccount(
  domain: string,
  companyName?: string | null
): Promise<number | null> {
  const lowerDomain = sanitizeDomain(domain.toLowerCase()) ?? null;
  if (!lowerDomain) {
    return null;
  }
  if (IGNORED_ACCOUNT_DOMAINS.has(lowerDomain)) {
    return null;
  }

  const { db } = await import("@lib/db/client");

  const existing = await db
    .query<{ id: number }, [string]>(
      "SELECT id FROM accounts WHERE domain = $1"
    )
    .get(lowerDomain);

  if (existing) {
    if (companyName) {
      await db.run(
        "UPDATE accounts SET name = $1 WHERE id = $2 AND (name IS NULL OR name = '')",
        [companyName, existing.id]
      );
    }
    return existing.id;
  }

  const name = companyName ?? lowerDomain;
  const inserted = await db
    .query<{ id: number }, [string, string]>(
      `INSERT INTO accounts (domain, name, type)
       VALUES ($1, $2, 'contractor')
       ON CONFLICT(domain) DO UPDATE SET
         name = COALESCE(NULLIF(accounts.name, ''), EXCLUDED.name),
         updated_at = now()
       RETURNING id`
    )
    .get(lowerDomain, name);

  return inserted?.id ?? null;
}

// ── Contact Find-or-Create ──────────────────────────────────────

const SKIP_NAME_RE =
  /^(noreply|no-?reply|notifications?|mailer-daemon|postmaster)$|via\s+(procore|buildingconnected|planhub|smartbid)/i;

export async function findOrCreateContact(
  email: string,
  name: string | null,
  accountId: number | null
): Promise<number | null> {
  const domain = extractDomain(email);
  if (domain && IGNORED_ACCOUNT_DOMAINS.has(domain)) {
    return null;
  }
  if (SKIP_NAME_RE.test(name ?? "")) {
    return null;
  }

  const { db } = await import("@lib/db/client");
  const normalized = email.toLowerCase().trim();

  // Local contacts are only useful if we can attach them to a contractor.
  // Returning arbitrary rows for a shared email with no account context
  // creates cross-account contamination.
  if (!accountId || accountId <= 0) {
    return null;
  }

  const existing = await db
    .query<{ account_id: number | null; id: number }, [string, number]>(
      `SELECT id, account_id
       FROM contacts
       WHERE LOWER(email) = $1
         AND (account_id = $2 OR account_id IS NULL)
       ORDER BY
         CASE WHEN account_id = $2 THEN 0 ELSE 1 END,
         CASE WHEN monday_item_id LIKE 'email:%' THEN 1 ELSE 0 END,
         id
       LIMIT 1`
    )
    .get(normalized, accountId);

  if (existing) {
    if (existing.account_id == null) {
      await db.run("UPDATE contacts SET account_id = $1 WHERE id = $2", [
        accountId,
        existing.id,
      ]);
    }
    return existing.id;
  }

  const hash = createHash("sha1").update(normalized).digest("hex").slice(0, 16);
  const mondayItemId = `email:${hash}`;
  const displayName = name && !SKIP_NAME_RE.test(name) ? name.trim() : "";

  const inserted = await db
    .query<{ id: number }, [string, string, string, number]>(
      `INSERT INTO contacts (monday_item_id, name, email, account_id, synced_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())
       ON CONFLICT (monday_item_id) DO UPDATE SET
         name = CASE
           WHEN NULLIF(EXCLUDED.name, '') IS NOT NULL
             AND (
               contacts.name = contacts.email
               OR contacts.name = ''
               OR LENGTH(EXCLUDED.name) > LENGTH(contacts.name)
             )
           THEN EXCLUDED.name ELSE contacts.name
         END,
         account_id = COALESCE(contacts.account_id, EXCLUDED.account_id),
         updated_at = now()
       RETURNING id`
    )
    .get(mondayItemId, displayName, normalized, accountId);

  return inserted?.id ?? null;
}

export async function linkContactToEmail(
  contactId: number,
  emailId: number,
  relationship: "from" | "to" | "cc"
): Promise<void> {
  const { db } = await import("@lib/db/client");
  await db.run(
    `INSERT INTO contact_emails (contact_id, email_id, relationship)
     VALUES ($1, $2, $3)
     ON CONFLICT (contact_id, email_id, relationship) DO NOTHING`,
    [contactId, emailId, relationship]
  );
}

// ── Enrichment UPDATE ───────────────────────────────────────────

export async function updateEmailEnrichment(
  emailId: number,
  domain: DomainEnrichment,
  platform: PlatformExtraction | null,
  accountId: number | null
): Promise<void> {
  const { db } = await import("@lib/db/client");

  await db.run(
    `UPDATE emails SET
       from_domain = $1,
       is_internal = $2,
       is_forwarded = $3,
       original_sender_email = $4,
       original_sender_domain = $5,
       is_platform_email = $6,
       platform_name = $7,
       real_sender_name = $8,
       real_sender_company = $9,
       real_sender_email = $10,
       real_sender_domain = $11,
       account_id = COALESCE($12, account_id)
     WHERE id = $13`,
    [
      domain.fromDomain,
      domain.isInternal ? 1 : 0,
      domain.isForwarded ? 1 : 0,
      domain.originalSenderEmail,
      domain.originalSenderDomain,
      platform ? 1 : 0,
      platform?.platformName ?? null,
      platform?.realSenderName ?? null,
      platform?.realSenderCompany ?? null,
      platform?.realSenderEmail ?? null,
      platform?.realSenderDomain ?? null,
      accountId,
      emailId,
    ]
  );
}
