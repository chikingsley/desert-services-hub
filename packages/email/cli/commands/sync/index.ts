import type { CommandHandler } from "@email-cli/commands/types";
import { handleBodyLinkAuthBootstrap } from "./body-link-auth-bootstrap";
import { handleBodyLinkBackfill } from "./body-link-backfill";
import { handleGroupSync } from "./group-sync";
import { handleMailboxSync } from "./mailbox-sync";

export const syncHandlers: Record<string, CommandHandler> = {
  "body-link-auth-bootstrap": handleBodyLinkAuthBootstrap,
  "body-link-backfill": handleBodyLinkBackfill,
  "sync-groups": handleGroupSync,
  "sync-mailboxes": handleMailboxSync,
};
