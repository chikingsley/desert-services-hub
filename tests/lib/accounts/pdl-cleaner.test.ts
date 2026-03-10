import { describe, expect, test } from "bun:test";
import {
  buildCompanyCleanerInput,
  shouldAttemptPdlCompanyCleaner,
} from "@accounts/pdl-cleaner";

describe("buildCompanyCleanerInput", () => {
  test("uses website-only when the account name is low signal", () => {
    expect(
      buildCompanyCleanerInput({
        domain: "chasse.uscontracts",
        name: "Contracts",
      })
    ).toEqual({
      input: { website: "chasse.us" },
      repairedDomain: "chasse.us",
    });
  });

  test("uses both name and repaired website for good candidates", () => {
    expect(
      buildCompanyCleanerInput({
        domain: "willmeng.comreply",
        name: "Willmeng Construction",
      })
    ).toEqual({
      input: {
        name: "Willmeng Construction",
        website: "willmeng.com",
      },
      repairedDomain: "willmeng.com",
    });
  });
});

describe("shouldAttemptPdlCompanyCleaner", () => {
  test("skips monday-backed accounts by default", () => {
    expect(
      shouldAttemptPdlCompanyCleaner({
        id: 24,
        domain: "willmeng.com",
        mondayAccountId: "9470128033",
        name: "Willmeng Construction",
        pdlEnrichedAt: null,
      })
    ).toEqual({
      reason: "monday-backed",
      shouldAttempt: false,
    });
  });

  test("allows force to override monday-backed and already-enriched guards", () => {
    const decision = shouldAttemptPdlCompanyCleaner(
      {
        id: 118,
        domain: "embreegroup.com",
        mondayAccountId: "9470155820",
        name: "EMBREE CONSTRUCTION",
        pdlEnrichedAt: "2026-03-01T00:00:00.000Z",
      },
      { force: true }
    );

    expect(decision.shouldAttempt).toBe(true);
    if (decision.shouldAttempt) {
      expect(decision.input).toEqual({
        name: "EMBREE CONSTRUCTION",
        website: "embreegroup.com",
      });
    }
  });
});
