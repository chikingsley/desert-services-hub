import type { CommandHandler } from "@email/commands/types";
import { handleGroupSync } from "./group-sync";
import { handleMailboxSync } from "./mailbox-sync";

export const syncHandlers: Record<string, CommandHandler> = {
  "sync-groups": handleGroupSync,
  "sync-mailboxes": handleMailboxSync,
};
