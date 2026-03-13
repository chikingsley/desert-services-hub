import { beforeEach, describe, expect, mock, test } from "bun:test";

const state: {
  calls: { prompt: string; provider: string }[];
  response: {
    data: Record<string, unknown>;
    metadata: Record<string, unknown>;
    model: string;
    processing_time_ms?: number;
  };
} = {
  calls: [],
  response: {
    data: {},
    metadata: {},
    model: "test-model",
  },
};

mock.module("@documents-intake/pdf-analysis", () => ({
  chat: async (prompt: string, provider: string) => {
    state.calls.push({ prompt, provider });
    return state.response;
  },
}));

const { extractRealSenderWithLlm } = await import("@email/enrichment");

describe("extractRealSenderWithLlm", () => {
  beforeEach(() => {
    state.calls = [];
    state.response = {
      data: {},
      metadata: {},
      model: "test-model",
    };
  });

  test("uses openrouter for platform sender extraction", async () => {
    state.response = {
      data: {
        personName: "Drew Butler",
        personEmail: "dbutler@willmeng.com",
        companyName: "Willmeng Construction",
        companyDomain: "willmeng.com",
        confidence: 0.98,
        reason: "Sender details listed in message footer",
      },
      metadata: {},
      model: "test-model",
    };

    const result = await extractRealSenderWithLlm(
      "buildingconnected.com",
      "Drew Butler (Willmeng Construction)",
      "Sender Details Drew Butler Pre-Lease Estimator dbutler@willmeng.comWillmeng Construction",
      "Completed Offsite Work Files Uploaded"
    );

    expect(result).toEqual({
      platformName: "BuildingConnected",
      realSenderName: "Drew Butler",
      realSenderEmail: "dbutler@willmeng.com",
      realSenderDomain: "willmeng.com",
      realSenderCompany: "Willmeng Construction",
    });
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]?.provider).toBe("openrouter");
  });

  test("returns null for non-platform domains without calling llm", async () => {
    const result = await extractRealSenderWithLlm(
      "willmeng.com",
      "Drew Butler",
      "Normal email body",
      "Project update"
    );

    expect(result).toBeNull();
    expect(state.calls).toHaveLength(0);
  });

  test("rejects malformed llm output", async () => {
    state.response = {
      data: {
        personName: "Drew Butler",
        personEmail: "dbutler@willmeng.comWillmeng",
        companyName: "Willmeng Construction",
        companyDomain: "willmeng.comwillmeng",
        confidence: 0.92,
        reason: "bad output",
      },
      metadata: {},
      model: "test-model",
    };

    const result = await extractRealSenderWithLlm(
      "buildingconnected.com",
      "Drew Butler (Willmeng Construction)",
      "Sender Details Drew Butler Pre-Lease Estimator dbutler@willmeng.comWillmeng Construction",
      "Completed Offsite Work Files Uploaded"
    );

    expect(result).toBeNull();
    expect(state.calls).toHaveLength(1);
  });
});
