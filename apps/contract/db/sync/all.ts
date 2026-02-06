/**
 * MOVED: Email sync now lives at apps/email-cli/sync/
 *
 * Run: bun apps/email-cli/sync/mailboxes.ts
 *
 * Re-exports for backward compatibility.
 */
export {
  ALL_GROUPS,
  ALL_MAILBOXES,
  type SyncAllOptions,
  type SyncProgress,
  type SyncResult,
} from "@email/sync/config";
export { enrichEmailDomains } from "@email/sync/enrichment";
export {
  printSyncSummary,
  showSyncStatus,
  syncAllMailboxes,
} from "@email/sync/mailboxes";
