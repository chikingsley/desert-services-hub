/**
 * Integration tests using USE_TEST_MODE=true — exercises real handler
 * logic against mock data without hitting the Microsoft Graph API.
 *
 * Run with: USE_TEST_MODE=true bun test tests/mock-mode.test.ts
 */
import { describe, expect, test } from "bun:test";

// Only run if test mode is enabled
const isTestMode = process.env.USE_TEST_MODE === "true";

describe("mock mode — response shape", () => {
  test.skipIf(!isTestMode)("list-emails returns content array", async () => {
    const { handleListEmails } = await import("@outlook/email/list");
    const res = await handleListEmails({ folder: "inbox", count: 5 });
    expect(Array.isArray(res.content)).toBe(true);
    expect(res.content.length).toBeGreaterThan(0);
    expect(res.content[0].type).toBe("text");
    expect(typeof res.content[0].text).toBe("string");
    expect(res.isError).toBeUndefined();
  });

  test.skipIf(!isTestMode)("list-folders returns content array", async () => {
    const { default: handleListFolders } = await import("@outlook/folder/list");
    const res = await handleListFolders({});
    expect(Array.isArray(res.content)).toBe(true);
    expect(res.content[0].type).toBe("text");
    expect(res.isError).toBeUndefined();
  });
});

describe("mock mode — hint when not enabled", () => {
  test.skipIf(isTestMode)("skipped: re-run with USE_TEST_MODE=true", () => {
    // Placeholder so the suite isn't empty in normal mode
    expect(true).toBe(true);
  });
});
