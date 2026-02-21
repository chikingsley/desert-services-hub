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

import {
  getEmailById,
  updateEmailClassification,
} from "@lib/db/repositories/email";
import type { EmailClassification } from "@lib/db/types";
import { chat } from "@lib/pdf-analysis";
import { gatherTriageContext } from "./context";
import { dispatchTriageResult } from "./dispatch";
import {
  evaluateTriageRerankShadow,
  rerankProjectCandidates,
  type TriageRerankMode,
} from "./rerank-shadow";
import type {
  TriageContext,
  TriageEmailMeta,
  TriageMode,
  TriageOptions,
  TriageOutcome,
  TriageResult,
  TriageSubcategory,
} from "./types";
import {
  ACTION_CATEGORIES,
  CATEGORY_GUIDANCE,
  SUBCATEGORY_GUIDANCE,
  VALID_CATEGORIES,
  VALID_SUBCATEGORIES,
} from "./types";

// ── Config ──────────────────────────────────────────────────

function parseTriageMode(value: string | undefined): TriageMode {
  const trimmed = (value ?? "active").trim().toLowerCase();
  if (trimmed === "shadow" || trimmed === "disabled") {
    return trimmed;
  }
  return "active";
}

function parseTriageRerankMode(value: string | undefined): TriageRerankMode {
  const trimmed = (value ?? "disabled").trim().toLowerCase();
  if (trimmed === "shadow" || trimmed === "project") {
    return trimmed;
  }
  return "disabled";
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

const EMAIL_TRIAGE_MODE = parseTriageMode(process.env.EMAIL_TRIAGE_MODE);
const EMAIL_TRIAGE_MODEL = (
  process.env.GEMINI_FAST_MODEL ?? "gemini-2.5-flash-lite"
).trim();
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL ?? "granite4:latest";
const EMAIL_TRIAGE_RERANK_MODE = parseTriageRerankMode(
  process.env.EMAIL_TRIAGE_RERANK_MODE
);
const EMAIL_TRIAGE_RERANK_TOP_N = parsePositiveInt(
  process.env.EMAIL_TRIAGE_RERANK_TOP_N,
  3
);
const DEFAULT_TRIAGE_PROVIDER =
  (process.env.EMAIL_TRIAGE_PROVIDER ?? "local").trim().toLowerCase() ===
  "local"
    ? "local"
    : "gemini";
const TRIAGE_ACTION_CATEGORY_SET = ACTION_CATEGORIES;
const TRIAGE_CATEGORY_GUIDANCE_MAP = CATEGORY_GUIDANCE;
const TRIAGE_SUBCATEGORY_GUIDANCE_MAP = SUBCATEGORY_GUIDANCE;
const TRIAGE_VALID_CATEGORIES = VALID_CATEGORIES;
const TRIAGE_VALID_SUBCATEGORIES = VALID_SUBCATEGORIES;

// ── Public API ──────────────────────────────────────────────

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

  const provider = options?.provider ?? DEFAULT_TRIAGE_PROVIDER;
  const _model = provider === "local" ? LOCAL_LLM_MODEL : EMAIL_TRIAGE_MODEL;

  const rerankedProjects = await rerankProjectCandidates(
    {
      context,
      emailId,
    },
    {
      mode: EMAIL_TRIAGE_RERANK_MODE,
      topN: EMAIL_TRIAGE_RERANK_TOP_N,
    }
  );

  const triageContext =
    rerankedProjects === context.candidates.projects
      ? context
      : {
          ...context,
          candidates: {
            ...context.candidates,
            projects: rerankedProjects,
          },
        };

  const prompt = buildTriagePrompt(triageContext);
  let raw: Record<string, unknown> | null = null;

  try {
    const chatResult = await chat(prompt, provider);
    raw = Object.keys(chatResult.data).length > 0 ? chatResult.data : null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[triage] LLM failed for email ${emailId}: ${msg}`);
    await persistTerminalUnknown(emailId, "llm_failed");
    return {
      result: null,
      dispatch: null,
      skipped: false,
      skipReason: null,
      error: `llm_failed: ${msg}`,
    };
  }

  const validProjectIds = new Set(
    triageContext.candidates.projects.map((p) => p.id)
  );
  const validEstimateIds = new Set(
    triageContext.candidates.estimates.map((e) => e.id)
  );
  const result = parseTriageOutput(raw, validProjectIds, validEstimateIds);

  if (!result) {
    console.warn(
      `[triage] failed to parse LLM output for email ${emailId}:`,
      JSON.stringify(raw)
    );
    await persistTerminalUnknown(emailId, "parse_failed");
    return {
      result: null,
      dispatch: null,
      skipped: false,
      skipReason: null,
      error: "parse_failed",
    };
  }

  await evaluateTriageRerankShadow(
    {
      context: triageContext,
      emailId,
      llmResult: result,
    },
    {
      mode: EMAIL_TRIAGE_RERANK_MODE,
      topN: EMAIL_TRIAGE_RERANK_TOP_N,
    }
  );

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

  const dispatch = await dispatchTriageResult(
    result,
    meta,
    options?.enqueueJob
  );

  console.log(
    `[triage] email=${emailId} category=${result.category} sub=${result.subcategory} ` +
      `project=${result.projectId} estimate=${result.estimateId} ` +
      `job=${dispatch.jobEnqueued ?? "none"} conf=${result.confidence}`
  );

  return { result, dispatch, skipped: false, skipReason: null, error: null };
}

// ── Fast path ───────────────────────────────────────────────

async function checkFastPath(
  emailId: number
): Promise<TriageOutcome | null> {
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

  // Empty email — nothing to classify
  if (!(email.subject || email.bodyFull || email.hasAttachments)) {
    await updateEmailClassification(emailId, "UNKNOWN", 0, "pattern");
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
  return TRIAGE_ACTION_CATEGORY_SET.has(classification as EmailClassification);
}

async function persistTerminalUnknown(
  emailId: number,
  _reason: "llm_failed" | "parse_failed"
): Promise<void> {
  // Mark terminal failures as UNKNOWN so backfill doesn't retry the same row forever.
  await updateEmailClassification(emailId, "UNKNOWN", 0, "llm");
}

function formatGuidanceLines(guidance: Record<string, string>): string {
  return Object.entries(guidance)
    .map(([label, description]) => `- ${label} — ${description}`)
    .join("\n");
}

function buildTriagePrompt(context: TriageContext): string {
  const categoryLines = formatGuidanceLines(TRIAGE_CATEGORY_GUIDANCE_MAP);
  const subcategoryLines = formatGuidanceLines(TRIAGE_SUBCATEGORY_GUIDANCE_MAP);
  const systemInstructions = `You classify incoming emails for Desert Services, a dust control and environmental services company based in Arizona.

You are given:
1. The email (full body, metadata)
2. Conversation thread (other emails in this thread, chronological)
3. Extracted documents (parsed content from attachments in this thread)
4. Candidate projects and estimates (possible matches from the database)

Classify the email and determine which project/estimate it belongs to.

Return a JSON object with these fields:
{
  "category": "<one of the category values listed below>",
  "subcategory": "<one of the subcategory values listed below, or null>",
  "project_id": <number from candidates list, or null>,
  "estimate_id": <number from candidates list, or null>,
  "confidence": <number 0.0 to 1.0>,
  "reason": "<brief explanation, max 200 chars>"
}

CATEGORIES:
${categoryLines}

SUBCATEGORIES (use when applicable, otherwise null):
${subcategoryLines}

RULES:
- Only pick project_id/estimate_id from the provided candidates. Never invent IDs.
- If unsure between candidates, return null for that field.
- PAYMENT means a payment processor confirmation (e.g. PointAndPay receipt), NOT an invoice or billing request.
- DUST_PERMIT + permit_issued = official "your permit has been approved/issued" from a government authority (Maricopa County, ADEQ).
- CONTRACT = actual contract documents received as attachments, not a discussion about contracts.
- Use the thread context, extracted documents, and attachment content to inform your decision.
- If the thread already has a linked project, that's strong evidence the email belongs to the same project.
- Return UNKNOWN if genuinely unclear. Do not force a classification.
- Return ONLY valid JSON, no markdown fences, no other text.`;

  const payload = buildPromptPayload(context);
  return `${systemInstructions}\n\n${JSON.stringify(payload, null, 2)}`;
}

function buildPromptPayload(context: TriageContext): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    email: buildEmailSection(context),
  };

  if (context.thread.length > 0) {
    payload.thread = context.thread.map((msg) => ({
      from: msg.from,
      subject: msg.subject,
      body_preview: msg.bodyPreview,
      received_at: msg.receivedAt,
      linked_project_id: msg.projectId,
      classification: msg.classification,
    }));
  }

  if (context.documents.length > 0) {
    payload.extracted_documents = context.documents.map((doc) => ({
      document_type: doc.documentType,
      summary: doc.summary,
      file_name: doc.fileName,
      ...doc.keyFields,
    }));
  }

  if (context.attachments.length > 0) {
    payload.attachment_content = context.attachments.map((att) => ({
      name: att.name,
      content_type: att.contentType,
      text: att.extractedText,
    }));
  }

  if (context.candidates.projects.length > 0) {
    payload.candidate_projects = context.candidates.projects.map((p) => ({
      id: p.id,
      name: p.name,
      contractor: p.contractor,
      address: p.address,
      score: p.score,
    }));
  }

  if (context.candidates.estimates.length > 0) {
    payload.candidate_estimates = context.candidates.estimates.map((e) => ({
      id: e.id,
      estimate_number: e.estimateNumber,
      job_name: e.jobName,
      contractor: e.contractor,
      job_address: e.jobAddress,
      project_id: e.projectId,
      score: e.score,
    }));
  }

  return payload;
}

function buildEmailSection(context: TriageContext): Record<string, unknown> {
  const email = context.email;
  const section: Record<string, unknown> = {
    id: email.id,
    subject: email.subject,
    body: email.body,
    from: email.from,
    to: email.to,
    cc: email.cc,
    mailbox: email.mailbox,
    received_at: email.receivedAt,
    attachment_names: email.attachmentNames,
  };

  if (email.isForwarded) {
    section.is_forwarded = true;
    section.original_sender = email.originalSender;
  }

  if (email.isPlatformEmail) {
    section.is_platform_email = true;
    section.platform_name = email.platformName;
  }

  if (email.categories.length > 0) {
    section.outlook_categories = email.categories;
  }

  if (email.existingProjectId) {
    section.already_linked_project_id = email.existingProjectId;
  }

  if (email.existingClassification) {
    section.existing_classification = email.existingClassification;
  }

  return section;
}

function parseTriageOutput(
  raw: Record<string, unknown> | null,
  validProjectIds: Set<number>,
  validEstimateIds: Set<number>
): TriageResult | null {
  if (!raw) {
    return null;
  }

  const category = normalizeCategory(raw.category);
  if (!category) {
    return null;
  }

  return {
    category,
    subcategory: normalizeSubcategory(raw.subcategory),
    projectId: normalizeId(raw.project_id, validProjectIds),
    estimateId: normalizeId(raw.estimate_id, validEstimateIds),
    confidence: clampConfidence(raw.confidence),
    reason: normalizeReason(raw.reason),
  };
}

function normalizeCategory(value: unknown): EmailClassification | null {
  if (typeof value !== "string") {
    return null;
  }
  const upper = value.trim().toUpperCase() as EmailClassification;
  return TRIAGE_VALID_CATEGORIES.has(upper) ? upper : null;
}

function normalizeSubcategory(value: unknown): TriageSubcategory | null {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const lower = value.trim().toLowerCase() as TriageSubcategory;
  return TRIAGE_VALID_SUBCATEGORIES.has(lower) ? lower : null;
}

function normalizeId(value: unknown, validIds: Set<number>): number | null {
  if (value == null) {
    return null;
  }
  const num = typeof value === "number" ? value : Number(value);
  if (!(Number.isFinite(num) && Number.isInteger(num))) {
    return null;
  }
  return validIds.has(num) ? num : null;
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeReason(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length <= 200 ? trimmed : trimmed.slice(0, 200);
}
