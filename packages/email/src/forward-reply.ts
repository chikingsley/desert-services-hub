/**
 * Forward Reply Utility
 *
 * Parses forwarded emails and constructs "reply" emails that appear
 * to be replies to the original message.
 *
 * Use case: When you receive a forwarded email and want to reply
 * as if you were on the original thread.
 */

interface EmailContact {
  email: string;
  name?: string;
}

export interface ParsedForward {
  originalFrom: EmailContact | null;
  originalTo: EmailContact[];
  originalCc: EmailContact[];
  originalSubject: string | null;
  originalDate: string | null;
  originalBody: string;
  /** Content added by the forwarder before the forward block */
  forwardedByBody: string;
}

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
  to: EmailContact[];
  cc: EmailContact[];
  subject: string;
  /** Combined body (reply + quoted) - use replyBody/quotedContent for proper signature placement */
  body: string;
  bodyType: "html";
  /** Just the reply content (before signature) */
  replyBody: string;
  /** The quoted original message (after signature) */
  quotedContent: string;
}

// -- Regex patterns (module-level for performance) --

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

// -- Forward header patterns by email client --

const OUTLOOK_FORWARD_PATTERNS = {
  from: /^From:\s*(?:([^<\n]+?)\s*<([^>\n]+)>|([^\n<]+))$/im,
  sent: /^Sent:\s*(.+)$/im,
  to: /^To:\s*(.+)$/im,
  cc: /^Cc:\s*(.+)$/im,
  subject: /^Subject:\s*(.+)$/im,
};

const HTML_FORWARD_PATTERNS = {
  from: /<b>From:<\/b>\s*(?:([^<&\n]+?)\s*(?:&lt;|<)([^>&\n]+)(?:&gt;|>)|([^<\n]+?))\s*<br/i,
  sent: /<b>Sent:<\/b>\s*([^<]+?)\s*<br/i,
  to: /<b>To:<\/b>\s*([^<]*?(?:<[^>]*>[^<]*)*?)\s*<br/i,
  cc: /<b>Cc:<\/b>\s*([^<]*?(?:<[^>]*>[^<]*)*?)\s*<br/i,
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

// -- Shared HTML entity map --

const HTML_ENTITIES: [RegExp, string][] = [
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&amp;/g, "&"],
  [/&nbsp;/g, " "],
  [/&quot;/g, '"'],
];

function decodeHtmlEntities(text: string): string {
  let result = text;
  for (const [pattern, replacement] of HTML_ENTITIES) {
    result = result.replaceAll(pattern, replacement);
  }
  return result;
}

function htmlToText(html: string): string {
  const withNewlines = html
    .replaceAll(/<br\s*\/?>/gi, "\n")
    .replaceAll(/<\/div>/gi, "\n")
    .replaceAll(/<\/p>/gi, "\n\n")
    .replace(RE_HTML_TAG, "");

  return decodeHtmlEntities(withNewlines)
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

// -- Email address parsing --

function parseEmailAddresses(headerValue: string): EmailContact[] {
  const results: EmailContact[] = [];
  const parts = headerValue.split(RE_HEADER_SEPARATOR).map((p) => p.trim());

  for (const part of parts) {
    if (part.length === 0) {
      continue;
    }

    const namedMatch = part.match(RE_NAMED_EMAIL);
    if (namedMatch?.[1] && namedMatch[2]) {
      results.push({
        email: namedMatch[2].trim().toLowerCase(),
        name: namedMatch[1].trim().replace(RE_QUOTE_STRIP, ""),
      });
      continue;
    }

    if (RE_PLAIN_EMAIL.test(part)) {
      results.push({ email: part.toLowerCase() });
      continue;
    }

    const anyEmailMatch = part.match(RE_ANY_EMAIL);
    if (anyEmailMatch?.[1]) {
      results.push({ email: anyEmailMatch[1].toLowerCase() });
    }
  }

  return results;
}

/**
 * Extract a sender from a regex match with named/plain email capture groups.
 * Groups: [1] = name, [2] = email (named format), [3] = plain email fallback.
 */
function extractFromMatch(
  match: RegExpMatchArray,
  decode: (s: string) => string = (s) => s
): EmailContact | null {
  if (match[1] && match[2]) {
    return {
      email: decode(match[2].trim()).toLowerCase(),
      name: decode(match[1].trim()),
    };
  }

  const raw = (match[3] || match[1] || "").trim();
  const email = decode(raw).toLowerCase();
  return email.includes("@") ? { email } : null;
}

// -- Forward email parsing --

function parseHtmlForward(body: string): ParsedForward {
  const result = emptyParsedForward();

  const fromMatch = body.match(HTML_FORWARD_PATTERNS.from);
  if (fromMatch) {
    result.originalFrom = extractFromMatch(fromMatch, decodeHtmlEntities);
  }

  const sentMatch = body.match(HTML_FORWARD_PATTERNS.sent);
  if (sentMatch?.[1]) {
    result.originalDate = decodeHtmlEntities(sentMatch[1].trim());
  }

  const toMatch = body.match(HTML_FORWARD_PATTERNS.to);
  if (toMatch?.[1]) {
    result.originalTo = parseEmailAddresses(
      decodeHtmlEntities(toMatch[1].replace(RE_HTML_TAG, ""))
    );
  }

  const ccMatch = body.match(HTML_FORWARD_PATTERNS.cc);
  if (ccMatch?.[1]) {
    result.originalCc = parseEmailAddresses(
      decodeHtmlEntities(ccMatch[1].replace(RE_HTML_TAG, ""))
    );
  }

  const subjectMatch = body.match(HTML_FORWARD_PATTERNS.subject);
  if (subjectMatch?.[1]) {
    result.originalSubject = decodeHtmlEntities(subjectMatch[1].trim());
  }

  // Extract body after the forward header block
  const divReplyMatch = body.match(RE_DIV_REPLY);
  if (divReplyMatch) {
    const afterHeaders = body.slice(
      body.indexOf(divReplyMatch[0]) + divReplyMatch[0].length
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

function parsePlainTextForward(body: string): ParsedForward {
  const result = emptyParsedForward();
  const textBody = body.includes("<") ? htmlToText(body) : body;

  const gmailMarkerMatch = textBody.match(GMAIL_FORWARD_MARKER);

  let headerSection: string;
  let bodySection: string;
  let preForwardContent = "";

  if (gmailMarkerMatch) {
    const markerIndex = textBody.indexOf(gmailMarkerMatch[0]);
    preForwardContent = textBody.slice(0, markerIndex).trim();
    const afterMarker = textBody.slice(
      markerIndex + gmailMarkerMatch[0].length
    );

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
    const outlookHeaderMatch = textBody.match(RE_OUTLOOK_HEADER);

    if (!outlookHeaderMatch?.[1]) {
      result.originalBody = textBody;
      return result;
    }

    const headerStart = textBody.indexOf(outlookHeaderMatch[0]);
    preForwardContent = textBody.slice(0, headerStart).trim();
    headerSection = outlookHeaderMatch[1];
    bodySection = textBody.slice(headerStart + outlookHeaderMatch[0].length);
  }

  result.forwardedByBody = preForwardContent;

  // Select patterns based on detected format
  const patterns = gmailMarkerMatch
    ? GMAIL_FORWARD_PATTERNS
    : OUTLOOK_FORWARD_PATTERNS;

  const fromMatch = headerSection.match(patterns.from);
  if (fromMatch) {
    result.originalFrom = extractFromMatch(fromMatch);
  }

  const datePattern = gmailMarkerMatch
    ? GMAIL_FORWARD_PATTERNS.date
    : OUTLOOK_FORWARD_PATTERNS.sent;
  const dateMatch = headerSection.match(datePattern);
  if (dateMatch?.[1]) {
    result.originalDate = dateMatch[1].trim();
  }

  const toMatch = headerSection.match(patterns.to);
  if (toMatch?.[1]) {
    result.originalTo = parseEmailAddresses(toMatch[1]);
  }

  const ccMatch = headerSection.match(patterns.cc);
  if (ccMatch?.[1]) {
    result.originalCc = parseEmailAddresses(ccMatch[1]);
  }

  const subjectMatch = headerSection.match(patterns.subject);
  if (subjectMatch?.[1]) {
    result.originalSubject = subjectMatch[1].trim();
  }

  result.originalBody = bodySection.trim();

  return result;
}

function emptyParsedForward(): ParsedForward {
  return {
    forwardedByBody: "",
    originalBody: "",
    originalCc: [],
    originalDate: null,
    originalFrom: null,
    originalSubject: null,
    originalTo: [],
  };
}

/**
 * Parse a forwarded email to extract original message details.
 */
export function parseForwardedEmail(body: string): ParsedForward {
  const isHtml = body.includes("<b>From:</b>") || body.includes("<b>Sent:</b>");
  return isHtml ? parseHtmlForward(body) : parsePlainTextForward(body);
}

// -- Reply construction --

function cleanSubject(subject: string | null): string {
  if (subject === null) {
    return "RE: (no subject)";
  }

  const cleaned = subject
    .replace(RE_FORWARD_PREFIX, "")
    .replace(RE_REPLY_PREFIX, "")
    .trim();

  return `RE: ${cleaned}`;
}

function formatContactHtml(contact: EmailContact): string {
  return contact.name
    ? `${contact.name} &lt;${contact.email}&gt;`
    : contact.email;
}

function formatContactListHtml(contacts: EmailContact[]): string {
  return contacts.map(formatContactHtml).join("; ");
}

function buildQuotedBlockHtml(parsed: ParsedForward): string {
  const parts: string[] = [
    '<div style="border-left: 2px solid #ccc; padding-left: 10px; margin-top: 20px; color: #666;">',
  ];

  if (parsed.originalFrom) {
    parts.push(
      `<div><strong>From:</strong> ${formatContactHtml(parsed.originalFrom)}</div>`
    );
  }

  if (parsed.originalDate) {
    parts.push(`<div><strong>Sent:</strong> ${parsed.originalDate}</div>`);
  }

  if (parsed.originalTo.length > 0) {
    parts.push(
      `<div><strong>To:</strong> ${formatContactListHtml(parsed.originalTo)}</div>`
    );
  }

  if (parsed.originalCc.length > 0) {
    parts.push(
      `<div><strong>Cc:</strong> ${formatContactListHtml(parsed.originalCc)}</div>`
    );
  }

  if (parsed.originalSubject) {
    parts.push(
      `<div><strong>Subject:</strong> ${parsed.originalSubject}</div>`
    );
  }

  parts.push("<br>");

  const bodyHtml = parsed.originalBody
    .split("\n")
    .map((line) => `<div>${line || "&nbsp;"}</div>`)
    .join("");
  parts.push(bodyHtml);

  parts.push("</div>");

  return parts.join("\n");
}

function filterRecipients(
  contacts: EmailContact[],
  excludeSet: Set<string>
): EmailContact[] {
  return contacts.filter((c) => !excludeSet.has(c.email));
}

function wrapReplyAsHtml(replyContent: string): string {
  if (replyContent.includes("<")) {
    return replyContent;
  }

  return replyContent
    .split("\n")
    .map((line) => `<div>${line || "<br>"}</div>`)
    .join("\n");
}

/**
 * Construct a reply email from a forwarded message.
 *
 * Returns separate replyBody and quotedContent so the caller can insert
 * a signature between them.
 */
export function constructReplyFromForward(
  options: ReplyFromForwardOptions
): ConstructedReply {
  const parsed = parseForwardedEmail(options.forwardedBody);

  const excludeSet = new Set<string>([
    options.yourEmail.toLowerCase(),
    ...(options.excludeEmails ?? []).map((e) => e.toLowerCase()),
  ]);
  if (options.forwarderEmail) {
    excludeSet.add(options.forwarderEmail.toLowerCase());
  }

  // To: original sender (unless excluded)
  const to: EmailContact[] = [];
  if (parsed.originalFrom && !excludeSet.has(parsed.originalFrom.email)) {
    to.push(parsed.originalFrom);
  }

  // CC: original To (if opted in) + original CC, minus exclusions
  const ccSources =
    options.includeOriginalTo !== false
      ? [...parsed.originalTo, ...parsed.originalCc]
      : [...parsed.originalCc];
  const cc = filterRecipients(ccSources, excludeSet);

  const subject = cleanSubject(parsed.originalSubject);
  const quotedContent = buildQuotedBlockHtml(parsed);
  const replyBody = wrapReplyAsHtml(options.replyContent);
  const body = `${replyBody}\n${quotedContent}`;

  return {
    body,
    bodyType: "html",
    cc,
    quotedContent,
    replyBody,
    subject,
    to,
  };
}

/**
 * Parse and preview what the reply would look like (for testing).
 */
export function previewReplyFromForward(options: ReplyFromForwardOptions): {
  parsed: ParsedForward;
  reply: ConstructedReply;
} {
  const parsed = parseForwardedEmail(options.forwardedBody);
  const reply = constructReplyFromForward(options);
  return { parsed, reply };
}
