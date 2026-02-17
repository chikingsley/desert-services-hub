/**
 * Monday Status Sync — background-jobs timer adapter.
 *
 * Delegates to packages/monday/src/sync/status-sync/ which uses the shared
 * Monday API client (query + retry logic, reads MONDAY_API_KEY from process.env).
 */

import type {
  CleanupResult,
  LeadsSyncResult,
  ProjectLinkSyncResult,
} from "@monday/sync/status-sync";
import {
  runCleanup,
  runLeadsSync,
  runProjectLinkSync,
} from "@monday/sync/status-sync";

export interface MondayStatusSyncPollResult {
  skipped: boolean;
  reason?: string;
  gc?: CleanupResult;
  leads?: LeadsSyncResult;
  projectLinks?: ProjectLinkSyncResult;
}

export async function pollMondayStatusSync(): Promise<MondayStatusSyncPollResult> {
  if (!process.env.MONDAY_API_KEY?.trim()) {
    return {
      skipped: true,
      reason: "MONDAY_API_KEY is not configured",
    };
  }

  const gc = await runCleanup();
  const leads = await runLeadsSync();
  const projectLinks = await runProjectLinkSync();

  return {
    skipped: false,
    gc,
    leads,
    projectLinks,
  };
}
