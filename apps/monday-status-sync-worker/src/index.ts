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
}

interface MondayItem {
  id: string;
  name: string;
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
  errors: string[];
}

// =============================================================================
// Constants
// =============================================================================

const ESTIMATING_BOARD_ID = "7943937851";
const LEADS_BOARD_ID = "7943937841";

// Estimating columns
const BID_STATUS_COLUMN_ID = "deal_stage";
const TARGET_STATUS = "GC Not Awarded";

// Leads columns
const OVERALL_STATUS_COL = "color_mm068kjz";
const ESTIMATE_LINK_COL = "board_relation_mktg3z60";

// Estimating Group IDs
const WON_GROUP = "group_mkthxpv3";
const OPEN_GROUP = "group_mkt5hjqh";
const SENT_GROUP = "group_mkt5fv3a";

// Prefixes to strip when matching project names
const PREFIX_PATTERN =
  /^(TF|PJ|RO|REBID|CFS|INSPECTIONS|LW|MISC|SF|SS)[\s\-_:]+/i;

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

    // Run all
    if (url.pathname === "/run") {
      const gcResult = await runCleanup(env);
      const leadsResult = await runLeadsSync(env);
      return Response.json({ gc: gcResult, leads: leadsResult });
    }
    if (url.pathname === "/dry-run") {
      const gcResult = await runCleanup(env, true);
      const leadsResult = await runLeadsSync(env, true);
      return Response.json({ gc: gcResult, leads: leadsResult });
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

Cron: Hourly at :15

Jobs:
1. GC Cleanup: Updates competing estimates to "GC Not Awarded"
2. Leads Sync: Syncs Leads Overall Status from Estimate Bid Status (Won/Lost)`,
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
        runLeadsSync(env).then((result) => {
          console.log(
            `[Leads Sync] Complete: ${result.updatedCount} updated, ${result.errors.length} errors`
          );
        }),
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

    // 3. Find items to update (matching Won base names)
    const toUpdate = openSentItems.filter((item) => {
      const baseName = getBaseName(item.name);
      return wonBaseNames.has(baseName);
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

    // 2. Get unique estimate IDs and fetch their statuses
    const estimateIds = [...new Set(leads.map((l) => l.estimateId))];
    console.log(
      `[Leads Sync] Fetching ${estimateIds.length} estimate statuses...`
    );
    const estimateStatuses = await getEstimateStatuses(env, estimateIds);

    // 3. Update leads where status mapping applies
    for (const lead of leads) {
      const bidStatus = estimateStatuses.get(lead.estimateId);
      const newOverallStatus = bidStatus
        ? BID_TO_OVERALL_STATUS[bidStatus]
        : null;

      // Skip if no mapping or already correct
      if (!newOverallStatus || newOverallStatus === lead.currentStatus) {
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

    return result;
  } catch (error) {
    result.errors.push(`Leads sync failed: ${error}`);
    console.error(`[Leads Sync] ${error}`);
    return result;
  }
}

interface LeadWithEstimate {
  id: string;
  name: string;
  estimateId: string;
  currentStatus: string | null;
}

async function getLeadsWithEstimates(env: Env): Promise<LeadWithEstimate[]> {
  const leads: LeadWithEstimate[] = [];
  let cursor: string | null = null;

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
              column_values(ids: ["${ESTIMATE_LINK_COL}", "${OVERALL_STATUS_COL}"]) {
                id
                ... on BoardRelationValue { linked_item_ids }
                ... on StatusValue { label }
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
            column_values: Array<{
              id: string;
              linked_item_ids?: string[];
              label?: string;
            }>;
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

        if (estimateCol?.linked_item_ids?.[0]) {
          leads.push({
            id: item.id,
            name: item.name,
            estimateId: estimateCol.linked_item_ids[0],
            currentStatus: statusCol?.label ?? null,
          });
        }
      }
    }
    cursor = page?.cursor ?? null;
  } while (cursor);

  return leads;
}

async function getEstimateStatuses(
  env: Env,
  estimateIds: string[]
): Promise<Map<string, string>> {
  const statusMap = new Map<string, string>();
  const BATCH = 50;

  for (let i = 0; i < estimateIds.length; i += BATCH) {
    const batch = estimateIds.slice(i, i + BATCH);
    const idsStr = batch.join(",");

    const query = `
      query {
        items(ids: [${idsStr}]) {
          id
          column_values(ids: ["${BID_STATUS_COLUMN_ID}"]) {
            id
            ... on StatusValue { label }
          }
        }
      }
    `;

    const data = (await mondayQuery(env, query)) as {
      items: Array<{
        id: string;
        column_values: Array<{ id: string; label?: string }>;
      }>;
    };

    for (const item of data.items) {
      const statusCol = item.column_values.find(
        (c) => c.id === BID_STATUS_COLUMN_ID
      );
      if (statusCol?.label) {
        statusMap.set(item.id, statusCol.label);
      }
    }
  }

  return statusMap;
}

async function updateLeadOverallStatus(
  env: Env,
  leadId: string,
  status: string
): Promise<void> {
  const query = `
    mutation {
      change_simple_column_value(
        board_id: ${LEADS_BOARD_ID}
        item_id: ${leadId}
        column_id: "${OVERALL_STATUS_COL}"
        value: "${status}"
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
            items: Array<{ id: string; name: string }>;
          };
        }>;
      }>;
    };

    const page = data.boards?.[0]?.groups?.[0]?.items_page;
    if (page?.items) {
      items.push(...page.items);
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
  const escapedStatus = status.replace(/"/g, '\\"');
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

function getBaseName(name: string): string {
  return name.replace(PREFIX_PATTERN, "").trim().toUpperCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
