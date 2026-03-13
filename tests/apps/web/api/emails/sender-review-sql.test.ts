import { describe, expect, test } from "bun:test";
import { buildSenderReviewSamplesQuery } from "@/api/emails/sender-review-sql";

describe("buildSenderReviewSamplesQuery", () => {
  test("builds placeholder params instead of binding a text array", () => {
    const result = buildSenderReviewSamplesQuery(["a.com", "b.com"]);

    expect(result.params).toEqual(["a.com", "b.com"]);
    expect(result.sql).toContain("VALUES ($1), ($2)");
    expect(result.sql).not.toContain("unnest($1::text[])");
  });

  test("returns null for an empty domain list", () => {
    expect(buildSenderReviewSamplesQuery([])).toBeNull();
  });
});
