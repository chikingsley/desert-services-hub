/**
 * Monday Status Sync — background-jobs timer adapter.
 *
 * Delegates to packages/monday/src/sync/status-sync/ which uses the shared
 * Monday API client (query + retry logic, reads MONDAY_API_KEY from process.env).
 */

import { runCleanup } from "@monday/sync/status-sync/gc-cleanup";
import { runLeadsSync } from "@monday/sync/status-sync/leads-sync";
import { runProjectLinkSync } from "@monday/sync/status-sync/project-link-sync";
import type {
  CleanupResult,
  LeadsSyncResult,
  ProjectLinkSyncResult,
} from "@monday/sync/status-sync/types";

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
