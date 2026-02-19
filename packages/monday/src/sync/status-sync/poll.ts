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

function hasMondayApiKey(): boolean {
  return Boolean(process.env.MONDAY_API_KEY?.trim());
}

/**
 * Canonical status-sync poll entrypoint used by queue handlers.
 * Webhook-triggered runs and cron-triggered runs both call this path.
 */
export async function pollMondayStatusSync(): Promise<MondayStatusSyncPollResult> {
  if (!hasMondayApiKey()) {
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
