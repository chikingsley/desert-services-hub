/**
 * Enforced email body policy for CLI-authored messages.
 *
 * Goals:
 * - Require HTML body input (no plain-text/markdown bodies)
 * - Block markdown-style bullets ("- item")
 * - Enforce canonical list markup with zero top/bottom margins
 * - Keep formatting predictable for Outlook rendering
 */

const HAS_HTML_TAG = /<[^>]+>/;
const MARKDOWN_BULLET_LINE = /^\s*-\s+\S+/m;
const P_TAG = /<\s*\/?\s*p\b/i;
const STRONG_TAG = /<\s*\/?\s*strong\b/i;
const LIST_OPEN_TAG = /<(ul|ol)\b[^>]*>/gi;
const INLINE_STYLE_ATTR = /\bstyle\s*=\s*["']([^"']*)["']/i;

/**
 * Normalize list tags so Outlook rendering has no extra vertical spacing.
 */
export function normalizeEmailBody(body: string): string {
  const normalizeListOpenTag = (tag: "ul" | "ol", input: string): string =>
    input.replaceAll(
      new RegExp(`<${tag}\\b[^>]*>`, "gi"),
      `<${tag} style="margin-top:0; margin-bottom:0;">`
    );

  let normalized = body;
  normalized = normalizeListOpenTag("ul", normalized);
  normalized = normalizeListOpenTag("ol", normalized);
  return normalized;
}

export function validateEmailBodyOrThrow(body: string): void {
  const errors: string[] = [];

  if (!HAS_HTML_TAG.test(body)) {
    errors.push(
      "Body must be HTML. Plain text/markdown bodies are not allowed."
    );
  }

  if (MARKDOWN_BULLET_LINE.test(body)) {
    errors.push(
      'Markdown bullets are not allowed ("- item"). Use native <ul>/<ol> lists.'
    );
  }

  // Every list open tag must use the canonical zero-margin style only.
  const listTags = body.match(LIST_OPEN_TAG) ?? [];
  for (const tag of listTags) {
    const styleMatch = tag.match(INLINE_STYLE_ATTR);
    if (!styleMatch) {
      errors.push(
        'List style is required on <ul>/<ol>. Use: style="margin-top:0; margin-bottom:0;"'
      );
      break;
    }

    const normalizedStyle = styleMatch[1]
      .replaceAll(/\s+/g, "")
      .replaceAll(/;$/g, "")
      .toLowerCase();
    if (normalizedStyle !== "margin-top:0;margin-bottom:0") {
      errors.push(
        'List style is restricted. Use exactly: style="margin-top:0; margin-bottom:0;"'
      );
      break;
    }
  }

  if (P_TAG.test(body)) {
    errors.push(
      "Do not use <p> tags. Use <div> lines for Outlook-safe spacing."
    );
  }

  if (STRONG_TAG.test(body)) {
    errors.push("Do not use <strong>. Use <b> for bold text.");
  }

  if (errors.length > 0) {
    throw new Error(`Email body policy failed:\n- ${errors.join("\n- ")}`);
  }
}
