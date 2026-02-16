import { describe, expect, test } from "bun:test";
import {
  classifyPermitIntentHeuristic,
  parseAttachmentNames,
} from "@/apps/background-jobs/lib/email-intent/permit-intent";
import { resolveFinalIntent } from "@/apps/background-jobs/lib/email-intent/permit-intent-report";
import type {
  PermitIntent,
  PermitIntentModelResult,
  PermitIntentRow,
} from "@/apps/background-jobs/lib/email-intent/permit-intent-types";

interface FixtureCase {
  id: string;
  fromEmail: string;
  fromDomain: string;
  subject: string;
  bodyPreview: string;
  attachmentNames?: string;
  expectedHeuristicIntent: PermitIntent;
  expectedHasPermitSignal: boolean;
}

interface FixtureFile {
  version: string;
  description: string;
  cases: FixtureCase[];
}

function toRow(row: FixtureCase, idx: number): PermitIntentRow {
  return {
    attachment_names: row.attachmentNames ?? null,
    body_preview: row.bodyPreview,
    classification: null,
    conversation_id: null,
    from_domain: row.fromDomain,
    from_email: row.fromEmail,
    id: idx + 1,
    project_id: null,
    received_at: "2026-02-13T00:00:00.000Z",
    subject: row.subject,
  };
}

const fixturePath = "tests/fixtures/email-intent/permit-intent-fixture.json";
const fixture = (await Bun.file(fixturePath).json()) as FixtureFile;

describe("permit intent heuristic fixture", () => {
  for (const [idx, row] of fixture.cases.entries()) {
    test(`classifies fixture case: ${row.id}`, () => {
      const result = classifyPermitIntentHeuristic(toRow(row, idx));
      expect(result.intent).toBe(row.expectedHeuristicIntent);
      expect(result.hasPermitSignal).toBe(row.expectedHasPermitSignal);
    });
  }
});

describe("permit intent final-intent guardrails", () => {
  test("does not allow model to downgrade permit-signaled rows to not_related", () => {
    const model: PermitIntentModelResult = {
      confidence: 0.99,
      intent: "not_related",
      needsHumanReview: false,
      reason: "irrelevant",
    };

    expect(resolveFinalIntent("request_status_update", model)).toBe(
      "request_status_update"
    );
  });

  test("keeps heuristic when model confidence is below threshold", () => {
    const model: PermitIntentModelResult = {
      confidence: 0.7,
      intent: "missing_info_or_correction",
      needsHumanReview: true,
      reason: "weak signal",
    };

    expect(resolveFinalIntent("request_document_copy", model)).toBe(
      "request_document_copy"
    );
  });

  test("allows high-confidence upgrade from other_permit_related", () => {
    const model: PermitIntentModelResult = {
      confidence: 0.93,
      intent: "action_request_start_or_file",
      needsHumanReview: false,
      reason: "start filing",
    };

    expect(resolveFinalIntent("other_permit_related", model)).toBe(
      "action_request_start_or_file"
    );
  });
});

describe("parseAttachmentNames", () => {
  test("parses JSON attachment array", () => {
    expect(parseAttachmentNames('["NOI.pdf","Dust Permit.pdf"]')).toEqual([
      "NOI.pdf",
      "Dust Permit.pdf",
    ]);
  });

  test("falls back to comma-delimited list", () => {
    expect(parseAttachmentNames("NOI.pdf, Dust Permit.pdf")).toEqual([
      "NOI.pdf",
      "Dust Permit.pdf",
    ]);
  });

  test("returns empty list for null", () => {
    expect(parseAttachmentNames(null)).toEqual([]);
  });
});
