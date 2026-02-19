import { describe, expect, test } from "bun:test";
import { extractBodyFileLinks } from "@email/sync/body-link-attachments";

describe("extractBodyFileLinks", () => {
  test("extracts OneDrive, Egnyte, Dropbox, and BuildingConnected links", () => {
    const html = `
      <a href="https://desertservices.sharepoint.com/:x:/r/sites/DataDrive/Shared%20Documents/Project/file.pdf?d=abc123&csf=1&web=1">OneDrive</a>
      <a href="https://example.egnyte.com/fl/abc123">Egnyte</a>
    `;
    const text =
      "Download: https://www.dropbox.com/scl/fi/abc123/my-file.pdf?dl=0 and https://app.buildingconnected.com/goto/abc123";

    const links = extractBodyFileLinks(html, text);

    expect(links).toEqual([
      {
        source: "onedrive",
        url: "https://desertservices.sharepoint.com/:x:/r/sites/DataDrive/Shared%20Documents/Project/file.pdf?d=abc123&csf=1&web=1",
      },
      { source: "egnyte", url: "https://example.egnyte.com/fl/abc123" },
      {
        source: "dropbox",
        url: "https://www.dropbox.com/scl/fi/abc123/my-file.pdf?dl=0",
      },
      {
        source: "buildingconnected",
        url: "https://app.buildingconnected.com/goto/abc123",
      },
    ]);
  });

  test("deduplicates identical links across html and text", () => {
    const url =
      "https://desertservices.sharepoint.com/:x:/r/sites/DataDrive/Shared%20Documents/Project/file.pdf?d=abc123&csf=1&web=1";

    const links = extractBodyFileLinks(`<a href="${url}">OneDrive</a>`, url);

    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({ source: "onedrive", url });
  });

  test("ignores DocuSign URLs and non-share OneDrive URLs", () => {
    const text = `
      https://www.docusign.com/privacy
      https://na3.docusign.net/Signing/EmailStart.aspx?a=abc123&etti=24
      https://desertservices.sharepoint.com/sites/DataDrive
      https://onedrive.live.com/?id=abc123
    `;

    const links = extractBodyFileLinks("", text);

    expect(links).toEqual([
      {
        source: "onedrive",
        url: "https://onedrive.live.com/?id=abc123",
      },
    ]);
  });

  test("keeps Dropbox folder links for zip download flow", () => {
    const text =
      "Folder: https://www.dropbox.com/scl/fo/abc123/my-folder?rlkey=xyz987&dl=0";

    const links = extractBodyFileLinks("", text);

    expect(links).toEqual([
      {
        source: "dropbox",
        url: "https://www.dropbox.com/scl/fo/abc123/my-folder?rlkey=xyz987&dl=0",
      },
    ]);
  });

  test("keeps all BuildingConnected goto links including state params", () => {
    const text = `
      https://app.buildingconnected.com/goto/abcd1234?foo=1
      https://app.buildingconnected.com/goto/efgh5678?state=archived
    `;

    const links = extractBodyFileLinks("", text);

    expect(links).toEqual([
      {
        source: "buildingconnected",
        url: "https://app.buildingconnected.com/goto/abcd1234?foo=1",
      },
      {
        source: "buildingconnected",
        url: "https://app.buildingconnected.com/goto/efgh5678?state=archived",
      },
    ]);
  });
});
