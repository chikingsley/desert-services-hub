import { DESERT_SERVICES_LOGO_BASE64 } from "./desert-services-logo";

/** Escape special characters for safe HTML rendering */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Wrap HTML content in a full email document */
export function wrapHtml(content: string): string {
  return `<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body>${content}</body></html>`;
}

/** Standard Desert Services email signature (Chi) with inline logo */
export function signatureHtml(): string {
  return `<div><br></div>
<div>Best,</div>
<div>&mdash;</div>
<div><br></div>
<div><b>${escapeHtml("Chi Ejimofor")}</b></div>
<div>Project Coordinator</div>
<div>Desert Services LLC</div>
<div>E: <a href="mailto:chi@desertservices.net">chi@desertservices.net</a></div>
<div>O: (480) 513-8986</div>
<div><img src="cid:logo" alt="Desert Services LLC" width="264" style="max-width:100%"></div>`;
}

/**
 * Desert Services logo as an inline email attachment.
 * Use with Graph API's addFileAttachment — set contentId and isInline
 * so Outlook resolves the `cid:logo` reference in the signature.
 */
export const LOGO_ATTACHMENT = {
  contentBytesBase64: DESERT_SERVICES_LOGO_BASE64,
  contentId: "logo",
  contentType: "image/png",
  isInline: true,
  name: "desert-services-logo.png",
} as const;
