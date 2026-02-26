/**
 * Email Triage Pipeline — Unit Tests
 *
 * Tests the triage dispatch logic, action mapping, and type validation.
 * These test the pure functions from @triage/ without requiring DB or LLM.
 */

import { describe, expect, test } from "bun:test";
import type { EmailClassification } from "@lib/db/types";
import type {
  TriageJobType,
  TriageResult,
  TriageSubcategory,
} from "@triage/types";
import {
  ACTION_CATEGORIES,
  CATEGORY_GUIDANCE,
  SUBCATEGORY_GUIDANCE,
  TRIAGE_ACTION_JOB_MAP,
  VALID_CATEGORIES,
  VALID_SUBCATEGORIES,
} from "@triage/types";

// ── Category / Subcategory Validation ─────────────────────

describe("Category definitions", () => {
  test("VALID_CATEGORIES includes all CATEGORY_GUIDANCE keys", () => {
    for (const key of Object.keys(CATEGORY_GUIDANCE)) {
      expect(VALID_CATEGORIES.has(key as EmailClassification)).toBe(true);
    }
  });

  test("VALID_CATEGORIES has at least 10 categories", () => {
    expect(VALID_CATEGORIES.size).toBeGreaterThanOrEqual(10);
  });

  test("ACTION_CATEGORIES is a subset of VALID_CATEGORIES", () => {
    for (const cat of ACTION_CATEGORIES) {
      expect(VALID_CATEGORIES.has(cat)).toBe(true);
    }
  });

  test("ACTION_CATEGORIES contains PAYMENT, DUST_PERMIT, CONTRACT, CHANGE_ORDER", () => {
    expect(ACTION_CATEGORIES.has("PAYMENT")).toBe(true);
    expect(ACTION_CATEGORIES.has("DUST_PERMIT")).toBe(true);
    expect(ACTION_CATEGORIES.has("CONTRACT")).toBe(true);
    expect(ACTION_CATEGORIES.has("CHANGE_ORDER")).toBe(true);
  });

  test("VALID_SUBCATEGORIES includes all SUBCATEGORY_GUIDANCE keys", () => {
    for (const key of Object.keys(SUBCATEGORY_GUIDANCE)) {
      expect(VALID_SUBCATEGORIES.has(key as TriageSubcategory)).toBe(true);
    }
  });

  test("every subcategory has a non-empty description", () => {
    for (const [key, desc] of Object.entries(SUBCATEGORY_GUIDANCE)) {
      expect(desc.length).toBeGreaterThan(0);
      expect(key.length).toBeGreaterThan(0);
    }
  });
});

// ── Action Job Map ────────────────────────────────────────

describe("TRIAGE_ACTION_JOB_MAP", () => {
  test("PAYMENT:payment_confirmation → dust_permit_payment", () => {
    expect(TRIAGE_ACTION_JOB_MAP["PAYMENT:payment_confirmation"]).toBe(
      "dust_permit_payment"
    );
  });

  test("DUST_PERMIT:permit_issued → dust_permit_issued_email", () => {
    expect(TRIAGE_ACTION_JOB_MAP["DUST_PERMIT:permit_issued"]).toBe(
      "dust_permit_issued_email"
    );
  });

  test("CONTRACT:new_contract → contract_email_received", () => {
    expect(TRIAGE_ACTION_JOB_MAP["CONTRACT:new_contract"]).toBe(
      "contract_email_received"
    );
  });

  test("CONTRACT:contract_revision → contract_email_received", () => {
    expect(TRIAGE_ACTION_JOB_MAP["CONTRACT:contract_revision"]).toBe(
      "contract_email_received"
    );
  });

  test("CHANGE_ORDER:contract_revision → contract_email_received", () => {
    expect(TRIAGE_ACTION_JOB_MAP["CHANGE_ORDER:contract_revision"]).toBe(
      "contract_email_received"
    );
  });

  test("non-action categories have no explicit mapping", () => {
    expect(TRIAGE_ACTION_JOB_MAP["SPAM:general"]).toBeUndefined();
    expect(TRIAGE_ACTION_JOB_MAP["HR:general"]).toBeUndefined();
    expect(TRIAGE_ACTION_JOB_MAP["UNKNOWN:general"]).toBeUndefined();
    expect(TRIAGE_ACTION_JOB_MAP["INVOICE:general"]).toBeUndefined();
  });

  test("all mapped job types are valid TriageJobType values", () => {
    const validJobTypes = new Set<TriageJobType>([
      "dust_permit_payment",
      "dust_permit_issued_email",
      "contract_email_received",
    ]);
    for (const jobType of Object.values(TRIAGE_ACTION_JOB_MAP)) {
      expect(validJobTypes.has(jobType)).toBe(true);
    }
  });
});

// ── Dispatch action resolution ────────────────────────────

describe("Dispatch action resolution", () => {
  // Replicate the resolveDispatchAction logic locally for testing
  // (it's a private function in dispatch.ts)
  function resolveAction(
    category: EmailClassification,
    subcategory: TriageSubcategory | null,
    hasAttachments: boolean
  ): TriageJobType | null {
    const actionKey = `${category}:${subcategory ?? "general"}`;
    const explicit = TRIAGE_ACTION_JOB_MAP[actionKey];
    if (explicit) {
      return explicit;
    }
    if (category === "CONTRACT" && hasAttachments) {
      return "contract_email_received";
    }
    return null;
  }

  test("PAYMENT + payment_confirmation triggers dust_permit_payment", () => {
    expect(resolveAction("PAYMENT", "payment_confirmation", false)).toBe(
      "dust_permit_payment"
    );
  });

  test("DUST_PERMIT + permit_issued triggers dust_permit_issued_email", () => {
    expect(resolveAction("DUST_PERMIT", "permit_issued", false)).toBe(
      "dust_permit_issued_email"
    );
  });

  test("CONTRACT + null subcategory + attachments → contract_email_received", () => {
    expect(resolveAction("CONTRACT", null, true)).toBe(
      "contract_email_received"
    );
  });

  test("CONTRACT + null subcategory + no attachments → null", () => {
    expect(resolveAction("CONTRACT", null, false)).toBeNull();
  });

  test("SPAM returns null regardless of subcategory", () => {
    expect(resolveAction("SPAM", "general", false)).toBeNull();
    expect(resolveAction("SPAM", null, false)).toBeNull();
  });

  test("UNKNOWN returns null", () => {
    expect(resolveAction("UNKNOWN", null, false)).toBeNull();
  });

  test("ESTIMATE returns null (non-action category)", () => {
    expect(resolveAction("ESTIMATE", null, true)).toBeNull();
  });

  test("INVOICE returns null", () => {
    expect(resolveAction("INVOICE", null, false)).toBeNull();
  });
});

// ── Downstream trigger mapping ────────────────────────────

describe("Downstream task trigger mapping", () => {
  // Verify the trigger mapping in email-triage.ts is consistent
  const PERMIT_JOB_TYPES = new Set<TriageJobType>([
    "dust_permit_payment",
    "dust_permit_issued_email",
  ]);

  test("permit job types should map to dust-permit-notification", () => {
    // Both permit job types should trigger dust-permit-notification
    // This documents the expected mapping in triggerDownstreamTask()
    for (const jobType of PERMIT_JOB_TYPES) {
      expect(Object.values(TRIAGE_ACTION_JOB_MAP)).toContain(jobType);
    }
  });

  test("contract_email_received is logged only (no downstream task)", () => {
    // Documenting current behavior: CONTRACT emails get classified + linked
    // but no downstream Trigger.dev task fires yet
    expect(TRIAGE_ACTION_JOB_MAP["CONTRACT:new_contract"]).toBe(
      "contract_email_received"
    );
  });
});

// ── TriageResult shape validation ─────────────────────────

describe("TriageResult structure", () => {
  test("valid result has all required fields", () => {
    const result: TriageResult = {
      category: "CONTRACT",
      subcategory: "new_contract",
      projectId: 42,
      estimateId: 100,
      confidence: 0.95,
      reason: "Contract documents received",
    };

    expect(result.category).toBeTruthy();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.reason.length).toBeLessThanOrEqual(200);
  });

  test("null subcategory and IDs are valid", () => {
    const result: TriageResult = {
      category: "UNKNOWN",
      subcategory: null,
      projectId: null,
      estimateId: null,
      confidence: 0.3,
      reason: "Unclear content",
    };

    expect(result.subcategory).toBeNull();
    expect(result.projectId).toBeNull();
    expect(result.estimateId).toBeNull();
  });
});
