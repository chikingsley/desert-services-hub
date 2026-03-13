import { describe, expect, test } from "bun:test";
import {
  buildDomainClassifierPrompt,
  extractUsageFromMetadata,
  mapDomainVerdictToRule,
  SENDER_REVIEW_PROMPT_VERSION,
} from "@/api/emails/sender-review-llm";

describe("sender-review-llm", () => {
  test("builds a domain prompt with domain context and sample evidence", () => {
    const prompt = buildDomainClassifierPrompt({
      domain: "example.com",
      emailCount: 42,
      samples: [
        {
          from_email: "alerts@example.com",
          subject: "Project update",
          body_excerpt: "Dust permit update for jobsite A",
          received_at: "2026-03-10T00:00:00Z",
        },
      ],
    });

    expect(prompt).toContain(`"${SENDER_REVIEW_PROMPT_VERSION}"`);
    expect(prompt).toContain('domain "example.com"');
    expect(prompt).toContain("42 total emails");
    expect(prompt).toContain("Project update");
    expect(prompt).toContain("Dust permit update for jobsite A");
  });

  test("maps non-spam non-work verdicts to exclusion without inventing a classification", () => {
    expect(
      mapDomainVerdictToRule({
        category: "newsletter",
        isWorkRelated: false,
      })
    ).toEqual({
      classification: null,
      isExcluded: true,
    });
  });

  test("maps spam verdicts to spam exclusion", () => {
    expect(
      mapDomainVerdictToRule({
        category: "spam",
        isWorkRelated: false,
      })
    ).toEqual({
      classification: "SPAM",
      isExcluded: true,
    });
  });

  test("maps work-related verdicts to trusted keep behavior", () => {
    expect(
      mapDomainVerdictToRule({
        category: "work_related",
        isWorkRelated: true,
      })
    ).toEqual({
      classification: null,
      isExcluded: false,
    });
  });

  test("extracts token usage from chat metadata when available", () => {
    expect(
      extractUsageFromMetadata({
        usage: {
          prompt_tokens: 321,
          completion_tokens: 45,
          total_tokens: 366,
        },
      })
    ).toEqual({
      inputTokens: 321,
      outputTokens: 45,
      totalTokens: 366,
    });
  });

  test("returns null usage values when metadata has no usage payload", () => {
    expect(extractUsageFromMetadata({ attempted_order: ["openrouter"] })).toEqual({
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    });
  });
});
