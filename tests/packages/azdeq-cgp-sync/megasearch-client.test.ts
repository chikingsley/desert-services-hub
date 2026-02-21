import { describe, expect, test } from "bun:test";
import { parseRetryAfterMs } from "../../../packages/azdeq-cgp-sync/src/megasearch-client";

describe("parseRetryAfterMs", () => {
  test("returns null when retry-after header is missing", () => {
    expect(parseRetryAfterMs({})).toBeNull();
  });

  test("parses numeric seconds value", () => {
    expect(parseRetryAfterMs({ "retry-after": "2" }, 0)).toBe(2000);
  });

  test("parses HTTP-date value", () => {
    const nowMs = Date.parse("2026-02-21T09:00:00Z");
    const retryAt = "Sat, 21 Feb 2026 09:00:03 GMT";
    expect(parseRetryAfterMs({ "retry-after": retryAt }, nowMs)).toBe(3000);
  });

  test("returns null for invalid retry-after value", () => {
    expect(parseRetryAfterMs({ "retry-after": "not-a-value" })).toBeNull();
  });
});
