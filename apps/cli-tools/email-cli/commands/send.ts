/**
 * Email send and reply commands.
 */
import { parseArgs } from "node:util";
import { DEFAULT_USER, getUserClient } from "@email/commands/config";
import { loadFileAttachments } from "@email/commands/helpers";
import type { CommandHandler } from "@email/commands/types";

async function sendCommand(options: {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  skipSignature: boolean;
  attachmentPaths?: string;
}) {
  const client = await getUserClient();

  const toRecipients = options.to
    .split(",")
    .map((email) => ({ email: email.trim() }));
  const ccRecipients = options.cc
    ? options.cc.split(",").map((email) => ({ email: email.trim() }))
    : undefined;

  const attachments = options.attachmentPaths
    ? await loadFileAttachments(options.attachmentPaths)
    : [];

  await client.sendEmail({
    to: toRecipients,
    cc: ccRecipients,
    subject: options.subject,
    body: options.body,
    skipSignature: options.skipSignature,
    attachments: attachments.length > 0 ? attachments : undefined,
  });

  const attInfo =
    attachments.length > 0 ? ` with ${attachments.length} attachment(s)` : "";
  console.log(`Done - Email sent to ${options.to}${attInfo}`);
}

async function replyCommand(options: {
  messageId: string;
  body: string;
  userId: string;
  replyAll: boolean;
  skipSignature: boolean;
}) {
  const client = await getUserClient();

  await client.replyToEmail({
    messageId: options.messageId,
    body: options.body,
    userId: options.userId,
    replyAll: options.replyAll,
    skipSignature: options.skipSignature,
  });

  const action = options.replyAll ? "Reply-all" : "Reply";
  console.log(`Done - ${action} sent successfully`);
}

export const sendHandlers: Record<string, CommandHandler> = {
  send: async (args) => {
    const { values } = parseArgs({
      args,
      options: {
        to: { type: "string" },
        cc: { type: "string" },
        subject: { type: "string", short: "s" },
        body: { type: "string", short: "b" },
        attachments: { type: "string", short: "a" },
        "no-signature": { type: "boolean", default: false },
      },
    });
    if (!(values.to && values.subject && values.body)) {
      console.error("Error: --to, --subject, and --body are required");
      console.error(
        "Usage: send --to <email> --subject <text> --body <text> [--attachments <paths>]"
      );
      process.exit(1);
    }
    await sendCommand({
      to: values.to,
      cc: values.cc,
      subject: values.subject,
      body: values.body,
      skipSignature: values["no-signature"] ?? false,
      attachmentPaths: values.attachments,
    });
  },

  reply: async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        body: { type: "string", short: "b" },
        user: { type: "string", short: "u", default: DEFAULT_USER },
        "reply-all": { type: "boolean", default: false },
        "no-signature": { type: "boolean", default: false },
      },
      allowPositionals: true,
    });
    const messageId = positionals[0];
    if (!(messageId && values.body)) {
      console.error("Error: messageId and --body are required");
      console.error("Usage: reply <messageId> --body <text>");
      process.exit(1);
    }
    await replyCommand({
      messageId,
      body: values.body,
      userId: values.user as string,
      replyAll: values["reply-all"] ?? false,
      skipSignature: values["no-signature"] ?? false,
    });
  },
};
