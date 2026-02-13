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

// =============================================================================
// Types
// =============================================================================

export interface Env {
  MONDAY_API_KEY: string;
  ENABLE_PROJECT_LINK_SYNC?: string;
  PROJECTS_BOARD_ID?: string;
  ESTIMATE_PROJECT_LINK_COL?: string;
  PROJECT_ESTIMATE_LINK_COL?: string;
  LEAD_PROJECT_LINK_COL?: string;
  ESTIMATE_PROJECT_NUMBER_COL?: string;
  LEAD_PROJECT_NUMBER_COL?: string;
  PROJECT_PROJECT_NUMBER_COL?: string;
}

interface MondayItem {
  id: string;
  name: string;
  bidStatus: string | null;
}

interface CleanupResult {
  wonCount: number;
  openSentCount: number;
  toUpdateCount: number;
  updatedCount: number;
  errors: string[];
}

interface LeadsSyncResult {
  leadsCount: number;
  updatedCount: number;
  skippedCount: number;
  noStatusCount?: number;
  noMappingCount?: number;
  alreadyCorrectCount?: number;
  errors: string[];
}

interface ProjectLinkSyncResult {
  enabled: boolean;
  leadsCount: number;
  linkedLeads: number;
  linkedEstimates: number;
  linkedProjects: number;
  projectNumbersUpdated: number;
  skippedCount: number;
  errors: string[];
}

interface ProjectLinkSyncConfig {
  enabled: boolean;
  projectsBoardId: string;
  estimateProjectLinkCol: string;
  projectEstimateLinkCol: string;
  leadProjectLinkCol: string | null;
  estimateProjectNumberCol: string | null;
  leadProjectNumberCol: string | null;
  projectProjectNumberCol: string | null;
}

// =============================================================================
// Constants
// =============================================================================

const ESTIMATING_BOARD_ID = "7943937851";
const LEADS_BOARD_ID = "7943937841";
const DEFAULT_PROJECTS_BOARD_ID = "8692330900";

// Estimating columns
const BID_STATUS_COLUMN_ID = "deal_stage";
const TARGET_STATUS = "GC Not Awarded";

// Leads columns
const OVERALL_STATUS_COL = "color_mm068kjz";
const ESTIMATE_LINK_COL = "board_relation_mktg3z60";
const MIRRORED_BID_STATUS_COL = "lookup_mktg8b1z";

// Project relationship columns (defaults from shared Monday types)
const DEFAULT_ESTIMATE_PROJECT_LINK_COL = "board_relation_mktgebxf";
const DEFAULT_PROJECT_ESTIMATE_LINK_COL = "board_relation_mktgn7cb";

// Estimating Group IDs
const WON_GROUP = "group_mkthxpv3";
const OPEN_GROUP = "group_mkt5hjqh";
const SENT_GROUP = "group_mkt5fv3a";

// Prefixes to strip when matching project names
const PREFIX_PATTERN =
  /^(TF|PJ|RO|REBID|CFS|INSPECTIONS|LW|MISC|SF|SS)[\s\-_:]+/i;
const LEAD_DEBUG_PATH_RE = /^\/leads\/debug\/(\d+)$/;

// Bid Status -> Overall Status mapping
const BID_TO_OVERALL_STATUS: Record<string, string> = {
  Won: "Won",
  "Pending Won": "Won",
  "Add to Projects": "Won",
  Lost: "Lost",
  "GC Not Awarded": "Lost",
  Duplicates: "Lost",
};

// =============================================================================
// Worker Entry Point
// =============================================================================

export default {
  // HTTP handler for manual trigger / testing
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // GC Cleanup endpoints
    if (url.pathname === "/gc/run") {
      const result = await runCleanup(env);
      return Response.json(result);
    }
    if (url.pathname === "/gc/dry-run") {
      const result = await runCleanup(env, true);
      return Response.json(result);
    }

    // Leads Sync endpoints
    if (url.pathname === "/leads/run") {
      const result = await runLeadsSync(env);
      return Response.json(result);
    }
    if (url.pathname === "/leads/dry-run") {
      const result = await runLeadsSync(env, true);
      return Response.json(result);
    }

    // Project Link Sync endpoints
    if (url.pathname === "/project-links/run") {
      const result = await runProjectLinkSync(env);
      return Response.json(result);
    }
    if (url.pathname === "/project-links/dry-run") {
      const result = await runProjectLinkSync(env, true);
      return Response.json(result);
    }

    // Debug a specific lead
    const leadDebugMatch = url.pathname.match(LEAD_DEBUG_PATH_RE);
    if (leadDebugMatch) {
      const targetId = leadDebugMatch[1];
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
          wouldUpdate:
            mappedStatus !== null && mappedStatus !== lead.currentStatus,
        },
      });
    }

    // Run all
    if (url.pathname === "/run") {
      const gcResult = await runCleanup(env);
      const leadsResult = await runLeadsSync(env);
      const projectLinksResult = await runProjectLinkSync(env);
      return Response.json({
        gc: gcResult,
        leads: leadsResult,
        projectLinks: projectLinksResult,
      });
    }
    if (url.pathname === "/dry-run") {
      const gcResult = await runCleanup(env, true);
      const leadsResult = await runLeadsSync(env, true);
      const projectLinksResult = await runProjectLinkSync(env, true);
      return Response.json({
        gc: gcResult,
        leads: leadsResult,
        projectLinks: projectLinksResult,
      });
    }

    return new Response(
      `Monday Status Sync Worker

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
3. Project Link Sync: Enforces Estimate↔Project and Lead→Project linking + project number propagation`,
      { headers: { "Content-Type": "text/plain" } }
    );
  },

  // Scheduled handler for cron trigger
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

// =============================================================================
// Main Cleanup Logic
// =============================================================================

async function runCleanup(env: Env, dryRun = false): Promise<CleanupResult> {
  const result: CleanupResult = {
    wonCount: 0,
    openSentCount: 0,
    toUpdateCount: 0,
    updatedCount: 0,
    errors: [],
  };

  try {
    // 1. Get all Won items
    console.log("[GC Cleanup] Fetching Won items...");
    const wonItems = await getItemsFromGroup(env, WON_GROUP);
    result.wonCount = wonItems.length;
    console.log(`[GC Cleanup] Found ${wonItems.length} Won items`);

    // Build set of base names from Won items
    const wonBaseNames = new Set(wonItems.map((i) => getBaseName(i.name)));

    // 2. Get Open + Sent items
    console.log("[GC Cleanup] Fetching Open + Sent items...");
    const openItems = await getItemsFromGroup(env, OPEN_GROUP);
    const sentItems = await getItemsFromGroup(env, SENT_GROUP);
    const openSentItems = [...openItems, ...sentItems];
    result.openSentCount = openSentItems.length;
    console.log(`[GC Cleanup] Found ${openSentItems.length} Open/Sent items`);

    // 3. Find items to update (matching Won base names, not already GC Not Awarded)
    const toUpdate = openSentItems.filter((item) => {
      const baseName = getBaseName(item.name);
      return wonBaseNames.has(baseName) && item.bidStatus !== TARGET_STATUS;
    });

    result.toUpdateCount = toUpdate.length;
    console.log(`[GC Cleanup] ${toUpdate.length} items match Won projects`);

    if (dryRun) {
      console.log("[GC Cleanup] Dry run - not updating");
      return result;
    }

    // 4. Update items to GC Not Awarded
    for (const item of toUpdate) {
      try {
        await updateItemStatus(env, item.id, TARGET_STATUS);
        result.updatedCount++;
        console.log(`[GC Cleanup] Updated: ${item.name}`);

        // Small delay to avoid rate limiting
        await sleep(200);
      } catch (error) {
        const msg = `Failed to update ${item.name}: ${error}`;
        result.errors.push(msg);
        console.error(`[GC Cleanup] ${msg}`);
      }
    }

    return result;
  } catch (error) {
    result.errors.push(`Cleanup failed: ${error}`);
    console.error(`[GC Cleanup] ${error}`);
    return result;
  }
}

// =============================================================================
// Leads Sync Logic
// =============================================================================

async function runLeadsSync(
  env: Env,
  dryRun = false
): Promise<LeadsSyncResult> {
  const result: LeadsSyncResult = {
    leadsCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errors: [],
  };

  try {
    // 1. Get all Leads with their linked estimate IDs
    console.log("[Leads Sync] Fetching leads...");
    const leads = await getLeadsWithEstimates(env);
    result.leadsCount = leads.length;
    console.log(
      `[Leads Sync] Found ${leads.length} leads with linked estimates`
    );

    // 2. Use mirrored bid status from leads (no separate estimate fetch needed)
    let noStatusCount = 0;
    let noMappingCount = 0;
    let alreadyCorrectCount = 0;
    for (const lead of leads) {
      const bidStatus = lead.mirroredBidStatus;
      if (!bidStatus) {
        noStatusCount++;
      }
      const newOverallStatus = bidStatus
        ? BID_TO_OVERALL_STATUS[bidStatus]
        : null;

      // Skip if no mapping or already correct
      if (!newOverallStatus) {
        if (bidStatus) {
          noMappingCount++;
        }
        result.skippedCount++;
        continue;
      }
      if (newOverallStatus === lead.currentStatus) {
        alreadyCorrectCount++;
        result.skippedCount++;
        continue;
      }

      if (dryRun) {
        console.log(
          `[Leads Sync] Would update "${lead.name}": ${lead.currentStatus || "-"} → ${newOverallStatus}`
        );
        result.updatedCount++;
        continue;
      }

      try {
        await updateLeadOverallStatus(env, lead.id, newOverallStatus);
        console.log(
          `[Leads Sync] Updated "${lead.name}": → ${newOverallStatus}`
        );
        result.updatedCount++;
        await sleep(200);
      } catch (error) {
        const msg = `Failed to update ${lead.name}: ${error}`;
        result.errors.push(msg);
        console.error(`[Leads Sync] ${msg}`);
      }
    }

    console.log(
      `[Leads Sync] Breakdown: noStatus=${noStatusCount} noMapping=${noMappingCount} alreadyCorrect=${alreadyCorrectCount} updated=${result.updatedCount}`
    );
    return { ...result, noStatusCount, noMappingCount, alreadyCorrectCount };
  } catch (error) {
    result.errors.push(`Leads sync failed: ${error}`);
    console.error(`[Leads Sync] ${error}`);
    return result;
  }
}

// =============================================================================
// Project Link Sync Logic
// =============================================================================

interface EstimateSnapshot {
  id: string;
  linkedProjectIds: string[];
  projectNumber: string | null;
}

interface ProjectSnapshot {
  id: string;
  linkedEstimateIds: string[];
  projectNumber: string | null;
}

async function runProjectLinkSync(
  env: Env,
  dryRun = false
): Promise<ProjectLinkSyncResult> {
  const config = getProjectLinkSyncConfig(env);
  const result: ProjectLinkSyncResult = {
    enabled: config.enabled,
    leadsCount: 0,
    linkedLeads: 0,
    linkedEstimates: 0,
    linkedProjects: 0,
    projectNumbersUpdated: 0,
    skippedCount: 0,
    errors: [],
  };

  if (!config.enabled) {
    return result;
  }

  try {
    console.log("[Project Link Sync] Fetching leads...");
    const leads = await getLeadsWithEstimates(env, {
      leadProjectLinkCol: config.leadProjectLinkCol,
      leadProjectNumberCol: config.leadProjectNumberCol,
    });
    result.leadsCount = leads.length;
    console.log(
      `[Project Link Sync] Found ${leads.length} leads with linked estimates`
    );

    const estimateIds = [...new Set(leads.map((lead) => lead.estimateId))];
    if (estimateIds.length === 0) {
      return result;
    }

    const estimateSnapshots = await getEstimateSnapshots(
      env,
      estimateIds,
      config
    );

    const projectIds = new Set<string>();
    for (const estimate of estimateSnapshots.values()) {
      for (const projectId of estimate.linkedProjectIds) {
        projectIds.add(projectId);
      }
    }
    for (const lead of leads) {
      for (const projectId of lead.linkedProjectIds) {
        projectIds.add(projectId);
      }
    }

    const projectSnapshots = await getProjectSnapshots(
      env,
      [...projectIds],
      config
    );

    for (const lead of leads) {
      try {
        const estimate = estimateSnapshots.get(lead.estimateId);
        if (!estimate) {
          result.skippedCount++;
          continue;
        }

        const canonicalProjectId =
          estimate.linkedProjectIds[0] ?? lead.linkedProjectIds[0] ?? null;

        if (!canonicalProjectId) {
          result.skippedCount++;
          continue;
        }

        let changed = false;

        // Ensure Estimate -> Project relation exists
        if (!estimate.linkedProjectIds.includes(canonicalProjectId)) {
          const nextProjectIds = appendUniqueId(
            estimate.linkedProjectIds,
            canonicalProjectId
          );

          if (dryRun) {
            console.log(
              `[Project Link Sync] Would link estimate ${estimate.id} -> project ${canonicalProjectId}`
            );
          } else {
            await updateBoardRelation(
              env,
              ESTIMATING_BOARD_ID,
              estimate.id,
              config.estimateProjectLinkCol,
              nextProjectIds
            );
            await sleep(200);
          }

          estimate.linkedProjectIds = nextProjectIds;
          result.linkedEstimates++;
          changed = true;
        }

        // Ensure Lead -> Project relation exists (when configured)
        if (
          config.leadProjectLinkCol &&
          !lead.linkedProjectIds.includes(canonicalProjectId)
        ) {
          const nextProjectIds = appendUniqueId(
            lead.linkedProjectIds,
            canonicalProjectId
          );

          if (dryRun) {
            console.log(
              `[Project Link Sync] Would link lead ${lead.id} -> project ${canonicalProjectId}`
            );
          } else {
            await updateBoardRelation(
              env,
              LEADS_BOARD_ID,
              lead.id,
              config.leadProjectLinkCol,
              nextProjectIds
            );
            await sleep(200);
          }

          lead.linkedProjectIds = nextProjectIds;
          result.linkedLeads++;
          changed = true;
        }

        let project = projectSnapshots.get(canonicalProjectId);
        if (!project) {
          const fallbackProject = await getProjectSnapshots(
            env,
            [canonicalProjectId],
            config
          );
          project = fallbackProject.get(canonicalProjectId);
          if (project) {
            projectSnapshots.set(canonicalProjectId, project);
          }
        }

        // Ensure Project -> Estimate relation exists
        if (project && !project.linkedEstimateIds.includes(estimate.id)) {
          const nextEstimateIds = appendUniqueId(
            project.linkedEstimateIds,
            estimate.id
          );

          if (dryRun) {
            console.log(
              `[Project Link Sync] Would link project ${project.id} -> estimate ${estimate.id}`
            );
          } else {
            await updateBoardRelation(
              env,
              config.projectsBoardId,
              project.id,
              config.projectEstimateLinkCol,
              nextEstimateIds
            );
            await sleep(200);
          }

          project.linkedEstimateIds = nextEstimateIds;
          result.linkedProjects++;
          changed = true;
        }

        // Propagate canonical project number if available
        const canonicalProjectNumber = normalizeProjectNumber(
          project?.projectNumber ?? estimate.projectNumber ?? lead.projectNumber
        );

        if (canonicalProjectNumber) {
          if (
            config.projectProjectNumberCol &&
            project &&
            normalizeProjectNumber(project.projectNumber) !==
              canonicalProjectNumber
          ) {
            if (dryRun) {
              console.log(
                `[Project Link Sync] Would set project ${project.id} number -> ${canonicalProjectNumber}`
              );
            } else {
              await updateTextColumn(
                env,
                config.projectsBoardId,
                project.id,
                config.projectProjectNumberCol,
                canonicalProjectNumber
              );
              await sleep(200);
            }
            project.projectNumber = canonicalProjectNumber;
            result.projectNumbersUpdated++;
            changed = true;
          }

          if (
            config.estimateProjectNumberCol &&
            normalizeProjectNumber(estimate.projectNumber) !==
              canonicalProjectNumber
          ) {
            if (dryRun) {
              console.log(
                `[Project Link Sync] Would set estimate ${estimate.id} number -> ${canonicalProjectNumber}`
              );
            } else {
              await updateTextColumn(
                env,
                ESTIMATING_BOARD_ID,
                estimate.id,
                config.estimateProjectNumberCol,
                canonicalProjectNumber
              );
              await sleep(200);
            }
            estimate.projectNumber = canonicalProjectNumber;
            result.projectNumbersUpdated++;
            changed = true;
          }

          if (
            config.leadProjectNumberCol &&
            normalizeProjectNumber(lead.projectNumber) !==
              canonicalProjectNumber
          ) {
            if (dryRun) {
              console.log(
                `[Project Link Sync] Would set lead ${lead.id} number -> ${canonicalProjectNumber}`
              );
            } else {
              await updateTextColumn(
                env,
                LEADS_BOARD_ID,
                lead.id,
                config.leadProjectNumberCol,
                canonicalProjectNumber
              );
              await sleep(200);
            }
            lead.projectNumber = canonicalProjectNumber;
            result.projectNumbersUpdated++;
            changed = true;
          }
        }

        if (!changed) {
          result.skippedCount++;
        }
      } catch (error) {
        const message = `Failed to process lead ${lead.name}: ${error}`;
        result.errors.push(message);
        console.error(`[Project Link Sync] ${message}`);
      }
    }

    return result;
  } catch (error) {
    result.errors.push(`Project link sync failed: ${error}`);
    console.error(`[Project Link Sync] ${error}`);
    return result;
  }
}

interface LeadWithEstimate {
  id: string;
  name: string;
  estimateId: string;
  currentStatus: string | null;
  mirroredBidStatus: string | null;
  linkedProjectIds: string[];
  projectNumber: string | null;
}

interface LeadFetchOptions {
  leadProjectLinkCol?: string | null;
  leadProjectNumberCol?: string | null;
}

interface ItemColumnValue {
  id: string;
  text?: string | null;
  linked_item_ids?: string[];
  label?: string;
  display_value?: string | null;
}

async function getLeadsWithEstimates(
  env: Env,
  options: LeadFetchOptions = {}
): Promise<LeadWithEstimate[]> {
  const leads: LeadWithEstimate[] = [];
  let cursor: string | null = null;
  const columnIds = [
    ESTIMATE_LINK_COL,
    OVERALL_STATUS_COL,
    MIRRORED_BID_STATUS_COL,
    options.leadProjectLinkCol ?? null,
    options.leadProjectNumberCol ?? null,
  ].filter((columnId): columnId is string => Boolean(columnId));
  const columnIdsLiteral = columnIds
    .map((columnId) => `"${columnId}"`)
    .join(", ");

  do {
    const cursorPart = cursor ? `, cursor: "${cursor}"` : "";

    const query = `
      query {
        boards(ids: ${LEADS_BOARD_ID}) {
          items_page(limit: 200${cursorPart}) {
            cursor
            items {
              id
              name
              column_values(ids: [${columnIdsLiteral}]) {
                id
                text
                ... on BoardRelationValue { linked_item_ids }
                ... on StatusValue { label }
                ... on MirrorValue { display_value }
              }
            }
          }
        }
      }
    `;

    const data = (await mondayQuery(env, query)) as {
      boards: Array<{
        items_page: {
          cursor: string | null;
          items: Array<{
            id: string;
            name: string;
            column_values: ItemColumnValue[];
          }>;
        };
      }>;
    };

    const page = data.boards?.[0]?.items_page;
    if (page?.items) {
      for (const item of page.items) {
        const estimateCol = item.column_values.find(
          (c) => c.id === ESTIMATE_LINK_COL
        );
        const statusCol = item.column_values.find(
          (c) => c.id === OVERALL_STATUS_COL
        );
        const mirrorCol = item.column_values.find(
          (c) => c.id === MIRRORED_BID_STATUS_COL
        );
        const leadProjectCol = options.leadProjectLinkCol
          ? item.column_values.find((c) => c.id === options.leadProjectLinkCol)
          : undefined;
        const projectNumberCol = options.leadProjectNumberCol
          ? item.column_values.find(
              (c) => c.id === options.leadProjectNumberCol
            )
          : undefined;

        if (estimateCol?.linked_item_ids?.[0]) {
          leads.push({
            id: item.id,
            name: item.name,
            estimateId: estimateCol.linked_item_ids[0],
            currentStatus: statusCol?.label ?? statusCol?.text ?? null,
            mirroredBidStatus:
              mirrorCol?.display_value ?? mirrorCol?.text ?? null,
            linkedProjectIds: leadProjectCol?.linked_item_ids ?? [],
            projectNumber: normalizeProjectNumber(
              projectNumberCol?.text ?? null
            ),
          });
        }
      }
    }
    cursor = page?.cursor ?? null;
  } while (cursor);

  return leads;
}

async function _getEstimateStatuses(
  env: Env,
  estimateIds: string[]
): Promise<Map<string, string>> {
  const statusMap = new Map<string, string>();
  const items = await getItemsColumnValues(env, estimateIds, [
    BID_STATUS_COLUMN_ID,
  ]);

  for (const item of items) {
    const statusCol = item.column_values.find(
      (columnValue) => columnValue.id === BID_STATUS_COLUMN_ID
    );
    const status = statusCol?.label ?? statusCol?.text ?? null;
    if (status) {
      statusMap.set(item.id, status);
    }
  }

  return statusMap;
}

async function getEstimateSnapshots(
  env: Env,
  estimateIds: string[],
  config: ProjectLinkSyncConfig
): Promise<Map<string, EstimateSnapshot>> {
  const columnIds = [
    config.estimateProjectLinkCol,
    config.estimateProjectNumberCol,
  ].filter((columnId): columnId is string => Boolean(columnId));

  const items = await getItemsColumnValues(env, estimateIds, columnIds);
  const snapshots = new Map<string, EstimateSnapshot>();

  for (const item of items) {
    const projectLinkCol = item.column_values.find(
      (columnValue) => columnValue.id === config.estimateProjectLinkCol
    );
    const projectNumberCol = config.estimateProjectNumberCol
      ? item.column_values.find(
          (columnValue) => columnValue.id === config.estimateProjectNumberCol
        )
      : undefined;

    snapshots.set(item.id, {
      id: item.id,
      linkedProjectIds: projectLinkCol?.linked_item_ids ?? [],
      projectNumber: normalizeProjectNumber(projectNumberCol?.text ?? null),
    });
  }

  return snapshots;
}

async function getProjectSnapshots(
  env: Env,
  projectIds: string[],
  config: ProjectLinkSyncConfig
): Promise<Map<string, ProjectSnapshot>> {
  const snapshots = new Map<string, ProjectSnapshot>();
  if (projectIds.length === 0) {
    return snapshots;
  }

  const columnIds = [
    config.projectEstimateLinkCol,
    config.projectProjectNumberCol,
  ].filter((columnId): columnId is string => Boolean(columnId));

  const items = await getItemsColumnValues(env, projectIds, columnIds);

  for (const item of items) {
    const estimateLinkCol = item.column_values.find(
      (columnValue) => columnValue.id === config.projectEstimateLinkCol
    );
    const projectNumberCol = config.projectProjectNumberCol
      ? item.column_values.find(
          (columnValue) => columnValue.id === config.projectProjectNumberCol
        )
      : undefined;

    snapshots.set(item.id, {
      id: item.id,
      linkedEstimateIds: estimateLinkCol?.linked_item_ids ?? [],
      projectNumber: normalizeProjectNumber(projectNumberCol?.text ?? null),
    });
  }

  return snapshots;
}

async function getItemsColumnValues(
  env: Env,
  itemIds: string[],
  columnIds: string[]
): Promise<Array<{ id: string; column_values: ItemColumnValue[] }>> {
  if (itemIds.length === 0 || columnIds.length === 0) {
    return [];
  }

  const items: Array<{ id: string; column_values: ItemColumnValue[] }> = [];
  const BATCH_SIZE = 50;
  const columnIdsLiteral = columnIds
    .map((columnId) => `"${columnId}"`)
    .join(", ");

  for (let index = 0; index < itemIds.length; index += BATCH_SIZE) {
    const batchIds = itemIds.slice(index, index + BATCH_SIZE);
    const idsLiteral = batchIds.join(",");

    const query = `
      query {
        items(ids: [${idsLiteral}]) {
          id
          column_values(ids: [${columnIdsLiteral}]) {
            id
            text
            ... on BoardRelationValue { linked_item_ids }
            ... on StatusValue { label }
          }
        }
      }
    `;

    const data = (await mondayQuery(env, query)) as {
      items: Array<{ id: string; column_values: ItemColumnValue[] }>;
    };
    items.push(...(data.items ?? []));
  }

  return items;
}

async function updateLeadOverallStatus(
  env: Env,
  leadId: string,
  status: string
): Promise<void> {
  const escapedStatus = escapeGraphQLString(status);
  const query = `
    mutation {
      change_simple_column_value(
        board_id: ${LEADS_BOARD_ID}
        item_id: ${leadId}
        column_id: "${OVERALL_STATUS_COL}"
        value: "${escapedStatus}"
      ) { id }
    }
  `;

  await mondayQuery(env, query);
}

async function updateTextColumn(
  env: Env,
  boardId: string,
  itemId: string,
  columnId: string,
  value: string
): Promise<void> {
  const escapedValue = escapeGraphQLString(value);
  const query = `
    mutation {
      change_simple_column_value(
        board_id: ${boardId}
        item_id: ${itemId}
        column_id: "${columnId}"
        value: "${escapedValue}"
      ) { id }
    }
  `;
  await mondayQuery(env, query);
}

async function updateBoardRelation(
  env: Env,
  boardId: string,
  itemId: string,
  columnId: string,
  linkedItemIds: string[]
): Promise<void> {
  const relationValue = JSON.stringify({ item_ids: linkedItemIds });
  const query = `
    mutation {
      change_column_value(
        board_id: ${boardId}
        item_id: ${itemId}
        column_id: "${columnId}"
        value: ${JSON.stringify(relationValue)}
      ) { id }
    }
  `;

  await mondayQuery(env, query);
}

// =============================================================================
// Monday API Helpers
// =============================================================================

async function mondayQuery(env: Env, query: string): Promise<unknown> {
  const response = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: env.MONDAY_API_KEY,
      "API-Version": "2026-01",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Monday API error: ${response.status}`);
  }

  const json = (await response.json()) as {
    data?: unknown;
    errors?: unknown[];
  };

  if (json.errors) {
    throw new Error(`Monday API errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

async function getItemsFromGroup(
  env: Env,
  groupId: string
): Promise<MondayItem[]> {
  const items: MondayItem[] = [];
  let cursor: string | null = null;

  do {
    const cursorPart = cursor ? `, cursor: "${cursor}"` : "";

    const query = `
      query {
        boards(ids: ${ESTIMATING_BOARD_ID}) {
          groups(ids: "${groupId}") {
            items_page(limit: 500${cursorPart}) {
              cursor
              items {
                id
                name
                column_values(ids: ["${BID_STATUS_COLUMN_ID}"]) {
                  ... on StatusValue { label }
                }
              }
            }
          }
        }
      }
    `;

    const data = (await mondayQuery(env, query)) as {
      boards: Array<{
        groups: Array<{
          items_page: {
            cursor: string | null;
            items: Array<{
              id: string;
              name: string;
              column_values: Array<{ label?: string }>;
            }>;
          };
        }>;
      }>;
    };

    const page = data.boards?.[0]?.groups?.[0]?.items_page;
    if (page?.items) {
      for (const item of page.items) {
        items.push({
          id: item.id,
          name: item.name,
          bidStatus: item.column_values?.[0]?.label ?? null,
        });
      }
    }
    cursor = page?.cursor ?? null;
  } while (cursor);

  return items;
}

async function updateItemStatus(
  env: Env,
  itemId: string,
  status: string
): Promise<void> {
  const escapedStatus = escapeGraphQLString(status);
  const query = `
    mutation {
      change_simple_column_value(
        board_id: ${ESTIMATING_BOARD_ID}
        item_id: ${itemId}
        column_id: "${BID_STATUS_COLUMN_ID}"
        value: "${escapedStatus}"
      ) { id }
    }
  `;

  await mondayQuery(env, query);
}

// =============================================================================
// Utilities
// =============================================================================

function getProjectLinkSyncConfig(env: Env): ProjectLinkSyncConfig {
  return {
    enabled: parseBoolean(env.ENABLE_PROJECT_LINK_SYNC),
    projectsBoardId: env.PROJECTS_BOARD_ID ?? DEFAULT_PROJECTS_BOARD_ID,
    estimateProjectLinkCol:
      env.ESTIMATE_PROJECT_LINK_COL ?? DEFAULT_ESTIMATE_PROJECT_LINK_COL,
    projectEstimateLinkCol:
      env.PROJECT_ESTIMATE_LINK_COL ?? DEFAULT_PROJECT_ESTIMATE_LINK_COL,
    leadProjectLinkCol: env.LEAD_PROJECT_LINK_COL ?? null,
    estimateProjectNumberCol: env.ESTIMATE_PROJECT_NUMBER_COL ?? null,
    leadProjectNumberCol: env.LEAD_PROJECT_NUMBER_COL ?? null,
    projectProjectNumberCol: env.PROJECT_PROJECT_NUMBER_COL ?? null,
  };
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function appendUniqueId(ids: string[], id: string): string[] {
  return [...new Set([...ids, id])];
}

function normalizeProjectNumber(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function escapeGraphQLString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

function getBaseName(name: string): string {
  return name.replace(PREFIX_PATTERN, "").trim().toUpperCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
