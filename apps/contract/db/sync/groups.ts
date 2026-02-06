/**
 * MOVED: Group sync now lives at apps/email-cli/sync/groups.ts
 *
 * Run: bun apps/email-cli/sync/groups.ts
 *
 * Re-exports for backward compatibility.
 */
export {
  type GroupSyncProgress,
  type GroupSyncResult,
  syncAllGroups,
} from "@email/sync/groups";
