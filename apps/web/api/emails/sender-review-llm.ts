export const SENDER_REVIEW_PROMPT_VERSION = "sender_domain_v1";

export interface DomainPromptSample {
  body_excerpt: string;
  from_email: string | null;
  received_at: string;
  subject: string | null;
}

export interface DomainPromptCandidate {
  domain: string;
  emailCount: number;
  samples: DomainPromptSample[];
}

export interface DomainVerdict {
  category: string | null;
  isWorkRelated: boolean;
}

export interface TokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export function buildDomainClassifierPrompt(
  candidate: DomainPromptCandidate
): string {
  return `Prompt version: "${SENDER_REVIEW_PROMPT_VERSION}"

You classify email sender domains for Desert Services, a construction services company.

Given sample emails from the domain "${candidate.domain}" (${candidate.emailCount} total emails), decide whether this domain sends work-related email.

Work-related means: estimates, projects, dust permits, contracts, scheduling, billing, vendors, subcontractors, customers, compliance, insurance, internal ops, construction platforms (Textura, Procore, PlanGrid, etc.).

NOT work-related: consumer retail, clothing, politics, generic newsletters, social media notifications, personal shopping, food delivery, ride-sharing, entertainment, random marketing.

Return ONLY valid JSON:
{
  "isWorkRelated": boolean,
  "category": "work_related" | "marketing" | "newsletter" | "politics" | "shopping" | "personal" | "social" | "spam" | "other",
  "confidence": number (0-1),
  "reason": string (brief explanation)
}

Sample emails from ${candidate.domain}:
${JSON.stringify(candidate.samples, null, 2)}`;
}

export function mapDomainVerdictToRule(verdict: DomainVerdict): {
  classification: "SPAM" | null;
  isExcluded: boolean;
} {
  if (verdict.isWorkRelated) {
    return {
      classification: null,
      isExcluded: false,
    };
  }

  return {
    classification: verdict.category === "spam" ? "SPAM" : null,
    isExcluded: true,
  };
}

export function extractUsageFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): TokenUsage {
  const usage =
    metadata && typeof metadata === "object"
      ? (metadata.usage as Record<string, unknown> | undefined)
      : undefined;

  const promptTokens = Number(usage?.prompt_tokens);
  const completionTokens = Number(usage?.completion_tokens);
  const totalTokens = Number(usage?.total_tokens);

  return {
    inputTokens: Number.isFinite(promptTokens) ? promptTokens : null,
    outputTokens: Number.isFinite(completionTokens) ? completionTokens : null,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : null,
  };
}
