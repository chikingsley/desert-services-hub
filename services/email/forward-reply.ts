/**
 * Forward Reply Utility
 *
 * Parses forwarded emails and constructs "reply" emails that appear
 * to be replies to the original message.
 *
 * Use case: When you receive a forwarded email and want to reply
 * as if you were on the original thread.
 */

export interface ParsedForward {
  originalFrom: { email: string; name?: string } | null;
  originalTo: Array<{ email: string; name?: string }>;
  originalCc: Array<{ email: string; name?: string }>;
  originalSubject: string | null;
  originalDate: string | null;
  originalBody: string;
  forwardedByBody: string; // Any content added by the forwarder before the forward block
}

// ============================================================================
// Regex Patterns (module-level for performance)
// ============================================================================

const RE_HEADER_SEPARATOR = /[;,]/;
const RE_NAMED_EMAIL = /^(.+?)\s*<([^>]+)>$/;
const RE_QUOTE_STRIP = /^["']|["']$/g;
const RE_PLAIN_EMAIL = /^[\w.-]+@[\w.-]+\.\w+$/;
const RE_ANY_EMAIL = /([\w.-]+@[\w.-]+\.\w+)/;
const RE_DIV_REPLY = /<\/div><div>/i;
const RE_HR_TAG = /^(.*?)<hr/is;
const RE_DOUBLE_NEWLINE = /\n\n/;
const RE_OUTLOOK_HEADER =
  /^(From:\s*.+?\nSent:\s*.+?\nTo:\s*.+?(?:\nCc:\s*.+?)?\nSubject:\s*.+?)\n/im;
const RE_HTML_TAG = /<[^>]*>/g;
const RE_FORWARD_PREFIX = /^(FW|Fwd|FWD):\s*/i;
const RE_REPLY_PREFIX = /^(RE|Re):\s*/i;

export interface ReplyFromForwardOptions {
  /** The forwarded email body (HTML or text) */
  forwardedBody: string;
  /** Your reply content */
  replyContent: string;
  /** Your email address (to exclude from CC) */
  yourEmail: string;
  /** Also exclude the forwarder from recipients */
  forwarderEmail?: string;
  /** Additional emails to exclude from recipients */
  excludeEmails?: string[];
  /** Include original To recipients in CC (default: true) */
  includeOriginalTo?: boolean;
}

export interface ConstructedReply {
  to: Array<{ email: string; name?: string }>;
  cc: Array<{ email: string; name?: string }>;
  subject: string;
  /** Combined body (reply + quoted) - use replyBody/quotedContent for proper signature placement */
  body: string;
  bodyType: "html";
  /** Just the reply content (before signature) */
  replyBody: string;
  /** The quoted original message (after signature) */
  quotedContent: string;
}

// Patterns for detecting forwarded message headers (plain text)
const OUTLOOK_FORWARD_PATTERNS = {
  // Outlook: "From: Name <email>" or "From: email"
  from: /^From:\s*(?:([^<\n]+?)\s*<([^>\n]+)>|([^\n<]+))$/im,
  // Outlook: "Sent: Monday, January 13, 2025 10:30 AM"
  sent: /^Sent:\s*(.+)$/im,
  // Outlook: "To: Name <email>; Name2 <email2>" or just emails
  to: /^To:\s*(.+)$/im,
  // Outlook: "Cc: Name <email>; Name2 <email2>"
  cc: /^Cc:\s*(.+)$/im,
  // Outlook: "Subject: Re: Something"
  subject: /^Subject:\s*(.+)$/im,
};

// Patterns for HTML forwarded emails (Outlook style with <b>From:</b>)
const HTML_FORWARD_PATTERNS = {
  // <b>From:</b> Name &lt;email&gt;<br> or <b>From:</b> Name <email><br>
  from: /<b>From:<\/b>\s*(?:([^<&\n]+?)\s*(?:&lt;|<)([^>&\n]+)(?:&gt;|>)|([^<\n]+?))\s*<br/i,
  // <b>Sent:</b> Friday, January 16, 2026 8:34:20 PM<br>
  sent: /<b>Sent:<\/b>\s*([^<]+?)\s*<br/i,
  // <b>To:</b> Name &lt;email&gt;; Name2 &lt;email2&gt;<br>
  to: /<b>To:<\/b>\s*([^<]*?(?:<[^>]*>[^<]*)*?)\s*<br/i,
  // <b>Cc:</b> ...
  cc: /<b>Cc:<\/b>\s*([^<]*?(?:<[^>]*>[^<]*)*?)\s*<br/i,
  // <b>Subject:</b> Subject text</font>
  subject: /<b>Subject:<\/b>\s*([^<]+?)(?:<\/font>|<br|<div)/i,
};

const GMAIL_FORWARD_MARKER = /^-{5,}\s*Forwarded message\s*-{5,}$/im;

const GMAIL_FORWARD_PATTERNS = {
  from: /^From:\s*(?:([^<\n]+?)\s*<([^>\n]+)>|([^\n<]+))$/im,
  date: /^Date:\s*(.+)$/im,
  to: /^To:\s*(.+)$/im,
  cc: /^Cc:\s*(.+)$/im,
  subject: /^Subject:\s*(.+)$/im,
};

/**
 * Parse email addresses from a header line
 * Handles formats like:
 * - "Name <email@example.com>"
 * - "email@example.com"
 * - "Name <email@example.com>; Name2 <email2@example.com>"
 * - "Name <email@example.com>, Name2 <email2@example.com>"
 */
function parseEmailAddresses(
  headerValue: string
): Array<{ email: string; name?: string }> {
  const results: Array<{ email: string; name?: string }> = [];

  // Split by semicolon or comma (common separators)
  const parts = headerValue.split(RE_HEADER_SEPARATOR).map((p) => p.trim());

  for (const part of parts) {
    if (part.length === 0) {
      continue;
    }

    // Try "Name <email>" format
    const namedMatch = part.match(RE_NAMED_EMAIL);
    if (namedMatch?.[1] && namedMatch[2]) {
      results.push({
        name: namedMatch[1].trim().replace(RE_QUOTE_STRIP, ""),
        email: namedMatch[2].trim().toLowerCase(),
      });
      continue;
    }

    // Try plain email format
    const emailMatch = part.match(RE_PLAIN_EMAIL);
    if (emailMatch) {
      results.push({ email: part.toLowerCase() });
      continue;
    }

    // Try to extract email from anywhere in the string
    const anyEmailMatch = part.match(RE_ANY_EMAIL);
    if (anyEmailMatch?.[1]) {
      results.push({ email: anyEmailMatch[1].toLowerCase() });
    }
  }

  return results;
}

/**
 * Convert HTML to plain text (basic)
 */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(RE_HTML_TAG, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Parse HTML entities to text
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"');
}

/**
 * Parse a forwarded email to extract original message details
 */
export function parseForwardedEmail(body: string): ParsedForward {
  const result: ParsedForward = {
    originalFrom: null,
    originalTo: [],
    originalCc: [],
    originalSubject: null,
    originalDate: null,
    originalBody: "",
    forwardedByBody: "",
  };

  const isHtml = body.includes("<b>From:</b>") || body.includes("<b>Sent:</b>");

  // Try HTML parsing first for Outlook HTML forwards
  if (isHtml) {
    // Parse using HTML patterns
    const fromMatch = body.match(HTML_FORWARD_PATTERNS.from);
    if (fromMatch) {
      if (fromMatch[1] && fromMatch[2]) {
        result.originalFrom = {
          name: decodeHtmlEntities(fromMatch[1].trim()),
          email: decodeHtmlEntities(fromMatch[2].trim()).toLowerCase(),
        };
      } else if (fromMatch[3]) {
        const email = decodeHtmlEntities(fromMatch[3].trim()).toLowerCase();
        if (email.includes("@")) {
          result.originalFrom = { email };
        }
      }
    }

    const sentMatch = body.match(HTML_FORWARD_PATTERNS.sent);
    if (sentMatch?.[1]) {
      result.originalDate = decodeHtmlEntities(sentMatch[1].trim());
    }

    const toMatch = body.match(HTML_FORWARD_PATTERNS.to);
    if (toMatch?.[1]) {
      const toText = decodeHtmlEntities(toMatch[1].replace(RE_HTML_TAG, ""));
      result.originalTo = parseEmailAddresses(toText);
    }

    const ccMatch = body.match(HTML_FORWARD_PATTERNS.cc);
    if (ccMatch?.[1]) {
      const ccText = decodeHtmlEntities(ccMatch[1].replace(RE_HTML_TAG, ""));
      result.originalCc = parseEmailAddresses(ccText);
    }

    const subjectMatch = body.match(HTML_FORWARD_PATTERNS.subject);
    if (subjectMatch?.[1]) {
      result.originalSubject = decodeHtmlEntities(subjectMatch[1].trim());
    }

    // Extract body after the forward header block
    const divRplyMatch = body.match(RE_DIV_REPLY);
    if (divRplyMatch) {
      const afterHeaders = body.slice(
        body.indexOf(divRplyMatch[0]) + divRplyMatch[0].length
      );
      result.originalBody = htmlToText(afterHeaders);
    } else {
      result.originalBody = htmlToText(body);
    }

    // Extract pre-forward content (comment added by forwarder)
    const hrMatch = body.match(RE_HR_TAG);
    if (hrMatch?.[1]) {
      result.forwardedByBody = htmlToText(hrMatch[1]);
    }

    return result;
  }

  // Fall back to plain text parsing
  const textBody = body.includes("<") ? htmlToText(body) : body;

  // Check for Gmail-style forward marker
  const gmailMarkerMatch = textBody.match(GMAIL_FORWARD_MARKER);

  let headerSection: string;
  let bodySection: string;
  let preForwardContent = "";

  if (gmailMarkerMatch) {
    // Gmail format: split at the marker
    const markerIndex = textBody.indexOf(gmailMarkerMatch[0]);
    preForwardContent = textBody.slice(0, markerIndex).trim();
    const afterMarker = textBody.slice(
      markerIndex + gmailMarkerMatch[0].length
    );

    // Find where headers end and body begins (double newline)
    const headerEndMatch = afterMarker.match(RE_DOUBLE_NEWLINE);
    if (headerEndMatch) {
      headerSection = afterMarker.slice(0, headerEndMatch.index);
      bodySection = afterMarker.slice(
        (headerEndMatch.index ?? 0) + headerEndMatch[0].length
      );
    } else {
      headerSection = afterMarker;
      bodySection = "";
    }
  } else {
    // Outlook format: look for "From:" followed by "Sent:" pattern
    const outlookHeaderMatch = textBody.match(RE_OUTLOOK_HEADER);

    if (outlookHeaderMatch?.[1]) {
      const headerStart = textBody.indexOf(outlookHeaderMatch[0]);
      preForwardContent = textBody.slice(0, headerStart).trim();
      headerSection = outlookHeaderMatch[1];
      bodySection = textBody.slice(headerStart + outlookHeaderMatch[0].length);
    } else {
      // Couldn't parse - return the whole thing as body
      result.originalBody = textBody;
      return result;
    }
  }

  result.forwardedByBody = preForwardContent;

  // Parse headers
  const patterns = gmailMarkerMatch
    ? GMAIL_FORWARD_PATTERNS
    : OUTLOOK_FORWARD_PATTERNS;

  // From
  const fromMatch = headerSection.match(patterns.from);
  if (fromMatch) {
    if (fromMatch[1] && fromMatch[2]) {
      // "Name <email>" format
      result.originalFrom = {
        name: fromMatch[1].trim(),
        email: fromMatch[2].trim().toLowerCase(),
      };
    } else {
      // Plain email
      const email = (fromMatch[3] || fromMatch[1] || "").trim().toLowerCase();
      if (email.includes("@")) {
        result.originalFrom = { email };
      }
    }
  }

  // Date/Sent
  const datePattern = gmailMarkerMatch
    ? GMAIL_FORWARD_PATTERNS.date
    : OUTLOOK_FORWARD_PATTERNS.sent;
  const dateMatch = headerSection.match(datePattern);
  if (dateMatch?.[1]) {
    result.originalDate = dateMatch[1].trim();
  }

  // To
  const toMatch = headerSection.match(patterns.to);
  if (toMatch?.[1]) {
    result.originalTo = parseEmailAddresses(toMatch[1]);
  }

  // CC
  const ccMatch = headerSection.match(patterns.cc);
  if (ccMatch?.[1]) {
    result.originalCc = parseEmailAddresses(ccMatch[1]);
  }

  // Subject
  const subjectMatch = headerSection.match(patterns.subject);
  if (subjectMatch?.[1]) {
    result.originalSubject = subjectMatch[1].trim();
  }

  // Body
  result.originalBody = bodySection.trim();

  return result;
}

/**
 * Clean up a subject line - remove FW:/Fwd: prefixes and ensure RE: prefix
 */
function cleanSubject(subject: string | null): string {
  if (subject === null) {
    return "RE: (no subject)";
  }

  // Remove forward prefixes
  const cleaned = subject
    .replace(RE_FORWARD_PREFIX, "")
    .replace(RE_REPLY_PREFIX, "")
    .trim();

  // Add RE: prefix
  return `RE: ${cleaned}`;
}

/**
 * Build a quoted block from the original message
 */
function _buildQuotedBlock(parsed: ParsedForward): string {
  const lines: string[] = [];

  lines.push("");
  lines.push("---");
  lines.push("");

  if (parsed.originalFrom) {
    const fromDisplay = parsed.originalFrom.name
      ? `${parsed.originalFrom.name} <${parsed.originalFrom.email}>`
      : parsed.originalFrom.email;
    lines.push(`> From: ${fromDisplay}`);
  }

  if (parsed.originalDate) {
    lines.push(`> Sent: ${parsed.originalDate}`);
  }

  if (parsed.originalTo.length > 0) {
    const toDisplay = parsed.originalTo
      .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
      .join("; ");
    lines.push(`> To: ${toDisplay}`);
  }

  if (parsed.originalCc.length > 0) {
    const ccDisplay = parsed.originalCc
      .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
      .join("; ");
    lines.push(`> Cc: ${ccDisplay}`);
  }

  if (parsed.originalSubject) {
    lines.push(`> Subject: ${parsed.originalSubject}`);
  }

  lines.push(">");

  // Quote the original body
  const bodyLines = parsed.originalBody.split("\n");
  for (const line of bodyLines) {
    lines.push(`> ${line}`);
  }

  return lines.join("\n");
}

/**
 * Build HTML quoted block
 */
function buildQuotedBlockHtml(parsed: ParsedForward): string {
  const parts: string[] = [];

  parts.push(
    '<div style="border-left: 2px solid #ccc; padding-left: 10px; margin-top: 20px; color: #666;">'
  );

  if (parsed.originalFrom) {
    const fromDisplay = parsed.originalFrom.name
      ? `${parsed.originalFrom.name} &lt;${parsed.originalFrom.email}&gt;`
      : parsed.originalFrom.email;
    parts.push(`<div><strong>From:</strong> ${fromDisplay}</div>`);
  }

  if (parsed.originalDate) {
    parts.push(`<div><strong>Sent:</strong> ${parsed.originalDate}</div>`);
  }

  if (parsed.originalTo.length > 0) {
    const toDisplay = parsed.originalTo
      .map((r) => (r.name ? `${r.name} &lt;${r.email}&gt;` : r.email))
      .join("; ");
    parts.push(`<div><strong>To:</strong> ${toDisplay}</div>`);
  }

  if (parsed.originalCc.length > 0) {
    const ccDisplay = parsed.originalCc
      .map((r) => (r.name ? `${r.name} &lt;${r.email}&gt;` : r.email))
      .join("; ");
    parts.push(`<div><strong>Cc:</strong> ${ccDisplay}</div>`);
  }

  if (parsed.originalSubject) {
    parts.push(
      `<div><strong>Subject:</strong> ${parsed.originalSubject}</div>`
    );
  }

  parts.push("<br>");

  // Add the original body
  const bodyHtml = parsed.originalBody
    .split("\n")
    .map((line) => `<div>${line || "&nbsp;"}</div>`)
    .join("");
  parts.push(bodyHtml);

  parts.push("</div>");

  return parts.join("\n");
}

/**
 * Construct a reply email from a forwarded message
 *
 * Returns separate replyBody and quotedContent so the caller can insert
 * a signature between them.
 */
export function constructReplyFromForward(
  options: ReplyFromForwardOptions
): ConstructedReply {
  const parsed = parseForwardedEmail(options.forwardedBody);

  // Build recipient lists
  const excludeSet = new Set<string>([
    options.yourEmail.toLowerCase(),
    ...(options.excludeEmails || []).map((e) => e.toLowerCase()),
  ]);

  if (options.forwarderEmail) {
    excludeSet.add(options.forwarderEmail.toLowerCase());
  }

  // To: original sender
  const to: Array<{ email: string; name?: string }> = [];
  if (parsed.originalFrom && !excludeSet.has(parsed.originalFrom.email)) {
    to.push(parsed.originalFrom);
  }

  // CC: original To + original CC (minus exclusions)
  const cc: Array<{ email: string; name?: string }> = [];

  if (options.includeOriginalTo !== false) {
    for (const recipient of parsed.originalTo) {
      if (!excludeSet.has(recipient.email)) {
        cc.push(recipient);
      }
    }
  }

  for (const recipient of parsed.originalCc) {
    if (!excludeSet.has(recipient.email)) {
      cc.push(recipient);
    }
  }

  // Subject
  const subject = cleanSubject(parsed.originalSubject);

  // Build quoted block
  const quotedBlock = buildQuotedBlockHtml(parsed);

  // Wrap reply content in HTML if it's not already
  const replyHtml = options.replyContent.includes("<")
    ? options.replyContent
    : options.replyContent
        .split("\n")
        .map((line) => `<div>${line || "<br>"}</div>`)
        .join("\n");

  // Combined body (for backwards compatibility) - but caller should use
  // replyBody + signature + quotedContent for proper ordering
  const body = `${replyHtml}\n${quotedBlock}`;

  return {
    to,
    cc,
    subject,
    body,
    bodyType: "html",
    replyBody: replyHtml,
    quotedContent: quotedBlock,
  };
}

/**
 * Parse and preview what the reply would look like (for testing)
 */
export function previewReplyFromForward(options: ReplyFromForwardOptions): {
  parsed: ParsedForward;
  reply: ConstructedReply;
} {
  const parsed = parseForwardedEmail(options.forwardedBody);
  const reply = constructReplyFromForward(options);
  return { parsed, reply };
}
