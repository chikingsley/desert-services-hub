import {
  normalizeEmailBody,
  validateEmailBodyOrThrow,
} from "@email/commands/body-policy";
import { assertWritableMailbox, getWriteClient } from "@email/commands/config";
import { loadFileAttachments } from "@email/commands/helpers";
import type { ReplyDraftByIdCommandOptions } from "./types";

export async function replyDraftByIdCommand(
  options: ReplyDraftByIdCommandOptions
): Promise<void> {
  assertWritableMailbox(options.userId, "reply-draft-by-id");
  const normalizedBody = normalizeEmailBody(options.body);
  validateEmailBodyOrThrow(normalizedBody);
  const userId = options.userId as string;
  const client = await getWriteClient(userId);

  const attachments = options.attachmentPaths
    ? await loadFileAttachments(options.attachmentPaths)
    : [];

  const draft = await client.createReplyDraft({
    attachments: attachments.length > 0 ? attachments : undefined,
    body: normalizedBody,
    messageId: options.messageId,
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
