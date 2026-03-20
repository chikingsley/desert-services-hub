import { z } from "zod";
import { extractDomain } from "./enrichment";

// ── Types ────────────────────────────────────────────────────────

interface PlatformDomainConfig {
  companyFirst?: boolean;
  excludeSubjects?: RegExp[];
  fromEmailPattern?: RegExp;
  name: string;
  patterns: RegExp[];
  subjectPatterns?: RegExp[];
}

export interface PlatformExtraction {
  platformName: string;
  realSenderCompany: string | null;
  realSenderDomain: string | null;
  realSenderEmail: string | null;
  realSenderName: string | null;
}

// ── Constants ────────────────────────────────────────────────────

export const PLATFORM_SENDER_LLM_PROVIDER =
  process.env.PLATFORM_SENDER_LLM_PROVIDER?.trim() || "local";
export const PLATFORM_SENDER_PROMPT_VERSION = "platform_sender_v1";

const BODY_EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;

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

// ── Helpers ──────────────────────────────────────────────────────

function extractEmailsFromBody(body: string): string[] {
  const found = body.match(BODY_EMAIL_RE) ?? [];
  return [...new Set(found)].filter((email) => {
    const d = email.split("@")[1]?.toLowerCase();
    return Boolean(d && !PLATFORM_EMAIL_DOMAINS.has(d));
  });
}

function normalizeOptionalString(
  value: string | null | undefined
): string | null {
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

function normalizeStrictDomain(
  value: string | null | undefined
): string | null {
  const domain = normalizeOptionalString(value)?.toLowerCase() ?? null;
  if (!domain) {
    return null;
  }

  // Quick validation: must have a dot, no protocol, no path
  if (!domain.includes(".") || domain.includes("/") || domain.includes("@")) {
    return null;
  }

  const normalizedDomain = extractDomain(`check@${domain}`);
  if (!normalizedDomain || normalizedDomain !== domain) {
    return null;
  }

  return normalizedDomain;
}

function getPlatformName(domain: string): string {
  return (
    PLATFORM_DOMAINS[domain]?.name ??
    {
      "procore.com": "Procore",
      "thebluebook.com": "BlueBook",
    }[domain] ??
    domain
  );
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

  if (
    !(
      realSenderName ||
      realSenderCompany ||
      realSenderEmail ||
      realSenderDomain
    )
  ) {
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

// ── Public API ───────────────────────────────────────────────────

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

export async function extractRealSenderWithLlm(
  domain: string | null,
  fromName: string | null,
  body: string | null,
  subject: string | null
): Promise<PlatformExtraction | null> {
  const relayDomain = domain?.toLowerCase().trim() ?? "";
  if (!(relayDomain && PLATFORM_SENDER_LLM_DOMAINS.has(relayDomain))) {
    return null;
  }

  const prompt = buildPlatformSenderPrompt(
    relayDomain,
    fromName,
    body,
    subject
  );
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

  result.realSenderCompany =
    extractCompanyFromDisplayName(config, fromName) ??
    extractCompanyFromSubject(config, subject);

  if (!result.realSenderCompany) {
    const fromBody = extractIdentityFromBody(config, body);
    result.realSenderCompany = fromBody.company;
    result.realSenderName = fromBody.name;
  }

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
