import { describe, expect, test } from "bun:test";
import { extractFileLinks } from "@/apps/cf-workers/intake-worker/src/index";

describe("extractFileLinks", () => {
  test("extracts SharePoint colon-path links and trims trailing artifacts", () => {
    const html =
      '<a href="https://desertservices.sharepoint.com/:x:/r/sites/DataDrive/Shared%20Documents/Test.zip?d=abc123&csf=1&web=1">file</a>)';

    const links = extractFileLinks(html, "");

    expect(links).toEqual([
      {
        source: "onedrive",
        url: "https://desertservices.sharepoint.com/:x:/r/sites/DataDrive/Shared%20Documents/Test.zip?d=abc123&csf=1&web=1",
      },
    ]);
  });

  test("extracts onedrive.live.com links", () => {
    const text =
      "Download here: https://onedrive.live.com/?cid=abc123&id=ABC123%211234&parId=ABC123%211000&o=OneUp";

    const links = extractFileLinks("", text);

    expect(links).toEqual([
      {
        source: "onedrive",
        url: "https://onedrive.live.com/?cid=abc123&id=ABC123%211234&parId=ABC123%211000&o=OneUp",
      },
    ]);
  });

  test("extracts guestaccess.aspx SharePoint links", () => {
    const text =
      "Link: https://desertservices.sharepoint.com/sites/DataDrive/_layouts/15/guestaccess.aspx?share=abc123";

    const links = extractFileLinks("", text);

    expect(links).toEqual([
      {
        source: "onedrive",
        url: "https://desertservices.sharepoint.com/sites/DataDrive/_layouts/15/guestaccess.aspx?share=abc123",
      },
    ]);
  });

  test("deduplicates links found in html and text", () => {
    const url =
      "https://desertservices.sharepoint.com/:x:/r/sites/DataDrive/Shared%20Documents/Test.zip?d=abc123&csf=1&web=1";

    const links = extractFileLinks(`<a href="${url}">file</a>`, `same ${url}`);

    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({ source: "onedrive", url });
  });

  test("keeps Egnyte and Dropbox extraction unchanged", () => {
    const text =
      "egnyte https://example.egnyte.com/fl/abc123 dropbox https://www.dropbox.com/scl/fi/abc123/my-file.pdf?dl=0";

    const links = extractFileLinks("", text);

    expect(links).toEqual([
      { source: "egnyte", url: "https://example.egnyte.com/fl/abc123" },
      {
        source: "dropbox",
        url: "https://www.dropbox.com/scl/fi/abc123/my-file.pdf?dl=0",
      },
    ]);
  });
});
