import { extractReplyAllExternalRecipients } from "./dust-permit-notification-recipients";
import {
  normalizeProjectAlias,
  tokenizeProjectText,
  tokenOverlap,
  uniqueStrings,
} from "@projects/db/project-matching-utils";

const REPLY_SIGNAL_TERMS = [
  "dust permit",
  "dust control permit",
  "noi",
  "loi",
  "maricopa",
];
const BILLING_SIGNAL_TERMS = ["billing", "invoice", "point and pay", "pointandpay"];
const INTERNAL_DOMAIN = "@desertservices.net";
const HAS_DIGIT_RE = /\d/;
const MARICOPA_SOURCE_SENDERS = new Set([
  "aqdimpact@maricopa.gov",
  "no-reply@maricopa.gov",
  "noreply@permitcenter.maricopa.gov",
]);

export interface PermitReplyRouteCandidate {
  bodyText: string | null;
  ccEmails: string[];
  chiEmailId: number | null;
  emailId: number;
  fromEmail: string | null;
  hasChiCopy: boolean;
  isForwarded: boolean;
  isInternal: boolean;
  mailboxEmail: string;
  receivedAt: string;
  subject: string | null;
  toEmails: string[];
}

export interface RankedPermitReplyRouteCandidate
  extends PermitReplyRouteCandidate {
  reasons: string[];
  score: number;
}

export interface PermitReplyRouteSelection {
  matchedRecipients: string[];
  mode: "compose-new" | "reply-all";
  rankedCandidates: RankedPermitReplyRouteCandidate[];
  reason: string;
  replyToEmailId: number | null;
  selectedCandidateEmailId: number | null;
}

function normalizeText(value: string | null | undefined): string {
  return normalizeProjectAlias(value ?? "");
}

function parseDateMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildProjectVariants(projectName: string | null | undefined): string[] {
  const trimmed = projectName?.trim();
  if (!trimmed) {
    return [];
  }

  const dashSplit = trimmed
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean)[0];
  const words = trimmed.split(/\s+/).filter(Boolean);
  const prefixes: string[] = [];

  if (words.length >= 3) {
    const candidate = words.slice(0, 3).join(" ");
    if (candidate.length >= 6 || HAS_DIGIT_RE.test(candidate)) {
      prefixes.push(candidate);
    }
  }

  return uniqueStrings([trimmed, dashSplit, ...prefixes]);
}

export function buildPermitReplySearchTerms(params: {
  permitId?: string | null;
  projectName?: string | null;
}): string[] {
  return uniqueStrings([
    params.permitId,
    ...buildProjectVariants(params.projectName),
  ]);
}

function subjectStartsReply(subject: string | null | undefined): boolean {
  return /^(re|fw|fwd):/i.test((subject ?? "").trim());
}

function isInternalSender(candidate: PermitReplyRouteCandidate): boolean {
  return (
    candidate.isInternal ||
    candidate.fromEmail?.toLowerCase().endsWith(INTERNAL_DOMAIN) === true
  );
}

function isSystemPermitSender(candidate: PermitReplyRouteCandidate): boolean {
  return MARICOPA_SOURCE_SENDERS.has(candidate.fromEmail?.toLowerCase() ?? "");
}

function scorePermitReplyRouteCandidate(
  candidate: PermitReplyRouteCandidate,
  params: {
    permitId?: string | null;
    projectName?: string | null;
  }
): RankedPermitReplyRouteCandidate {
  let score = 0;
  const reasons: string[] = [];
  const subjectText = normalizeText(candidate.subject);
  const bodyText = normalizeText(candidate.bodyText);
  const haystack = `${subjectText} ${bodyText}`.trim();

  if (candidate.hasChiCopy) {
    score += 45;
    reasons.push("chi-copy");
  } else {
    score -= 25;
    reasons.push("no-chi-copy");
  }

  if (!isInternalSender(candidate) && !isSystemPermitSender(candidate)) {
    score += 60;
    reasons.push("external-sender");
  } else if (isSystemPermitSender(candidate)) {
    score -= 80;
    reasons.push("system-permit-sender");
  } else {
    score -= 120;
    reasons.push("internal-sender");
  }

  if (candidate.isForwarded) {
    score -= 60;
    reasons.push("forwarded");
  }

  if (subjectStartsReply(candidate.subject)) {
    score += 12;
    reasons.push("reply-subject");
  }

  if (params.permitId && haystack.includes(params.permitId.toLowerCase())) {
    score += 70;
    reasons.push("permit-id-match");
  }

  const replySignalHits = REPLY_SIGNAL_TERMS.filter((term) =>
    haystack.includes(term)
  );
  if (replySignalHits.length > 0) {
    score += 35;
    reasons.push("permit-signal");
  }

  const billingSignalHits = BILLING_SIGNAL_TERMS.filter((term) =>
    haystack.includes(term)
  );
  if (billingSignalHits.length > 0) {
    score -= 90;
    reasons.push("billing-signal");
  }

  const projectVariants = buildProjectVariants(params.projectName);
  const phraseMatch = projectVariants.find((variant) =>
    haystack.includes(normalizeText(variant))
  );
  if (phraseMatch) {
    score += 45;
    reasons.push("project-phrase-match");
  } else if (params.projectName) {
    const overlap = tokenOverlap(
      tokenizeProjectText(params.projectName),
      tokenizeProjectText(`${candidate.subject ?? ""} ${candidate.bodyText ?? ""}`)
    );
    if (overlap.ratio >= 0.5) {
      score += 30;
      reasons.push("project-token-overlap");
    } else if (overlap.ratio > 0) {
      score += 12;
      reasons.push("weak-project-overlap");
    }
  }

  return {
    ...candidate,
    reasons,
    score,
  };
}

export function selectPermitReplyRoute(
  candidates: PermitReplyRouteCandidate[],
  params: {
    permitId?: string | null;
    projectName?: string | null;
  }
): PermitReplyRouteSelection {
  const rankedCandidates = [...candidates]
    .map((candidate) => scorePermitReplyRouteCandidate(candidate, params))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return parseDateMs(right.receivedAt) - parseDateMs(left.receivedAt);
    });

  const replyAllCandidate =
    rankedCandidates.find(
      (candidate) =>
        candidate.hasChiCopy &&
        candidate.chiEmailId &&
        !candidate.isForwarded &&
        !isInternalSender(candidate) &&
        !isSystemPermitSender(candidate)
    ) ?? null;
  const selected =
    replyAllCandidate ??
    rankedCandidates.find(
      (candidate) =>
        !isInternalSender(candidate) && !isSystemPermitSender(candidate)
    ) ??
    rankedCandidates.find((candidate) => !isSystemPermitSender(candidate)) ??
    rankedCandidates[0] ??
    null;
  const matchedRecipients = selected
    ? extractReplyAllExternalRecipients({
        ccEmails: selected.ccEmails,
        fromEmail: selected.fromEmail,
        toEmails: selected.toEmails,
      })
    : [];

  if (!(selected && selected.score >= 50)) {
    return {
      matchedRecipients,
      mode: "compose-new",
      rankedCandidates,
      reason: selected ? "top candidate below reply-all threshold" : "no candidates found",
      replyToEmailId: null,
      selectedCandidateEmailId: selected?.emailId ?? null,
    };
  }

  if (!replyAllCandidate || !replyAllCandidate.hasChiCopy || !replyAllCandidate.chiEmailId) {
    return {
      matchedRecipients,
      mode: "compose-new",
      rankedCandidates,
      reason: "top candidate has no chi mailbox copy",
      replyToEmailId: null,
      selectedCandidateEmailId: selected.emailId,
    };
  }

  return {
    matchedRecipients,
    mode: "reply-all",
    rankedCandidates,
    reason: "selected external thread with chi mailbox copy",
    replyToEmailId: replyAllCandidate.chiEmailId,
    selectedCandidateEmailId: replyAllCandidate.emailId,
  };
}
