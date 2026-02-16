/**
 * Microsoft 365 group sync.
 *
 * - Syncs group conversations into Postgres
 * - Stores attachment metadata and optional attachments on disk
 * - Enqueues downstream linkage/intake jobs
 */
export {
  type GroupSyncProgress,
  type GroupSyncResult,
  syncAllGroups,
} from "./groups-core";
export {
  printGroupSyncSummary,
  showGroupStatus,
} from "./groups-status";
