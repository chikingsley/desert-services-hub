/**
 * Unified Email Triage — Main Orchestrator
 *
 * Single entry point: triageEmail(emailId, mailboxEmail, options?)
 *
 * Flow:
 *   1. Fast-path check (skip LLM for obvious cases)
 *   2. Gather full context (thread, documents, attachments, candidates)
 *   3. Build prompt and call LLM
 *   4. Parse + validate LLM output
 *   5. Dispatch (persist classification, link, enqueue job)
 */

import { getEmailById } from "@lib/db/repositories/email";
import type { LlmProvider } from "../llm";
import { runJsonPrompt } from "../llm";
import { gatherTriageContext } from "./triage-context";
import type { DispatchResult } from "./triage-dispatch";
import { dispatchTriageResult } from "./triage-dispatch";
import { parseTriageOutput } from "./triage-parse";
import { buildTriagePrompt } from "./triage-prompt";
import type { TriageEmailMeta, TriageMode, TriageResult } from "./triage-types";

// ── Config ──────────────────────────────────────────────────

function parseTriageMode(value: string | undefined): TriageMode {
  const trimmed = (value ?? "active").trim().toLowerCase();
  if (trimmed === "shadow" || trimmed === "disabled") {
    return trimmed;
  }
  return "active";
}

const EMAIL_TRIAGE_MODE = parseTriageMode(process.env.EMAIL_TRIAGE_MODE);
const EMAIL_TRIAGE_MODEL = (
  process.env.GEMINI_FAST_MODEL ?? "gemini-2.5-flash-lite"
).trim();
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL ?? "granite4:latest";

// ── Internal domains (fast-path) ────────────────────────────

const INTERNAL_DOMAINS = new Set([
  "desertservices.net",
  "desertservices.app",
  "upwindcompanies.com",
]);

// ── Public API ──────────────────────────────────────────────

export interface TriageOutcome {
  result: TriageResult | null;
  dispatch: DispatchResult | null;
  skipped: boolean;
  skipReason: string | null;
  error: string | null;
}

export interface TriageOptions {
  /** Override LLM provider (default: gemini) */
  provider?: LlmProvider;
}

/**
 * Triage a single email: classify, link, and dispatch.
 *
 * Returns the triage outcome including classification result and dispatch actions.
 * In shadow mode, runs triage but does NOT dispatch (logs only).
 * In disabled mode, returns immediately.
 */
export async function triageEmail(
  emailId: number,
  meta: TriageEmailMeta,
  options?: TriageOptions
): Promise<TriageOutcome> {
  if (EMAIL_TRIAGE_MODE === "disabled") {
    return {
      result: null,
      dispatch: null,
      skipped: true,
      skipReason: "triage_disabled",
      error: null,
    };
  }

  const fastResult = await checkFastPath(emailId);
  if (fastResult) {
    return fastResult;
  }

  const context = await gatherTriageContext(emailId, meta.mailboxEmail);
  if (!context) {
    return {
      result: null,
      dispatch: null,
      skipped: true,
      skipReason: "email_not_found",
      error: null,
    };
  }

  const provider: LlmProvider = options?.provider ?? "gemini";
  const model = provider === "local" ? LOCAL_LLM_MODEL : EMAIL_TRIAGE_MODEL;

  const prompt = buildTriagePrompt(context);
  let raw: Record<string, unknown> | null = null;

  try {
    raw = await runJsonPrompt(prompt, { model, provider });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[triage] LLM failed for email ${emailId}: ${msg}`);
    return {
      result: null,
      dispatch: null,
      skipped: false,
      skipReason: null,
      error: `llm_failed: ${msg}`,
    };
  }

  const validProjectIds = new Set(context.candidates.projects.map((p) => p.id));
  const validEstimateIds = new Set(
    context.candidates.estimates.map((e) => e.id)
  );
  const result = parseTriageOutput(raw, validProjectIds, validEstimateIds);

  if (!result) {
    console.warn(
      `[triage] failed to parse LLM output for email ${emailId}:`,
      JSON.stringify(raw)
    );
    return {
      result: null,
      dispatch: null,
      skipped: false,
      skipReason: null,
      error: "parse_failed",
    };
  }

  if (EMAIL_TRIAGE_MODE === "shadow") {
    console.log(
      `[triage:shadow] email=${emailId} category=${result.category} sub=${result.subcategory} ` +
        `project=${result.projectId} estimate=${result.estimateId} conf=${result.confidence} ` +
        `reason="${result.reason}"`
    );
    return {
      result,
      dispatch: null,
      skipped: false,
      skipReason: null,
      error: null,
    };
  }

  const dispatch = await dispatchTriageResult(result, meta);

  console.log(
    `[triage] email=${emailId} category=${result.category} sub=${result.subcategory} ` +
      `project=${result.projectId} estimate=${result.estimateId} ` +
      `job=${dispatch.jobEnqueued ?? "none"} conf=${result.confidence}`
  );

  return { result, dispatch, skipped: false, skipReason: null, error: null };
}

// ── Fast path ───────────────────────────────────────────────

async function checkFastPath(emailId: number): Promise<TriageOutcome | null> {
  const email = await getEmailById(emailId);
  if (!email) {
    return {
      result: null,
      dispatch: null,
      skipped: true,
      skipReason: "email_not_found",
      error: null,
    };
  }

  // Already classified by domain rule with an action-triggering category
  if (
    email.classification &&
    email.classificationMethod === "pattern" &&
    isActionCategory(email.classification)
  ) {
    return {
      result: null,
      dispatch: null,
      skipped: true,
      skipReason: "already_classified_with_action",
      error: null,
    };
  }

  // Spam / excluded
  if (email.isExcluded) {
    return {
      result: null,
      dispatch: null,
      skipped: true,
      skipReason: "excluded",
      error: null,
    };
  }

  // Internal email with no attachments — just classify INTERNAL, skip LLM
  if (email.isInternal && !email.hasAttachments) {
    const fromDomain = email.fromDomain?.toLowerCase();
    if (fromDomain && INTERNAL_DOMAINS.has(fromDomain)) {
      return {
        result: null,
        dispatch: null,
        skipped: true,
        skipReason: "internal_no_attachments",
        error: null,
      };
    }
  }

  // Empty email — nothing to classify
  if (!(email.subject || email.bodyFull || email.hasAttachments)) {
    return {
      result: null,
      dispatch: null,
      skipped: true,
      skipReason: "empty_email",
      error: null,
    };
  }

  return null;
}

function isActionCategory(classification: string): boolean {
  return (
    classification === "PAYMENT" ||
    classification === "DUST_PERMIT" ||
    classification === "CONTRACT" ||
    classification === "CHANGE_ORDER"
  );
}
