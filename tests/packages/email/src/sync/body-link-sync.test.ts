import { describe, expect, it } from "bun:test";
import {
  deriveBodyLinkScanStatus,
  toManualFollowupPayloads,
} from "@email/sync/body-link-sync";

describe("deriveBodyLinkScanStatus", () => {
  it("returns no_links when nothing matched", () => {
    const status = deriveBodyLinkScanStatus({
      attachmentsInserted: 0,
      failures: [],
      linksFound: 0,
    });

    expect(status).toBe("no_links");
  });

  it("returns success when at least one attachment is inserted", () => {
    const status = deriveBodyLinkScanStatus({
      attachmentsInserted: 1,
      failures: [
        {
          error: "URL resolved to HTML page instead of downloadable file",
          source: "egnyte",
          url: "https://example.egnyte.com/fl/abc",
        },
      ],
      linksFound: 2,
    });

    expect(status).toBe("success");
  });

  it("returns gated when failures indicate password/captcha", () => {
    const status = deriveBodyLinkScanStatus({
      attachmentsInserted: 0,
      failures: [
        {
          error: "Link is password protected and requires CAPTCHA",
          source: "egnyte",
          url: "https://example.egnyte.com/fl/abc",
        },
      ],
      linksFound: 1,
    });

    expect(status).toBe("gated");
  });

  it("returns failed for non-gated failures", () => {
    const status = deriveBodyLinkScanStatus({
      attachmentsInserted: 0,
      failures: [
        {
          error: "URL resolved to HTML page instead of downloadable file",
          source: "egnyte",
          url: "https://example.egnyte.com/fl/abc",
        },
      ],
      linksFound: 1,
    });

    expect(status).toBe("failed");
  });
});

describe("toManualFollowupPayloads", () => {
  it("maps only gated failures into queue payloads", () => {
    const payloads = toManualFollowupPayloads({
      emailId: 42,
      failures: [
        {
          error: "Link is password protected",
          source: "egnyte",
          url: "https://mycon.egnyte.com/fl/abc",
        },
        {
          error: "URL resolved to HTML page instead of downloadable file",
          source: "dropbox",
          url: "https://dropbox.com/s/abc",
        },
        {
          error: "Link requires CAPTCHA",
          source: "buildingconnected",
          url: "https://app.buildingconnected.com/goto/123",
        },
      ],
      mailboxEmail: "contracts@desertservices.net",
    });

    expect(payloads).toEqual([
      {
        emailId: 42,
        mailboxEmail: "contracts@desertservices.net",
        reason: "Link is password protected",
        source: "egnyte",
        url: "https://mycon.egnyte.com/fl/abc",
      },
      {
        emailId: 42,
        mailboxEmail: "contracts@desertservices.net",
        reason: "Link requires CAPTCHA",
        source: "buildingconnected",
        url: "https://app.buildingconnected.com/goto/123",
      },
    ]);
  });
});
