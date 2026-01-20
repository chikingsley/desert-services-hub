/**
 * DocuSign Email Parser
 *
 * Parses DocuSign notification emails to extract document information and links.
 */

// Top-level regex patterns for performance
const DOCUSIGN_HREF_PATTERN =
  /href=["']?(https?:\/\/[^"'\s>]*docusign[^"'\s>]*)/gi;
const DOCUSIGN_PLAIN_URL_PATTERN =
  /(https?:\/\/[^\s<>"']*docusign\.(?:net|com)[^\s<>"']*)/gi;

type DocuSignEmailType =
  | "completed" // All parties signed, document ready
  | "signed" // You signed, waiting for others
  | "sent" // Document sent for signature
  | "voided" // Document voided
  | "declined" // Someone declined
  | "viewed" // Someone viewed
  | "unknown";

type ParsedDocuSignEmail = {
  isDocuSign: boolean;
  type: DocuSignEmailType;
  envelopeId: string | null;
  documentName: string | null;
  senderName: string | null;
  senderEmail: string | null;
  reviewLink: string | null;
  downloadLink: string | null;
  rawLinks: string[];
};

/**
 * Detect if an email is from DocuSign
 */
export function isDocuSignEmail(fromAddress: string, subject: string): boolean {
  const fromLower = fromAddress.toLowerCase();
  const subjectLower = subject.toLowerCase();

  // Check sender
  if (
    fromLower.includes("docusign") ||
    fromLower.includes("dse_na") ||
    fromLower.includes("@docusign.net")
  ) {
    return true;
  }

  // Check subject patterns
  const docuSignSubjectPatterns = [
    "completed:",
    "please docusign",
    "docusign:",
    "your document",
    "has been signed",
    "is ready for review",
    "envelope",
  ];

  return docuSignSubjectPatterns.some((p) => subjectLower.includes(p));
}

/**
 * Determine the type of DocuSign notification
 */
function detectEmailType(subject: string, body: string): DocuSignEmailType {
  const text = `${subject} ${body}`.toLowerCase();

  if (
    text.includes("completed") ||
    text.includes("all parties have signed") ||
    text.includes("is complete")
  ) {
    return "completed";
  }

  if (
    text.includes("you have signed") ||
    text.includes("your signature has been")
  ) {
    return "signed";
  }

  if (text.includes("voided") || text.includes("has been voided")) {
    return "voided";
  }

  if (text.includes("declined") || text.includes("has declined")) {
    return "declined";
  }

  if (text.includes("viewed") || text.includes("has viewed")) {
    return "viewed";
  }

  if (
    text.includes("please sign") ||
    text.includes("sent you") ||
    text.includes("to sign")
  ) {
    return "sent";
  }

  return "unknown";
}

/**
 * Extract document name from email
 */
function extractDocumentName(subject: string, body: string): string | null {
  // Try subject first: "Completed: Document Name"
  const subjectMatch = subject.match(
    /(?:Completed|Signed|Voided|Please (?:DocuSign|sign)):\s*(.+)/i
  );
  if (subjectMatch?.[1]) {
    return subjectMatch[1].trim();
  }

  // Try body patterns
  const bodyPatterns = [
    /Document Name:\s*([^\n<]+)/i,
    /Subject:\s*([^\n<]+)/i,
    /<b>([^<]+)<\/b>\s*(?:has been|is ready)/i,
  ];

  for (const pattern of bodyPatterns) {
    const match = body.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Extract envelope ID from DocuSign URLs
 */
function extractEnvelopeId(urls: string[]): string | null {
  for (const url of urls) {
    // Pattern: ?a=<envelope-id>&...
    const match = url.match(/[?&](?:a|envelopeId|EnvelopeId)=([a-f0-9-]{36})/i);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Extract all DocuSign links from email body
 */
function extractDocuSignLinks(body: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();

  // Match href links to DocuSign domains
  // Reset lastIndex since we're reusing global regex
  DOCUSIGN_HREF_PATTERN.lastIndex = 0;
  let match = DOCUSIGN_HREF_PATTERN.exec(body);

  while (match !== null) {
    const url = match[1];
    if (url && !seen.has(url)) {
      seen.add(url);
      links.push(url);
    }
    match = DOCUSIGN_HREF_PATTERN.exec(body);
  }

  // Also match plain URLs
  DOCUSIGN_PLAIN_URL_PATTERN.lastIndex = 0;
  match = DOCUSIGN_PLAIN_URL_PATTERN.exec(body);

  while (match !== null) {
    const url = match[1];
    if (url && !seen.has(url)) {
      seen.add(url);
      links.push(url);
    }
    match = DOCUSIGN_PLAIN_URL_PATTERN.exec(body);
  }

  return links;
}

/**
 * Categorize links into review vs download
 */
function categorizeLinks(links: string[]): {
  reviewLink: string | null;
  downloadLink: string | null;
} {
  let reviewLink: string | null = null;
  let downloadLink: string | null = null;

  for (const link of links) {
    const lowerLink = link.toLowerCase();

    // Download links
    if (
      lowerLink.includes("/documents/") ||
      lowerLink.includes("/download") ||
      lowerLink.includes("action=download")
    ) {
      downloadLink = link;
    }

    // Review/signing links
    if (
      lowerLink.includes("/signing/") ||
      lowerLink.includes("/review") ||
      lowerLink.includes("emailstart")
    ) {
      reviewLink = link;
    }
  }

  // If no specific download link, the review link can also be used
  if (!downloadLink && reviewLink) {
    downloadLink = reviewLink;
  }

  return { reviewLink, downloadLink };
}

/**
 * Parse a DocuSign email to extract all relevant information
 */
export function parseDocuSignEmail(
  fromAddress: string,
  fromName: string | null,
  subject: string,
  body: string
): ParsedDocuSignEmail {
  const isDocuSign = isDocuSignEmail(fromAddress, subject);

  if (!isDocuSign) {
    return {
      isDocuSign: false,
      type: "unknown",
      envelopeId: null,
      documentName: null,
      senderName: null,
      senderEmail: null,
      reviewLink: null,
      downloadLink: null,
      rawLinks: [],
    };
  }

  const type = detectEmailType(subject, body);
  const documentName = extractDocumentName(subject, body);
  const rawLinks = extractDocuSignLinks(body);
  const envelopeId = extractEnvelopeId(rawLinks);
  const { reviewLink, downloadLink } = categorizeLinks(rawLinks);

  // Extract original sender info
  let senderName = fromName;
  let senderEmail: string | null = null;

  // Try to extract the actual sender from the body
  const senderMatch = body.match(/(?:sent by|from)\s+([^<\n]+)/i);
  if (senderMatch?.[1]) {
    senderName = senderMatch[1].trim();
  }

  const emailMatch = body.match(
    /(?:sent by|from|contact)[^<]*<([^@]+@[^>]+)>/i
  );
  if (emailMatch?.[1]) {
    senderEmail = emailMatch[1].trim();
  }

  return {
    isDocuSign: true,
    type,
    envelopeId,
    documentName,
    senderName,
    senderEmail,
    reviewLink,
    downloadLink,
    rawLinks,
  };
}

/**
 * Check if this email type should trigger a download
 */
export function shouldDownload(parsed: ParsedDocuSignEmail): boolean {
  // Only download completed documents
  return (
    parsed.isDocuSign && parsed.type === "completed" && !!parsed.downloadLink
  );
}
