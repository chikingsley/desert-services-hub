/**
 * Leads Sync Job
 *
 * Syncs Leads "Overall Status" from linked Estimate "Bid Status":
 *   - Won/Pending Won/Add to Projects → Won
 *   - Lost/GC Not Awarded/Duplicates → Lost
 */

import {
  ESTIMATE_LINK_COL,
  LEADS_BOARD_ID,
  MIRRORED_BID_STATUS_COL,
  mondayQuery,
  OVERALL_STATUS_COL,
  updateLeadOverallStatus,
} from "./monday-api";
import type {
  Env,
  ItemColumnValue,
  LeadFetchOptions,
  LeadsSyncResult,
  LeadWithEstimate,
} from "./types";
import { BID_TO_OVERALL_STATUS, normalizeProjectNumber, sleep } from "./utils";

// =============================================================================
// Main Job
// =============================================================================

export async function runLeadsSync(
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
    console.log("[Leads Sync] Fetching leads...");
    const leads = await getLeadsWithEstimates(env);
    result.leadsCount = leads.length;
    console.log(
      `[Leads Sync] Found ${leads.length} leads with linked estimates`
    );

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
// Lead Fetching
// =============================================================================

/**
 * Fetch all leads with their linked estimate data.
 *
 * Paginates through the Leads board and extracts column values per item.
 * Optional columns (project link, project number) are included when
 * the caller provides the column IDs.
 */
export async function getLeadsWithEstimates(
  env: Env,
  options: LeadFetchOptions = {}
): Promise<LeadWithEstimate[]> {
  const leads: LeadWithEstimate[] = [];
  let cursor: string | null = null;

  const columnIds = buildColumnIds(options);
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
        const lead = parseLeadFromItem(item, options);
        if (lead) {
          leads.push(lead);
        }
      }
    }
    cursor = page?.cursor ?? null;
  } while (cursor);

  return leads;
}

// =============================================================================
// Helpers
// =============================================================================

function buildColumnIds(options: LeadFetchOptions): string[] {
  return [
    ESTIMATE_LINK_COL,
    OVERALL_STATUS_COL,
    MIRRORED_BID_STATUS_COL,
    options.leadProjectLinkCol ?? null,
    options.leadProjectNumberCol ?? null,
  ].filter((columnId): columnId is string => Boolean(columnId));
}

function findColumnValue(
  columns: ItemColumnValue[],
  columnId: string | null | undefined
): ItemColumnValue | undefined {
  if (!columnId) {
    return undefined;
  }
  return columns.find((c) => c.id === columnId);
}

/**
 * Parse a raw Monday item into a LeadWithEstimate.
 * Returns null if the item has no linked estimate.
 */
function parseLeadFromItem(
  item: { id: string; name: string; column_values: ItemColumnValue[] },
  options: LeadFetchOptions
): LeadWithEstimate | null {
  const estimateCol = findColumnValue(item.column_values, ESTIMATE_LINK_COL);
  const firstEstimateId = estimateCol?.linked_item_ids?.[0];

  if (!firstEstimateId) {
    return null;
  }

  const statusCol = findColumnValue(item.column_values, OVERALL_STATUS_COL);
  const mirrorCol = findColumnValue(
    item.column_values,
    MIRRORED_BID_STATUS_COL
  );
  const projectLinkCol = findColumnValue(
    item.column_values,
    options.leadProjectLinkCol
  );
  const projectNumberCol = findColumnValue(
    item.column_values,
    options.leadProjectNumberCol
  );

  return {
    id: item.id,
    name: item.name,
    estimateId: firstEstimateId,
    currentStatus: statusCol?.label ?? statusCol?.text ?? null,
    mirroredBidStatus: mirrorCol?.display_value ?? mirrorCol?.text ?? null,
    linkedProjectIds: projectLinkCol?.linked_item_ids ?? [],
    projectNumber: normalizeProjectNumber(projectNumberCol?.text ?? null),
  };
}
