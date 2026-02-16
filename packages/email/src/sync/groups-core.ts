/**
 * M365 Group sync core logic.
 */
export type {
  GroupSyncProgress,
  GroupSyncResult,
} from "./groups-core/sync-group";
export { MS_PER_DAY, syncAllGroups, syncGroup } from "./groups-core/sync-group";
