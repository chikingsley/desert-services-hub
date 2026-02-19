import { parseArgs } from "node:util";
import type { CommandHandler } from "@email-cli/commands/types";
import { createDraftCommand } from "./create";
import { replyDraftCommand } from "./reply";
import { replyDraftByIdCommand } from "./reply-by-id";
import { sendDraftCommand } from "./send";

export const draftHandlers: Record<string, CommandHandler> = {
  draft: async (args) => {
    const { values } = parseArgs({
      args,
      options: {
        attachments: { type: "string", short: "a" },
        body: { type: "string", short: "b" },
        cc: { type: "string" },
        "no-signature": { type: "boolean", default: false },
        subject: { type: "string", short: "s" },
        to: { type: "string" },
        user: { type: "string", short: "u" },
      },
    });
    if (!(values.subject && values.body && values.user)) {
      console.error("Error: --subject, --body, and --user are required");
      console.error(
        "Usage: draft --user <mailbox> --subject <text> --body <text> [--to <email>] [--attachments <paths>]"
      );
      process.exit(1);
    }
    await createDraftCommand({
      attachmentPaths: values.attachments,
      body: values.body,
      cc: values.cc,
      skipSignature: values["no-signature"] ?? false,
      subject: values.subject,
      to: values.to,
      userId: values.user as string,
    });
  },

  "reply-draft": async (args) => {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      args,
      options: {
        body: { type: "string", short: "b" },
        user: { type: "string", short: "u" },
        "reply-all": { type: "boolean", default: false },
        "no-signature": { type: "boolean", default: false },
        limit: { type: "string", short: "l", default: "5" },
        attachments: { type: "string", short: "a" },
      },
    });
    const query = positionals[0];
    if (!(query && values.body && values.user)) {
      console.error("Error: search query, --body, and --user are required");
      console.error(
        "Usage: reply-draft <query> --user <mailbox> --body <text> [--reply-all] [--limit <number>]"
      );
      process.exit(1);
    }
    await replyDraftCommand({
      attachmentPaths: values.attachments,
      body: values.body,
      limit: Number.parseInt(values.limit as string, 10),
      query,
      replyAll: values["reply-all"] ?? false,
      skipSignature: values["no-signature"] ?? false,
      userId: values.user as string,
    });
  },

  "reply-draft-by-id": async (args) => {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      args,
      options: {
        body: { type: "string", short: "b" },
        user: { type: "string", short: "u" },
        "reply-all": { type: "boolean", default: false },
        "no-signature": { type: "boolean", default: false },
        attachments: { type: "string", short: "a" },
      },
    });
    const messageId = positionals[0];
    if (!(messageId && values.body && values.user)) {
      console.error("Error: messageId, --body, and --user are required");
      console.error(
        "Usage: reply-draft-by-id <messageId> --user <mailbox> --body <text>"
      );
      process.exit(1);
    }
    await replyDraftByIdCommand({
      attachmentPaths: values.attachments,
      body: values.body,
      messageId,
      replyAll: values["reply-all"] ?? false,
      skipSignature: values["no-signature"] ?? false,
      userId: values.user as string,
    });
  },

  "send-draft": async (args) => {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      args,
      options: {
        user: { type: "string", short: "u" },
      },
    });
    const draftId = positionals[0];
    if (!(draftId && values.user)) {
      console.error(
        "Error: draftId and --user required. Usage: send-draft <draftId> --user <mailbox>"
      );
      process.exit(1);
    }
    await sendDraftCommand(draftId, values.user as string);
  },
};
