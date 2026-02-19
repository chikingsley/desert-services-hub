const INLINE_IMAGE_PATTERNS = [
  /^image\d{3}\./i,
  /^Outlook-/i,
  /logo/i,
  /^icon/i,
  /^spacer\./i,
];

const NON_PROCESSABLE_CONTENT_TYPES = new Set([
  "text/calendar",
  "application/x-ms-wmz",
  "message/rfc822",
  "application/ics",
  "application/pkcs7-signature",
  "application/x-pkcs7-signature",
]);

export interface AttachmentSkipInput {
  contentType: string | null;
  fileName: string;
  size: number | null;
}

export function shouldSkipByContentType(contentType: string | null): boolean {
  const ct = contentType?.toLowerCase() ?? "";
  return NON_PROCESSABLE_CONTENT_TYPES.has(ct);
}

export function shouldSkipLikelyInlineImage(
  input: AttachmentSkipInput
): boolean {
  const ct = input.contentType?.toLowerCase() ?? "";
  if (!ct.startsWith("image/")) {
    return false;
  }

  if ((input.size ?? 0) < 50_000) {
    return true;
  }

  return INLINE_IMAGE_PATTERNS.some((pattern) => pattern.test(input.fileName));
}

export function shouldSkipAttachment(input: AttachmentSkipInput): boolean {
  return (
    shouldSkipByContentType(input.contentType) ||
    shouldSkipLikelyInlineImage(input)
  );
}
