/**
 * Email mailbox sync.
 *
 * - Syncs mailbox messages from Microsoft Graph into Postgres
 * - Writes message + attachment metadata
 * - Enqueues downstream jobs for project linking/intake processing
 */

export type {
  SyncAllOptions,
  SyncProgress,
  SyncResult,
} from "@email/sync/config";
export {
  printSyncSummary,
  showSyncStatus,
} from "./mailboxes-status";
export { syncAllMailboxes } from "./mailboxes-sync";
