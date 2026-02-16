import {
  normalizeEmailBody,
  validateEmailBodyOrThrow,
} from "@email/commands/body-policy";
import {
  assertWritableMailbox,
  getAppClient,
  getWriteClient,
} from "@email/commands/config";
import { loadFileAttachments } from "@email/commands/helpers";
import type { ReplyDraftCommandOptions } from "./types";

export async function replyDraftCommand(
  options: ReplyDraftCommandOptions
): Promise<void> {
  assertWritableMailbox(options.userId, "reply-draft");
  const normalizedBody = normalizeEmailBody(options.body);
  validateEmailBodyOrThrow(normalizedBody);
  const userId = options.userId as string;
  const appCl = getAppClient();
  const writeCl = await getWriteClient(userId);

  console.log(`Searching for: "${options.query}"...`);
  const emails = await appCl.searchEmails({
    limit: options.limit ?? 5,
    query: options.query,
    userId,
  });

  if (emails.length === 0) {
    console.error(`No emails found matching: "${options.query}"`);
    console.log("\nTry a different search query or check the mailbox with:");
    console.log(
      `  bun packages/email/cli/cli.ts search "${options.query}" --user ${options.userId}`
    );
    process.exit(1);
  }

  const selectedEmail = emails[0];

  if (emails.length > 1) {
    console.log(`\nFound ${emails.length} emails. Using the most recent:`);
    for (let i = 0; i < Math.min(emails.length, 5); i++) {
      const email = emails[i];
      const date = new Date(email.receivedDateTime).toLocaleDateString();
      const marker = i === 0 ? ">" : " ";
      console.log(
        `${marker} [${date}] ${email.subject} (From: ${email.fromEmail})`
      );
    }
    console.log(
      "\nUsing the first result. To use a different email, search more specifically or use:"
    );
    console.log(
      '  bun packages/email/cli/cli.ts reply-draft-by-id <messageId> --user <mailbox> --body "..."'
    );
  } else {
    const date = new Date(selectedEmail.receivedDateTime).toLocaleDateString();
    console.log(`Found: [${date}] ${selectedEmail.subject}`);
    console.log(`  From: ${selectedEmail.fromEmail}`);
  }

  const attachments = options.attachmentPaths
    ? await loadFileAttachments(options.attachmentPaths)
    : [];

  console.log(
    `\nCreating ${options.replyAll ? "reply-all" : "reply"} draft...`
  );
  const draft = await writeCl.createReplyDraft({
    attachments: attachments.length > 0 ? attachments : undefined,
    body: normalizedBody,
    messageId: selectedEmail.id,
    replyAll: options.replyAll,
    skipSignature: options.skipSignature,
    userId,
  });

  const attInfo =
    attachments.length > 0 ? ` with ${attachments.length} attachment(s)` : "";
  const action = options.replyAll ? "Reply-all" : "Reply";
  console.log(
    `Done - ${action} draft created: "${draft.subject}" (ID: ${draft.id})${attInfo}`
  );
  console.log(`  View in Outlook or send with: send-draft ${draft.id}`);
}
