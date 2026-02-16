/**
 * Email send and reply commands.
 */
import { parseArgs } from "node:util";
import {
  normalizeEmailBody,
  validateEmailBodyOrThrow,
} from "@email/commands/body-policy";
import {
  assertSendEnabled,
  assertWritableMailbox,
  getWriteClient,
} from "@email/commands/config";
import { loadFileAttachments } from "@email/commands/helpers";
import type { CommandHandler } from "@email/commands/types";

async function sendCommand(options: {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  skipSignature: boolean;
  attachmentPaths?: string;
  userId?: string;
}) {
  assertSendEnabled("send");
  assertWritableMailbox(options.userId, "send");
  const normalizedBody = normalizeEmailBody(options.body);
  validateEmailBodyOrThrow(normalizedBody);
  const userId = options.userId as string;
  const client = await getWriteClient(userId);

  const toRecipients = options.to
    .split(",")
    .map((email) => ({ email: email.trim() }));
  const ccRecipients = options.cc
    ? options.cc.split(",").map((email) => ({ email: email.trim() }))
    : undefined;

  const attachments = options.attachmentPaths
    ? await loadFileAttachments(options.attachmentPaths)
    : [];

  const draft = await client.createDraft({
    attachments: attachments.length > 0 ? attachments : undefined,
    body: normalizedBody,
    cc: ccRecipients,
    skipSignature: options.skipSignature,
    subject: options.subject,
    to: toRecipients,
    userId,
  });
  await client.sendDraft(draft.id, userId);

  const attInfo =
    attachments.length > 0 ? ` with ${attachments.length} attachment(s)` : "";
  console.log(`Done - Email sent to ${options.to}${attInfo}`);
}

async function replyCommand(options: {
  messageId: string;
  body: string;
  userId?: string;
  replyAll: boolean;
  skipSignature: boolean;
}) {
  assertSendEnabled("reply");
  assertWritableMailbox(options.userId, "reply");
  const normalizedBody = normalizeEmailBody(options.body);
  validateEmailBodyOrThrow(normalizedBody);
  const userId = options.userId as string;
  const client = await getWriteClient(userId);

  const draft = await client.createReplyDraft({
    body: normalizedBody,
    messageId: options.messageId,
    replyAll: options.replyAll,
    skipSignature: options.skipSignature,
    userId,
  });
  await client.sendDraft(draft.id, userId);

  const action = options.replyAll ? "Reply-all" : "Reply";
  console.log(`Done - ${action} sent successfully`);
}

export const sendHandlers: Record<string, CommandHandler> = {
  reply: async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        body: { type: "string", short: "b" },
        user: { type: "string", short: "u" },
        "reply-all": { type: "boolean", default: false },
        "no-signature": { type: "boolean", default: false },
      },
      allowPositionals: true,
    });
    const messageId = positionals[0];
    if (!(messageId && values.body && values.user)) {
      console.error("Error: messageId, --body, and --user are required");
      console.error("Usage: reply <messageId> --user <mailbox> --body <text>");
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
        user: { type: "string", short: "u" },
      },
    });
    if (!(values.to && values.subject && values.body && values.user)) {
      console.error("Error: --to, --subject, --body, and --user are required");
      console.error(
        "Usage: send --user <mailbox> --to <email> --subject <text> --body <text> [--attachments <paths>]"
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
      userId: values.user as string,
    });
  },
};
