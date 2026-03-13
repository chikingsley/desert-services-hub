interface ReplySourceEmail {
  ccEmails: string[];
  fromEmail: string | null;
  toEmails: string[];
}

interface ReplyDraftEmail {
  ccEmails: string[];
  toEmails: string[];
}

interface ReplyRecipientLists {
  cc: string[];
  to: string[];
}

function uniqueEmails(emails: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const email of emails) {
    const normalized = email?.trim().toLowerCase();
    if (!(normalized && !seen.has(normalized))) {
      continue;
    }
    seen.add(normalized);
    values.push(normalized);
  }

  return values;
}

export function buildReplyAllDraftRecipients(
  email: ReplySourceEmail,
  mailboxEmail: string,
  explicitTo?: string[],
  explicitCc?: string[]
): ReplyRecipientLists {
  const mailbox = mailboxEmail.trim().toLowerCase();
  const to = uniqueEmails([email.fromEmail, ...(explicitTo ?? [])]).filter(
    (recipient) => recipient !== mailbox
  );

  const cc = uniqueEmails([
    ...email.ccEmails,
    ...email.toEmails,
    ...(explicitCc ?? []),
  ]).filter((recipient) => recipient !== mailbox && !to.includes(recipient));

  return { cc, to };
}

export function buildReplyAllDraftRecipientsFromDraft(
  draft: ReplyDraftEmail,
  mailboxEmail: string,
  explicitTo?: string[],
  explicitCc?: string[]
): ReplyRecipientLists {
  const mailbox = mailboxEmail.trim().toLowerCase();
  const to = uniqueEmails([...draft.toEmails, ...(explicitTo ?? [])]).filter(
    (recipient) => recipient !== mailbox
  );

  const cc = uniqueEmails([...draft.ccEmails, ...(explicitCc ?? [])]).filter(
    (recipient) => recipient !== mailbox && !to.includes(recipient)
  );

  return { cc, to };
}

function extractBodyInnerHtml(html: string): string {
  const match = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return (match?.[1] ?? html).trim();
}

export function prependReplyDraftBodyHtml(
  permitHtml: string,
  existingReplyHtml: string
): string {
  const permitBody = extractBodyInnerHtml(permitHtml);

  if (permitBody.length === 0) {
    return existingReplyHtml;
  }

  if (existingReplyHtml.trim().length === 0) {
    return `<html><body>${permitBody}</body></html>`;
  }

  if (/<body\b[^>]*>/i.test(existingReplyHtml)) {
    return existingReplyHtml.replace(
      /<body\b([^>]*)>/i,
      `<body$1>${permitBody}<div><br></div>`
    );
  }

  return `<html><body>${permitBody}<div><br></div>${existingReplyHtml}</body></html>`;
}
