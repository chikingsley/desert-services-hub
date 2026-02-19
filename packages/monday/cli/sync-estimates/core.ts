/**
 * CLI adapter for canonical SharePoint sync logic.
 */
import {
  type SharePointSyncResult,
  syncSharePointFoldersWithClient,
} from "@monday/sync/sharepoint-sync";
import type { SyncOptions, SyncResult } from "@monday/sync/types";
import type { SharePointClient } from "@sharepoint/client";

function toCliSyncResult(result: SharePointSyncResult): SyncResult {
  return {
    created: result.created,
    moved: result.moved,
    skipped: result.skipped,
    filesUploaded: result.filesUploaded,
    errors: result.errors,
  };
}

export async function syncEstimateFolders(
  sp: SharePointClient,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const result = await syncSharePointFoldersWithClient(sp, options);
  return toCliSyncResult(result);
}
