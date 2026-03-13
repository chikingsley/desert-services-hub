import { describe, expect, test } from "bun:test";

import {
  buildReplyAllDraftRecipients,
  buildReplyAllDraftRecipientsFromDraft,
  prependReplyDraftBodyHtml,
} from "../../../apps/trigger-dev/src/trigger/dust-permit-reply-values";

describe("dust permit reply recipient helpers", () => {
  test("builds reply-all recipients from the original email and extra cc", () => {
    const recipients = buildReplyAllDraftRecipients(
      {
        ccEmails: ["rick@desertservices.net", "tfyffe@stevensleinweber.com"],
        fromEmail: "aashton@stevensleinweber.com",
        toEmails: ["chi@desertservices.net", "contracts@desertservices.net"],
      },
      "chi@desertservices.net",
      undefined,
      ["jayson@desertservices.net"]
    );

    expect(recipients).toEqual({
      cc: [
        "rick@desertservices.net",
        "tfyffe@stevensleinweber.com",
        "contracts@desertservices.net",
        "jayson@desertservices.net",
      ],
      to: ["aashton@stevensleinweber.com"],
    });
  });

  test("dedupes and lets explicit recipients extend the to list", () => {
    const recipients = buildReplyAllDraftRecipients(
      {
        ccEmails: ["contracts@desertservices.net", "tFyffe@stevensleinweber.com"],
        fromEmail: "aashton@stevensleinweber.com",
        toEmails: ["chi@desertservices.net", "tfyffe@stevensleinweber.com"],
      },
      "chi@desertservices.net",
      ["tfyffe@stevensleinweber.com", "geo@indicapinc.com"],
      ["contracts@desertservices.net", "Geo@indicapinc.com"]
    );

    expect(recipients).toEqual({
      cc: ["contracts@desertservices.net"],
      to: [
        "aashton@stevensleinweber.com",
        "tfyffe@stevensleinweber.com",
        "geo@indicapinc.com",
      ],
    });
  });

  test("merges extra recipients onto the Graph-created reply-all draft recipients", () => {
    const recipients = buildReplyAllDraftRecipientsFromDraft(
      {
        ccEmails: ["jt@example.com", "chi@desertservices.net"],
        toEmails: ["amber@example.com", "chi@desertservices.net"],
      },
      "chi@desertservices.net",
      ["francine@desertservices.net"],
      ["jayson@desertservices.net", "amber@example.com"]
    );

    expect(recipients).toEqual({
      cc: ["jt@example.com", "jayson@desertservices.net"],
      to: ["amber@example.com", "francine@desertservices.net"],
    });
  });

  test("prepends permit content above the existing reply draft body", () => {
    const merged = prependReplyDraftBodyHtml(
      `<html><body><div>Dust permit issued.</div></body></html>`,
      `<html><body><div id="signature">Thanks,</div><div id="reply">From: Amber</div></body></html>`
    );

    expect(merged).toContain("<div>Dust permit issued.</div>");
    expect(merged).toContain('<div id="reply">From: Amber</div>');
    expect(merged.indexOf("Dust permit issued.")).toBeLessThan(
      merged.indexOf('id="reply"')
    );
    expect(merged).not.toContain("<body><html>");
  });
});
