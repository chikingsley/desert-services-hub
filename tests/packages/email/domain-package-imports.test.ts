import { describe, expect, test } from "bun:test";
import { shouldKeepDocumentLocalOnly } from "@email/sender-policy";
import { isSpam } from "@email/spam-filter";
import { extractDomain } from "@email/enrichment";
import {
  buildSinceFilter,
  resolveBackfillSinceIso,
} from "@email/sync";
import { parseEmailRow } from "@email/db/email";
import { getAllMailboxes, getMailbox } from "@email/db/mailbox";

describe("email domain package aliases", () => {
  test("preserves pure helpers through @email aliases", () => {
    expect(isSpam("marketing@sendgrid.net", "Hello").isSpam).toBe(true);
    expect(shouldKeepDocumentLocalOnly("HR")).toBe(true);
    expect(extractDomain("User@Example.com")).toBe("example.com");
  });

  test("exports sync helpers through @email/sync", () => {
    expect(typeof buildSinceFilter).toBe("function");
    expect(typeof resolveBackfillSinceIso).toBe("function");

    const sinceIso = buildSinceFilter(1);
    expect(Number.isFinite(Date.parse(sinceIso))).toBe(true);
  });

  test("exports db repositories through @email/db aliases", () => {
    expect(typeof parseEmailRow).toBe("function");
    expect(typeof getMailbox).toBe("function");
    expect(typeof getAllMailboxes).toBe("function");
  });
});
