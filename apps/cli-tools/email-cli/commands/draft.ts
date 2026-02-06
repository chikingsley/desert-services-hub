/**
 * Draft commands: draft, reply-draft, reply-draft-by-id, send-draft.
 */
import { parseArgs } from "node:util";
import {
  assertWritableMailbox,
  DEFAULT_USER,
  getAppClient,
  getUserClient,
} from "@email/commands/config";
import { loadFileAttachments } from "@email/commands/helpers";
import type { CommandHandler } from "@email/commands/types";
import {
  getLogoAttachment,
  wrapWithSignature,
} from "@email/email-templates/index";

async function draftCommand(options: {
  to?: string;
  cc?: string;
  subject: string;
  body: string;
  skipSignature: boolean;
  attachmentPaths?: string;
  userId: string;
}) {
  assertWritableMailbox(options.userId, "draft");
  const client = await getUserClient();

  const toRecipients = options.to
    ? options.to.split(",").map((email) => ({ email: email.trim() }))
    : undefined;
  const ccRecipients = options.cc
    ? options.cc.split(",").map((email) => ({ email: email.trim() }))
    : undefined;

  const fileAttachments = options.attachmentPaths
    ? await loadFileAttachments(options.attachmentPaths)
    : [];

  let body = options.body;
  let bodyType: "html" | "text" = "text";
  const attachmentsToAdd = [...fileAttachments];

  if (!options.skipSignature) {
    body = await wrapWithSignature(options.body);
    bodyType = "html";
    const logo = await getLogoAttachment();
    attachmentsToAdd.push({
      name: logo.name,
      contentType: logo.contentType,
      contentBytes: logo.contentBytes,
    });
  }

  const draft = await client.createDraft({
    subject: options.subject,
    body,
    bodyType,
    to: toRecipients,
    cc: ccRecipients,
    attachments: attachmentsToAdd.length > 0 ? attachmentsToAdd : undefined,
    userId: options.userId,
  });

  const attInfo =
    fileAttachments.length > 0
      ? ` with ${fileAttachments.length} attachment(s)`
      : "";
  console.log(
    `Done - Draft created: "${draft.subject}" (ID: ${draft.id})${attInfo}`
  );
  console.log(`  View in Outlook or send with: send-draft ${draft.id}`);
}

async function replyDraftCommand(options: {
  query: string;
  body: string;
  replyAll: boolean;
  skipSignature: boolean;
  userId: string;
  limit?: number;
  attachmentPaths?: string;
}) {
  assertWritableMailbox(options.userId, "reply-draft");
  const appCl = getAppClient();
  const userCl = await getUserClient();

  console.log(`Searching for: "${options.query}"...`);
  const emails = await appCl.searchEmails({
    query: options.query,
    userId: options.userId,
    limit: options.limit ?? 5,
  });

  if (emails.length === 0) {
    console.error(`No emails found matching: "${options.query}"`);
    console.log("\nTry a different search query or check the mailbox with:");
    console.log(
      `  bun apps/email-cli/cli.ts search "${options.query}" --user ${options.userId}`
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
      '  bun apps/email-cli/cli.ts reply-draft-by-id <messageId> --body "..."'
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
  const draft = await userCl.createReplyDraft({
    messageId: selectedEmail.id,
    body: options.body,
    replyAll: options.replyAll,
    attachments: attachments.length > 0 ? attachments : undefined,
    userId: options.userId,
    skipSignature: options.skipSignature,
  });

  const attInfo =
    attachments.length > 0 ? ` with ${attachments.length} attachment(s)` : "";
  const action = options.replyAll ? "Reply-all" : "Reply";
  console.log(
    `Done - ${action} draft created: "${draft.subject}" (ID: ${draft.id})${attInfo}`
  );
  console.log(`  View in Outlook or send with: send-draft ${draft.id}`);
}

async function replyDraftByIdCommand(options: {
  messageId: string;
  body: string;
  replyAll: boolean;
  skipSignature: boolean;
  userId: string;
  attachmentPaths?: string;
}) {
  assertWritableMailbox(options.userId, "reply-draft-by-id");
  const client = await getUserClient();

  const attachments = options.attachmentPaths
    ? await loadFileAttachments(options.attachmentPaths)
    : [];

  const draft = await client.createReplyDraft({
    messageId: options.messageId,
    body: options.body,
    replyAll: options.replyAll,
    attachments: attachments.length > 0 ? attachments : undefined,
    userId: options.userId,
    skipSignature: options.skipSignature,
  });

  const attInfo =
    attachments.length > 0 ? ` with ${attachments.length} attachment(s)` : "";
  const action = options.replyAll ? "Reply-all" : "Reply";
  console.log(
    `Done - ${action} draft created: "${draft.subject}" (ID: ${draft.id})${attInfo}`
  );
  console.log(`  View in Outlook or send with: send-draft ${draft.id}`);
}

async function sendDraftCommand(draftId: string, userId: string) {
  assertWritableMailbox(userId, "send-draft");
  const client = await getUserClient();
  await client.sendDraft(draftId);
  console.log(`Done - Draft sent successfully (ID: ${draftId})`);
}

export const draftHandlers: Record<string, CommandHandler> = {
  draft: async (args) => {
    const { values } = parseArgs({
      args,
      options: {
        to: { type: "string" },
        cc: { type: "string" },
        subject: { type: "string", short: "s" },
        body: { type: "string", short: "b" },
        attachments: { type: "string", short: "a" },
        "no-signature": { type: "boolean", default: false },
        user: { type: "string", short: "u", default: DEFAULT_USER },
      },
    });
    if (!(values.subject && values.body)) {
      console.error("Error: --subject and --body are required");
      console.error(
        "Usage: draft --subject <text> --body <text> [--to <email>] [--attachments <paths>]"
      );
      process.exit(1);
    }
    await draftCommand({
      to: values.to,
      cc: values.cc,
      subject: values.subject,
      body: values.body,
      skipSignature: values["no-signature"] ?? false,
      attachmentPaths: values.attachments,
      userId: values.user as string,
    });
  },

  "reply-draft": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        body: { type: "string", short: "b" },
        user: { type: "string", short: "u", default: DEFAULT_USER },
        "reply-all": { type: "boolean", default: false },
        "no-signature": { type: "boolean", default: false },
        limit: { type: "string", short: "l", default: "5" },
        attachments: { type: "string", short: "a" },
      },
      allowPositionals: true,
    });
    const query = positionals[0];
    if (!(query && values.body)) {
      console.error("Error: search query and --body are required");
      console.error(
        "Usage: reply-draft <query> --body <text> [--reply-all] [--limit <number>]"
      );
      process.exit(1);
    }
    await replyDraftCommand({
      query,
      body: values.body,
      userId: values.user as string,
      replyAll: values["reply-all"] ?? false,
      skipSignature: values["no-signature"] ?? false,
      limit: Number.parseInt(values.limit as string, 10),
      attachmentPaths: values.attachments,
    });
  },

  "reply-draft-by-id": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        body: { type: "string", short: "b" },
        user: { type: "string", short: "u", default: DEFAULT_USER },
        "reply-all": { type: "boolean", default: false },
        "no-signature": { type: "boolean", default: false },
        attachments: { type: "string", short: "a" },
      },
      allowPositionals: true,
    });
    const messageId = positionals[0];
    if (!(messageId && values.body)) {
      console.error("Error: messageId and --body are required");
      console.error("Usage: reply-draft-by-id <messageId> --body <text>");
      process.exit(1);
    }
    await replyDraftByIdCommand({
      messageId,
      body: values.body,
      userId: values.user as string,
      replyAll: values["reply-all"] ?? false,
      skipSignature: values["no-signature"] ?? false,
      attachmentPaths: values.attachments,
    });
  },

  "send-draft": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u", default: DEFAULT_USER },
      },
      allowPositionals: true,
    });
    const draftId = positionals[0];
    if (!draftId) {
      console.error("Error: draftId required. Usage: send-draft <draftId>");
      process.exit(1);
    }
    await sendDraftCommand(draftId, values.user as string);
  },
};
