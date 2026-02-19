import { assertSendEnabled, getAppClient } from "@email-cli/commands/config";

export async function sendDraftCommand(
  draftId: string,
  userId?: string
): Promise<void> {
  assertSendEnabled("send-draft");
  const client = getAppClient();
  await client.sendDraft(draftId, userId);
  console.log(`Done - Draft sent successfully (ID: ${draftId})`);
}
