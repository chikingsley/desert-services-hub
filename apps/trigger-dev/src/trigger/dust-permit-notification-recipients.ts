const INTERNAL_DOMAIN = "@desertservices.net";
const MARICOPA_SOURCE_SENDERS = new Set([
  "aqdimpact@maricopa.gov",
  "no-reply@maricopa.gov",
  "noreply@permitcenter.maricopa.gov",
]);

function uniqueEmails(emails: Array<string | null | undefined>): string[] {
  return [...new Set(emails.map((email) => email?.trim().toLowerCase() ?? ""))].filter(
    (email) => email.length > 0
  );
}

function isExternalReplyRecipient(email: string): boolean {
  return (
    !email.endsWith(INTERNAL_DOMAIN) && !MARICOPA_SOURCE_SENDERS.has(email)
  );
}

export function extractReplyAllExternalRecipients(email: {
  ccEmails: string[];
  fromEmail: string | null;
  toEmails: string[];
}): string[] {
  return uniqueEmails([
    email.fromEmail,
    ...email.toEmails,
    ...email.ccEmails,
  ]).filter(isExternalReplyRecipient);
}
