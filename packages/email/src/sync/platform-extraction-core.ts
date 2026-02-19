/**
 * Platform Email Extraction Core
 *
 * Rules and parsing utilities for extracting real sender data from
 * platform-originated emails.
 */
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

interface PlatformDomainConfig {
  name: string;
  patterns: RegExp[];
  fromEmailPattern?: RegExp;
  companyFirst?: boolean;
  subjectPatterns?: RegExp[];
  excludeSubjects?: RegExp[];
}

export const PLATFORM_DOMAINS: Record<string, PlatformDomainConfig> = {
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
  "com2.smartbidnet.com": {
    name: "SmartBidNet",
    patterns: [],
  },
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
  "smartbidnet.com": {
    name: "SmartBidNet",
    patterns: [],
  },
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

function getPlatformConfig(domain: string | null): PlatformDomainConfig | null {
  if (!domain) {
    return null;
  }
  return PLATFORM_DOMAINS[domain.toLowerCase()] ?? null;
}

function createExtractionResult(
  config: PlatformDomainConfig
): PlatformExtraction {
  return {
    platformName: config.name,
    realSenderCompany: null,
    realSenderDomain: null,
    realSenderEmail: null,
    realSenderName: null,
  };
}

function extractCompanyFromFromEmail(
  config: PlatformDomainConfig,
  fromEmail: string | null,
  fromName: string | null
): string | null {
  if (!config.fromEmailPattern) {
    return null;
  }
  // Try display name first (e.g. "Turner via DocuSign"), then raw email address
  for (const candidate of [fromName, fromEmail]) {
    if (!candidate) continue;
    const m = candidate.match(config.fromEmailPattern);
    if (m?.[1]) return m[1].replaceAll(/_/g, " ");
  }
  return null;
}

function extractCompanyFromSubject(
  config: PlatformDomainConfig,
  subject: string | null
): string | null {
  if (!(config.subjectPatterns && subject)) {
    return null;
  }

  for (const pattern of config.subjectPatterns) {
    const match = subject.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}

function extractSenderIdentityFromBody(
  config: PlatformDomainConfig,
  body: string | null
): { company: string | null; name: string | null } {
  if (!body) {
    return { company: null, name: null };
  }

  for (const pattern of config.patterns) {
    const match = body.match(pattern);
    if (!match) {
      continue;
    }

    if (match.length === 3) {
      return config.companyFirst
        ? {
            company: match[1]?.trim() ?? null,
            name: match[2]?.trim() ?? null,
          }
        : {
            company: match[2]?.trim() ?? null,
            name: match[1]?.trim() ?? null,
          };
    }

    if (match.length === 2) {
      return {
        company: match[1]?.trim() ?? null,
        name: null,
      };
    }
  }

  return { company: null, name: null };
}

function extractPrimaryEmailFromBody(body: string | null): string | null {
  if (!body) {
    return null;
  }
  const emails = extractEmailsFromBody(body);
  return emails[0] ?? null;
}

function hasExtractionSignal(result: PlatformExtraction): boolean {
  return Boolean(
    result.realSenderEmail || result.realSenderName || result.realSenderCompany
  );
}

export function extractRealSender(
  domain: string | null,
  fromEmail: string | null,
  fromName: string | null,
  body: string | null,
  subject: string | null
): PlatformExtraction | null {
  const config = getPlatformConfig(domain);
  if (!config) {
    return null;
  }

  const result = createExtractionResult(config);
  result.realSenderCompany = extractCompanyFromFromEmail(
    config,
    fromEmail,
    fromName
  );

  if (!result.realSenderCompany) {
    result.realSenderCompany = extractCompanyFromSubject(config, subject);
  }

  if (!result.realSenderCompany) {
    const fromBody = extractSenderIdentityFromBody(config, body);
    result.realSenderCompany = fromBody.company;
    result.realSenderName = fromBody.name;
  }

  result.realSenderEmail = extractPrimaryEmailFromBody(body);
  result.realSenderDomain = result.realSenderEmail
    ? (result.realSenderEmail.split("@")[1]?.toLowerCase() ?? null)
    : null;

  return hasExtractionSignal(result) ? result : null;
}
