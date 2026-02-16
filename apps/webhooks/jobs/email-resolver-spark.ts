import type { EstimateResolutionResult } from "@email/resolution/types";
import {
  EMAIL_RESOLVER_SPARK_CONFIDENCE_MIN,
  EMAIL_RESOLVER_SPARK_ENABLED,
  EMAIL_RESOLVER_SPARK_MAX_CANDIDATES,
  EMAIL_RESOLVER_SPARK_RETRY_TIMEOUT_MS,
  EMAIL_RESOLVER_SPARK_TIMEOUT_MS,
} from "./config";
import {
  type ParsedOpencodeOutput,
  parseOpencodeOutput,
  runOpencodePrompt,
} from "./email-resolver-spark-runner";

interface SparkTieBreakChoice {
  estimateId: number;
  confidence: number;
  reason: string;
}

const OPENCODE_TIMEOUT_RE = /timed out/i;

let warnedOpencodeUnavailable = false;

function getCandidateIds(
  candidates: Array<{ estimateId: number }>
): Set<number> {
  return new Set(candidates.map((candidate) => candidate.estimateId));
}

function buildPromptPayload(
  emailId: number,
  resolution: NonNullable<EstimateResolutionResult["ambiguous"]>
): string {
  const context = resolution.matchResult?.context;
  const decision = resolution.decision;
  const candidates = resolution.candidates;
  const safeContext = {
    subject: context?.subject ?? "",
    bodyPreview: context?.bodyPreview ?? "",
    attachmentNames: context?.attachmentNames ?? [],
    fromDomain: context?.fromDomain ?? null,
    projectHints: context?.projectHints ?? [],
    contractorHints: context?.contractorHints ?? [],
    addressHints: context?.addressHints ?? [],
    estimateReferenceHints: context?.estimateReferenceHints ?? [],
  };

  const payload = {
    email: {
      id: emailId,
      subject: safeContext.subject,
      bodyPreview: safeContext.bodyPreview.slice(0, 1200),
      attachmentNames: safeContext.attachmentNames.slice(0, 12),
      fromDomain: safeContext.fromDomain,
      projectHints: safeContext.projectHints.slice(0, 12),
      contractorHints: safeContext.contractorHints.slice(0, 12),
      addressHints: safeContext.addressHints.slice(0, 12),
      estimateReferenceHints: safeContext.estimateReferenceHints.slice(0, 8),
    },
    decision,
    candidates: candidates.map((candidate) => ({
      estimateId: candidate.estimateId,
      estimateNumber: candidate.estimateNumber,
      name: candidate.name,
      jobName: candidate.jobName,
      contractor: candidate.contractor,
      jobAddress: candidate.jobAddress,
      score: candidate.score,
      confidence: candidate.confidence,
      reasons: candidate.reasons,
    })),
  };

  return [
    "You are a strict estimate-link tie-breaker.",
    "Choose only one estimateId from the provided candidates.",
    "If evidence is insufficient, return null estimateId.",
    "Return ONLY valid JSON with keys: estimateId, confidence, reason.",
    "Rules:",
    "- estimateId must be either null or exactly one candidate estimateId.",
    "- confidence must be a number from 0 to 1.",
    "- reason must be short and evidence-based.",
    "",
    JSON.stringify(payload),
  ].join("\n");
}

function parseChoice(
  parsed: ParsedOpencodeOutput,
  candidateIds: Set<number>
): SparkTieBreakChoice | null {
  const estimateIdRaw = parsed.estimateId;
  const confidenceRaw = parsed.confidence;
  const reasonRaw = parsed.reason;

  if (estimateIdRaw === null) {
    return null;
  }
  if (typeof estimateIdRaw !== "number" || !Number.isInteger(estimateIdRaw)) {
    return null;
  }
  if (!candidateIds.has(estimateIdRaw)) {
    return null;
  }

  const confidence =
    typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
      ? Math.max(0, Math.min(1, confidenceRaw))
      : 0;
  if (confidence < EMAIL_RESOLVER_SPARK_CONFIDENCE_MIN) {
    return null;
  }

  return {
    estimateId: estimateIdRaw,
    confidence,
    reason: typeof reasonRaw === "string" ? reasonRaw.slice(0, 280) : "",
  };
}

function shouldRetryTimeout(message: string): boolean {
  return (
    OPENCODE_TIMEOUT_RE.test(message) &&
    EMAIL_RESOLVER_SPARK_RETRY_TIMEOUT_MS > EMAIL_RESOLVER_SPARK_TIMEOUT_MS
  );
}

async function runWithTimeoutRetry(
  prompt: string
): Promise<ParsedOpencodeOutput | null> {
  try {
    const output = await runOpencodePrompt(
      prompt,
      EMAIL_RESOLVER_SPARK_TIMEOUT_MS
    );
    return parseOpencodeOutput(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!shouldRetryTimeout(message)) {
      throw error;
    }

    console.warn(
      `[email-resolver] spark tie-breaker timeout at ${EMAIL_RESOLVER_SPARK_TIMEOUT_MS}ms; retrying once at ${EMAIL_RESOLVER_SPARK_RETRY_TIMEOUT_MS}ms`
    );
    const output = await runOpencodePrompt(
      prompt,
      EMAIL_RESOLVER_SPARK_RETRY_TIMEOUT_MS
    );
    return parseOpencodeOutput(output);
  }
}

export async function runSparkEstimateTieBreaker(
  emailId: number,
  resolution: EstimateResolutionResult
): Promise<SparkTieBreakChoice | null> {
  if (!EMAIL_RESOLVER_SPARK_ENABLED || resolution.status !== "ambiguous") {
    return null;
  }

  const ambiguous = resolution.ambiguous;
  if (!ambiguous || ambiguous.candidates.length < 2) {
    return null;
  }

  const candidates = ambiguous.candidates.slice(
    0,
    EMAIL_RESOLVER_SPARK_MAX_CANDIDATES
  );
  if (candidates.length < 2) {
    return null;
  }

  const prompt = buildPromptPayload(emailId, { ...ambiguous, candidates });
  const candidateIds = getCandidateIds(candidates);

  let parsed: ParsedOpencodeOutput | null = null;
  try {
    parsed = await runWithTimeoutRetry(prompt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !warnedOpencodeUnavailable &&
      message.toLowerCase().includes("enoent")
    ) {
      warnedOpencodeUnavailable = true;
      console.warn(
        "[email-resolver] spark fallback unavailable: opencode CLI not found in runtime PATH"
      );
    }
    console.warn(`[email-resolver] spark tie-breaker failed: ${message}`);
    return null;
  }

  if (!parsed) {
    return null;
  }

  return parseChoice(parsed, candidateIds);
}
