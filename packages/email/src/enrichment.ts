import { createHash } from "node:crypto";
import type { PlatformExtraction } from "./platform-sender";

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

const PROTOCOL_PREFIX_RE = /^https?:\/\//;
const WWW_PREFIX_RE = /^www\./;
const DOMAIN_CHARS_RE = /^[a-z0-9.-]+$/;
const TLD_RE = /^[a-z]{2,24}$/;
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
    .replace(PROTOCOL_PREFIX_RE, "")
    .replace(WWW_PREFIX_RE, "")
    .split("/")[0]
    .trim();

  if (!isLikelyValidDomain(cleaned)) {
    return null;
  }

  const labels = cleaned.split(".");
  const tld = labels.at(-1) ?? "";
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
  if (!DOMAIN_CHARS_RE.test(domain)) {
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

  const tld = labels.at(-1) ?? "";
  return TLD_RE.test(tld);
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

// ── Account Find-or-Create ──────────────────────────────────────

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
