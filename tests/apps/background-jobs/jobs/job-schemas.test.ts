import { describe, expect, test } from "bun:test";
import {
  BODY_LINK_BACKFILL_PAYLOAD_SCHEMA,
  BODY_LINK_MANUAL_FOLLOWUP_PAYLOAD_SCHEMA,
} from "@background-jobs/jobs/job-schemas";

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

describe("BODY_LINK_BACKFILL_PAYLOAD_SCHEMA", () => {
  test("accepts valid payload", () => {
    const parsed = BODY_LINK_BACKFILL_PAYLOAD_SCHEMA.safeParse({
      enabled: true,
      limit: 300,
      lookbackDays: 180,
      mailbox: "contracts@desertservices.net",
      maxLinks: 20,
    });

    expect(parsed.success).toBeTrue();
  });

  test("rejects invalid limit", () => {
    const parsed = BODY_LINK_BACKFILL_PAYLOAD_SCHEMA.safeParse({
      limit: 0,
    });

    expect(parsed.success).toBeFalse();
  });
});
