import { describe, expect, test } from "bun:test";
import { BODY_LINK_MANUAL_FOLLOWUP_PAYLOAD_SCHEMA } from "@background-jobs/jobs/job-schemas";

describe("BODY_LINK_MANUAL_FOLLOWUP_PAYLOAD_SCHEMA", () => {
  test("accepts valid payload", () => {
    const parsed = BODY_LINK_MANUAL_FOLLOWUP_PAYLOAD_SCHEMA.safeParse({
      emailId: 101,
      mailboxEmail: "contracts@desertservices.net",
      reason: "Link is password protected",
      source: "egnyte",
      url: "https://mycon.egnyte.com/fl/abc",
    });

    expect(parsed.success).toBeTrue();
  });

  test("rejects unknown source value", () => {
    const parsed = BODY_LINK_MANUAL_FOLLOWUP_PAYLOAD_SCHEMA.safeParse({
      emailId: 101,
      mailboxEmail: "contracts@desertservices.net",
      reason: "Link is password protected",
      source: "docusign",
      url: "https://example.com/file",
    });

    expect(parsed.success).toBeFalse();
  });
});
