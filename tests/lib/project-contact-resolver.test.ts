import { describe, expect, test } from "bun:test";
import {
  extractEmailAddresses,
  extractPhoneNumbers,
  normalizeEmailAddress,
  parseEmailAddressList,
} from "@background-jobs/lib/project-contact-resolver";

describe("project-contact-resolver helpers", () => {
  test("normalizeEmailAddress lowercases and strips angle brackets", () => {
    expect(normalizeEmailAddress("<John.Doe@Example.com>")).toBe(
      "john.doe@example.com"
    );
  });

  test("parseEmailAddressList parses JSON arrays", () => {
    expect(
      parseEmailAddressList('["One@Example.com", "two@example.com"]')
    ).toEqual(["one@example.com", "two@example.com"]);
  });

  test("parseEmailAddressList parses comma list fallback", () => {
    expect(parseEmailAddressList("one@example.com, two@example.com")).toEqual([
      "one@example.com",
      "two@example.com",
    ]);
  });

  test("extractEmailAddresses finds deduplicated emails from free text", () => {
    const text =
      "PM: John Doe <john@example.com> and billing@example.com then JOHN@example.com";

    expect(extractEmailAddresses(text)).toEqual([
      "john@example.com",
      "billing@example.com",
    ]);
  });

  test("extractPhoneNumbers returns normalized 10-digit values", () => {
    const text = "Call (602) 555-1234 or +1 623.444.7788 today.";

    expect(extractPhoneNumbers(text)).toEqual(["6025551234", "6234447788"]);
  });
});
