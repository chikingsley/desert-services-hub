import { describe, expect, test } from "bun:test";
import {
  formatWritableMailboxes,
  isWritableMailbox,
} from "@outlook/config/mailbox-permissions";

describe("isWritableMailbox", () => {
  test("allows permitted mailboxes", () => {
    expect(isWritableMailbox("contracts@desertservices.net")).toBe(true);
    expect(isWritableMailbox("chi@desertservices.net")).toBe(true);
    expect(isWritableMailbox("dustpermits@desertservices.net")).toBe(true);
  });

  test("is case-insensitive", () => {
    expect(isWritableMailbox("CHI@DESERTSERVICES.NET")).toBe(true);
    expect(isWritableMailbox("Chi@DesertServices.Net")).toBe(true);
    expect(isWritableMailbox("CONTRACTS@DESERTSERVICES.NET")).toBe(true);
  });

  test("blocks unlisted mailboxes", () => {
    expect(isWritableMailbox("random@desertservices.net")).toBe(false);
    expect(isWritableMailbox("info@desertservices.net")).toBe(false);
    expect(isWritableMailbox("attacker@evil.com")).toBe(false);
    expect(isWritableMailbox("")).toBe(false);
  });
});

describe("formatWritableMailboxes", () => {
  test("returns non-empty string", () => {
    const result = formatWritableMailboxes();
    expect(result.length).toBeGreaterThan(0);
  });

  test("includes all permitted mailbox prefixes", () => {
    const result = formatWritableMailboxes();
    expect(result).toContain("contracts@");
    expect(result).toContain("chi@");
    expect(result).toContain("dustpermits@");
  });
});
