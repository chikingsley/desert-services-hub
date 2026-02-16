/// <reference types="@cloudflare/workers-types" />

/**
 * Desert Services Monday Status Sync Worker
 *
 * Keeps Monday.com board statuses in sync. Runs hourly.
 *
 * Jobs:
 * 1. GC Cleanup: Find estimates in Open/Sent that match a Won project name,
 *    and update them to "GC Not Awarded" status.
 * 2. Leads Sync: Sync Leads "Overall Status" from linked Estimate "Bid Status"
 *    - Won/Pending Won/Add to Projects → Won
 *    - Lost/GC Not Awarded/Duplicates → Lost
 * 3. Project Link Sync (optional): Enforce Estimate↔Project and Lead→Project
 *    linkage, plus project number propagation when columns are configured.
 *
 * NOTE: This worker ONLY updates Monday.com statuses. SharePoint folder moves
 * are handled by ds-estimates-sync-worker separately.
 *
 * Cron: 15 * * * * (hourly at :15)
 */

import { runCleanup } from "./gc-cleanup";
import { getLeadsWithEstimates, runLeadsSync } from "./leads-sync";
import { runProjectLinkSync } from "./project-link-sync";
import type { Env } from "./types";
import { BID_TO_OVERALL_STATUS } from "./utils";

const LEAD_DEBUG_PATH_RE = /^\/leads\/debug\/(\d+)$/;

const HELP_TEXT = `Monday Status Sync Worker

Endpoints:
  /dry-run       - Preview all syncs
  /run           - Execute all syncs

  /gc/dry-run    - Preview GC cleanup only
  /gc/run        - Execute GC cleanup only

  /leads/dry-run - Preview Leads sync only
  /leads/run     - Execute Leads sync only

  /project-links/dry-run - Preview Project link sync only
  /project-links/run     - Execute Project link sync only

Cron: Hourly at :15

Jobs:
1. GC Cleanup: Updates competing estimates to "GC Not Awarded"
2. Leads Sync: Syncs Leads Overall Status from Estimate Bid Status (Won/Lost)
3. Project Link Sync: Enforces Estimate↔Project and Lead→Project linking + project number propagation`;

// =============================================================================
// Route Handlers
// =============================================================================

async function handleGcRoute(env: Env, dryRun: boolean): Promise<Response> {
  const result = await runCleanup(env, dryRun);
  return Response.json(result);
}

async function handleLeadsRoute(env: Env, dryRun: boolean): Promise<Response> {
  const result = await runLeadsSync(env, dryRun);
  return Response.json(result);
}

async function handleProjectLinksRoute(
  env: Env,
  dryRun: boolean
): Promise<Response> {
  const result = await runProjectLinkSync(env, dryRun);
  return Response.json(result);
}

async function handleRunAllRoute(env: Env, dryRun: boolean): Promise<Response> {
  const gcResult = await runCleanup(env, dryRun);
  const leadsResult = await runLeadsSync(env, dryRun);
  const projectLinksResult = await runProjectLinkSync(env, dryRun);
  return Response.json({
    gc: gcResult,
    leads: leadsResult,
    projectLinks: projectLinksResult,
  });
}

async function handleLeadDebug(env: Env, targetId: string): Promise<Response> {
  const leads = await getLeadsWithEstimates(env);
  const lead = leads.find((l) => l.id === targetId);
  if (!lead) {
    return Response.json({
      error: "Lead not found in fetched leads",
      totalLeads: leads.length,
    });
  }

  const bidStatus = lead.mirroredBidStatus;
  const mappedStatus = bidStatus
    ? (BID_TO_OVERALL_STATUS[bidStatus] ?? null)
    : null;

  return Response.json({
    lead: {
      id: lead.id,
      name: lead.name,
      estimateId: lead.estimateId,
      currentStatus: lead.currentStatus,
      mirroredBidStatus: lead.mirroredBidStatus,
    },
    mapping: {
      mappedStatus,
      wouldUpdate: mappedStatus !== null && mappedStatus !== lead.currentStatus,
    },
  });
}

// =============================================================================
// Router
// =============================================================================

const ROUTES: Record<string, (env: Env) => Promise<Response>> = {
  "/gc/run": (env) => handleGcRoute(env, false),
  "/gc/dry-run": (env) => handleGcRoute(env, true),
  "/leads/run": (env) => handleLeadsRoute(env, false),
  "/leads/dry-run": (env) => handleLeadsRoute(env, true),
  "/project-links/run": (env) => handleProjectLinksRoute(env, false),
  "/project-links/dry-run": (env) => handleProjectLinksRoute(env, true),
  "/run": (env) => handleRunAllRoute(env, false),
  "/dry-run": (env) => handleRunAllRoute(env, true),
};

// =============================================================================
// Worker Entry Point
// =============================================================================

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const url = new URL(request.url);

    // Check static routes
    const handler = ROUTES[url.pathname];
    if (handler) {
      return handler(env);
    }

    // Check dynamic lead debug route
    const leadDebugMatch = url.pathname.match(LEAD_DEBUG_PATH_RE);
    if (leadDebugMatch) {
      return handleLeadDebug(env, leadDebugMatch[1]);
    }

    return new Response(HELP_TEXT, {
      headers: { "Content-Type": "text/plain" },
    });
  },

  scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): void {
    ctx.waitUntil(
      Promise.all([
        runCleanup(env).then((result) => {
          console.log(
            `[GC Cleanup] Complete: ${result.updatedCount} updated, ${result.errors.length} errors`
          );
        }),
        (async () => {
          const leadsResult = await runLeadsSync(env);
          console.log(
            `[Leads Sync] Complete: ${leadsResult.updatedCount} updated, ${leadsResult.errors.length} errors`
          );

          const projectLinkResult = await runProjectLinkSync(env);
          if (!projectLinkResult.enabled) {
            console.log("[Project Link Sync] Skipped (disabled)");
            return;
          }
          console.log(
            `[Project Link Sync] Complete: ${projectLinkResult.linkedLeads + projectLinkResult.linkedEstimates + projectLinkResult.linkedProjects} link updates, ${projectLinkResult.projectNumbersUpdated} project numbers updated, ${projectLinkResult.errors.length} errors`
          );
        })(),
      ])
    );
  },
};

export type { Env } from "./types";
