import {
  assertSendEnabled,
  assertWritableMailbox,
  getWriteClient,
} from "@email/commands/config";

export async function sendDraftCommand(
  draftId: string,
  userId?: string
): Promise<void> {
  assertSendEnabled("send-draft");
  assertWritableMailbox(userId, "send-draft");
  const resolvedUserId = userId as string;
  const client = await getWriteClient(resolvedUserId);
  await client.sendDraft(draftId, resolvedUserId);
  console.log(`Done - Draft sent successfully (ID: ${draftId})`);
}
