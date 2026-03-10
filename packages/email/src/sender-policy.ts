import { db } from "@lib/db/client";
import { isSpam } from "@email/spam-filter";

export interface SenderPolicyDecision {
  classification: string | null;
  domain: string | null;
  isExcluded: boolean;
  matchedRuleDomain: string | null;
}

interface DomainRuleMatch {
  classification: string | null;
  domain: string;
  is_excluded: boolean;
}

function extractDomain(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const at = trimmed.lastIndexOf("@");
  if (at < 0 || at === trimmed.length - 1) {
    return null;
  }

  return (
    trimmed
      .slice(at + 1)
      .replace(/^<+|>+$/g, "")
      .trim() || null
  );
}

async function findMatchingDomainRule(
  domain: string | null
): Promise<DomainRuleMatch | null> {
  if (!domain) {
    return null;
  }

  return await db
    .query<DomainRuleMatch, [string]>(
      `SELECT domain, classification, is_excluded
       FROM domain_rules
       WHERE $1 = domain OR $1 LIKE '%.' || domain
       ORDER BY length(domain) DESC
       LIMIT 1`
    )
    .get(domain);
}

export function shouldKeepDocumentLocalOnly(
  classification: string | null | undefined,
  isExcluded: boolean | null | undefined = false
): boolean {
  const normalized = classification?.trim().toUpperCase() ?? null;
  return (
    Boolean(isExcluded) ||
    normalized === "HR" ||
    normalized === "IT" ||
    normalized === "SPAM"
  );
}

export function shouldPersistSourceToSharePointByPolicy(params: {
  classification?: string | null;
  isExcluded?: boolean | null;
}): boolean {
  return !shouldKeepDocumentLocalOnly(
    params.classification ?? null,
    params.isExcluded ?? false
  );
}

export async function resolveSenderPolicy(params: {
  fromEmail: string | null | undefined;
  subject?: string | null | undefined;
}): Promise<SenderPolicyDecision> {
  const domain = extractDomain(params.fromEmail);
  const matchedRule = await findMatchingDomainRule(domain);
  const spamResult = params.fromEmail
    ? isSpam(params.fromEmail, params.subject)
    : { isSpam: false };

  let classification: string | null = null;
  const normalizedRuleClassification = matchedRule?.classification
    ?.trim()
    .toUpperCase();

  if (normalizedRuleClassification) {
    classification = normalizedRuleClassification;
  } else if (spamResult.isSpam) {
    classification = "SPAM";
  }

  return {
    classification,
    domain,
    isExcluded: spamResult.isSpam || matchedRule?.is_excluded === true,
    matchedRuleDomain: matchedRule?.domain ?? null,
  };
}
