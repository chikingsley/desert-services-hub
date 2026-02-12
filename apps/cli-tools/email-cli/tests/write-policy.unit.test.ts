import { afterEach, describe, expect, it } from "bun:test";
import {
  assertSendEnabled,
  assertWritableMailbox,
  resolveWritableMailbox,
  WRITABLE_MAILBOXES,
} from "@email/commands/config";

const ORIGINAL_ENABLE_SEND = process.env.EMAIL_CLI_ENABLE_SEND;

afterEach(() => {
  process.env.EMAIL_CLI_ENABLE_SEND = ORIGINAL_ENABLE_SEND;
});

describe("email write policy", () => {
  it("requires explicit --user for write operations", () => {
    expect(() => assertWritableMailbox(undefined, "draft")).toThrow(
      "requires explicit --user"
    );
  });

  it("allows only the configured writable mailboxes", () => {
    for (const mailbox of WRITABLE_MAILBOXES) {
      expect(() => assertWritableMailbox(mailbox, "draft")).not.toThrow();
    }
  });

  it("rejects writes for non-allowlisted mailboxes", () => {
    expect(() =>
      assertWritableMailbox("estimating@desertservices.net", "draft")
    ).toThrow("not allowed on mailbox");
  });

  it("normalizes writable mailbox values", () => {
    const normalized = resolveWritableMailbox(
      "  CHI@DESERTSERVICES.NET ",
      "draft"
    );
    expect(normalized).toBe("chi@desertservices.net");
  });

  it("disables sending by default", () => {
    process.env.EMAIL_CLI_ENABLE_SEND = undefined;
    expect(() => assertSendEnabled("send")).toThrow("disabled by policy");
  });

  it("allows sending only when explicitly enabled", () => {
    process.env.EMAIL_CLI_ENABLE_SEND = "1";
    expect(() => assertSendEnabled("send")).not.toThrow();
  });
});
