import { describe, expect, it } from "bun:test";
import {
  buildHintTokenSets,
  subjectMatchesHintTokenSets,
} from "@/packages/archive/email/project-subject-guard";

describe("project subject guard", () => {
  it("matches a subject when it overlaps a project hint", () => {
    const hints = buildHintTokenSets([
      "Muscular Moving Men - LGE Design Build",
      "Muscular Moving Men",
    ]);

    expect(
      subjectMatchesHintTokenSets(
        "RE: Muscular Moving Men Subcontract - Desert Services",
        hints
      )
    ).toBe(true);
  });

  it("rejects unrelated subjects", () => {
    const hints = buildHintTokenSets([
      "Muscular Moving Men - LGE Design Build",
    ]);

    expect(
      subjectMatchesHintTokenSets(
        "Re: International Furniture Direct Subcontract - Desert Services",
        hints
      )
    ).toBe(false);
  });

  it("returns false when only stop words are present", () => {
    const hints = buildHintTokenSets(["contract", "project", "dust permit"]);

    expect(subjectMatchesHintTokenSets("FW: Contract", hints)).toBe(false);
  });
});
