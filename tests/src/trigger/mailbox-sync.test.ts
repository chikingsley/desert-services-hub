import { describe, expect, test } from "bun:test";
import { htmlToText } from "@/apps/trigger-dev/src/trigger/mailbox-sync";

describe("htmlToText", () => {
  test("preserves separators between adjacent HTML nodes", () => {
    const html =
      "<div>Drew Butler <a>dbutler@willmeng.com</a><span>Willmeng Construction</span></div>";

    expect(htmlToText(html)).toBe(
      "Drew Butler dbutler@willmeng.com Willmeng Construction"
    );
  });

  test("normalizes repeated whitespace and nbsp entities", () => {
    const html = "<p>Contracts&nbsp;<strong>contracts@constructable.pro</strong></p>";

    expect(htmlToText(html)).toBe("Contracts contracts@constructable.pro");
  });
});
