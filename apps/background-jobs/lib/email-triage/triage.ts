/**
 * Unified Email Triage — Main Orchestrator
 *
 * Single entry point: triageEmail(emailId, mailboxEmail, options?)
 *
 * Flow:
 *   1. Fast-path check (skip LLM for obvious cases)
 *   2. Gather full context (thread, documents, attachments, candidates)
 *   3. Build prompt and call LLM via opencode
 *   4. Parse + validate LLM output
 *   5. Dispatch (persist classification, link, enqueue job)
 */

import { getEmailById } from "@lib/db/repositories/email";
import { runOpencodeJsonPrompt } from "../email-intent/opencode";
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
const EMAIL_TRIAGE_TIMEOUT_MS = 30_000;

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

/**
 * Triage a single email: classify, link, and dispatch.
 *
 * Returns the triage outcome including classification result and dispatch actions.
 * In shadow mode, runs triage but does NOT dispatch (logs only).
 * In disabled mode, returns immediately.
 */
export async function triageEmail(
  emailId: number,
  meta: TriageEmailMeta
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

  const prompt = buildTriagePrompt(context);
  let raw: Record<string, unknown> | null = null;

  try {
    raw = await runOpencodeJsonPrompt(prompt, {
      model: EMAIL_TRIAGE_MODEL,
      timeoutMs: EMAIL_TRIAGE_TIMEOUT_MS,
    });
  } catch (error) {
    // Retry once with longer timeout on timeout errors
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("timed out")) {
      try {
        raw = await runOpencodeJsonPrompt(prompt, {
          model: EMAIL_TRIAGE_MODEL,
          timeoutMs: 60_000,
        });
      } catch (retryError) {
        const retryMsg =
          retryError instanceof Error ? retryError.message : String(retryError);
        console.error(
          `[triage] LLM retry failed for email ${emailId}: ${retryMsg}`
        );
        return {
          result: null,
          dispatch: null,
          skipped: false,
          skipReason: null,
          error: `llm_retry_failed: ${retryMsg}`,
        };
      }
    } else {
      console.error(`[triage] LLM failed for email ${emailId}: ${msg}`);
      return {
        result: null,
        dispatch: null,
        skipped: false,
        skipReason: null,
        error: `llm_failed: ${msg}`,
      };
    }
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
