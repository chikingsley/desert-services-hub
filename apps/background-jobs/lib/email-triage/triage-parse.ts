/**
 * Unified Email Triage — Output Parser
 *
 * Parses and validates the raw JSON output from the LLM triage call.
 * Ensures category is valid, confidence is clamped, and IDs come from
 * the candidate lists.
 */

import type { EmailClassification } from "@lib/db/types";
import {
  TRIAGE_CATEGORIES,
  TRIAGE_SUBCATEGORIES,
  type TriageSubcategory,
} from "./triage-taxonomy";
import type { TriageResult } from "./types";

// ── Valid values ────────────────────────────────────────────

const VALID_CATEGORIES = new Set<string>(TRIAGE_CATEGORIES);

const VALID_SUBCATEGORIES = new Set<string>(TRIAGE_SUBCATEGORIES);

// ── Parser ──────────────────────────────────────────────────

/**
 * Parse raw LLM output into a validated TriageResult.
 *
 * @param raw - Parsed JSON object from LLM response
 * @param validProjectIds - Set of candidate project IDs (LLM can only pick from these)
 * @param validEstimateIds - Set of candidate estimate IDs (LLM can only pick from these)
 * @returns Validated TriageResult or null if parsing fails
 */
export function parseTriageOutput(
  raw: Record<string, unknown> | null,
  validProjectIds: Set<number>,
  validEstimateIds: Set<number>
): TriageResult | null {
  if (!raw) {
    return null;
  }

  // Category (required)
  const category = normalizeCategory(raw.category);
  if (!category) {
    return null;
  }

  // Subcategory (optional)
  const subcategory = normalizeSubcategory(raw.subcategory);

  // Project ID (must be from candidates)
  const projectId = normalizeId(raw.project_id, validProjectIds);

  // Estimate ID (must be from candidates)
  const estimateId = normalizeId(raw.estimate_id, validEstimateIds);

  // Confidence (clamped 0-1)
  const confidence = clampConfidence(raw.confidence);

  // Reason (truncated)
  const reason = normalizeReason(raw.reason);

  return {
    category,
    subcategory,
    projectId,
    estimateId,
    confidence,
    reason,
  };
}

// ── Normalizers ─────────────────────────────────────────────

function normalizeCategory(value: unknown): EmailClassification | null {
  if (typeof value !== "string") {
    return null;
  }
  const upper = value.trim().toUpperCase();
  if (VALID_CATEGORIES.has(upper)) {
    return upper as EmailClassification;
  }
  return null;
}

function normalizeSubcategory(value: unknown): TriageSubcategory | null {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const lower = value.trim().toLowerCase();
  if (VALID_SUBCATEGORIES.has(lower)) {
    return lower as TriageSubcategory;
  }
  return null;
}

function normalizeId(value: unknown, validIds: Set<number>): number | null {
  if (value == null) {
    return null;
  }
  const num = typeof value === "number" ? value : Number(value);
  if (!(Number.isFinite(num) && Number.isInteger(num))) {
    return null;
  }
  // LLM must pick from candidates only
  if (!validIds.has(num)) {
    return null;
  }
  return num;
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
  if (trimmed.length <= 200) {
    return trimmed;
  }
  return trimmed.slice(0, 200);
}
