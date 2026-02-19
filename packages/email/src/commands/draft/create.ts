import {
  normalizeEmailBody,
  validateEmailBodyOrThrow,
} from "@email/commands/body-policy";
import { getAppClient } from "@email/commands/config";
import { loadFileAttachments } from "@email/commands/helpers";
import type { DraftCommandOptions } from "./types";

export async function createDraftCommand(
  options: DraftCommandOptions
): Promise<void> {
  const normalizedBody = normalizeEmailBody(options.body);
  validateEmailBodyOrThrow(normalizedBody);
  const userId = options.userId as string;
  const client = getAppClient();

  const toRecipients = options.to
    ? options.to.split(",").map((email) => ({ email: email.trim() }))
    : undefined;
  const ccRecipients = options.cc
    ? options.cc.split(",").map((email) => ({ email: email.trim() }))
    : undefined;

  const fileAttachments = options.attachmentPaths
    ? await loadFileAttachments(options.attachmentPaths)
    : [];

  const body = normalizedBody;
  const attachmentsToAdd = [...fileAttachments];

  const draft = await client.createDraft({
    attachments: attachmentsToAdd.length > 0 ? attachmentsToAdd : undefined,
    body,
    bodyType: "html",
    cc: ccRecipients,
    subject: options.subject,
    to: toRecipients,
    userId,
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
