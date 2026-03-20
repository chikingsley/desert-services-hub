/**
 * Leads Sync Job
 *
 * Syncs Leads "Overall Status" from linked Estimate "Bid Status":
 *   - Won/Pending Won/Add to Projects → Won
 *   - Lost/GC Not Awarded/Duplicates → Lost
 */

import { query } from "@monday/client/query";
import { updateItem } from "@monday/client/search";
import { BOARD_IDS, LEADS_COLUMNS } from "@monday/types/schema";
import type {
  ItemColumnValue,
  LeadFetchOptions,
  LeadsSyncResult,
  LeadWithEstimate,
} from "./types";
import { BID_TO_OVERALL_STATUS, normalizeProjectNumber, sleep } from "./utils";

// =============================================================================
// Main Job
// =============================================================================

export async function runLeadsSync(dryRun = false): Promise<LeadsSyncResult> {
  const result: LeadsSyncResult = {
    leadsCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errors: [],
  };

  try {
    console.log("[Leads Sync] Fetching leads...");
    const leads = await getLeadsWithEstimates();
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
        await updateItem({
          boardId: BOARD_IDS.LEADS,
          itemId: lead.id,
          columnValues: {
            [LEADS_COLUMNS.OVERALL_STATUS.id]: { label: newOverallStatus },
          },
        });
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

export async function getLeadsWithEstimates(
  options: LeadFetchOptions = {}
): Promise<LeadWithEstimate[]> {
  const leads: LeadWithEstimate[] = [];
  let cursor: string | null = null;

  const columnIds = buildColumnIds(options);
  const columnIdsLiteral = columnIds
    .map((columnId) => `"${columnId}"`)
    .join(", ");

  interface ItemsPage {
    cursor: string | null;
    items: Array<{
      id: string;
      name: string;
      column_values: ItemColumnValue[];
    }>;
  }

  const itemFields = `
    id
    name
    column_values(ids: [${columnIdsLiteral}]) {
      id
      text
      ... on BoardRelationValue { linked_item_ids }
      ... on StatusValue { label }
      ... on MirrorValue { display_value }
    }
  `;

  function collectLeads(page: ItemsPage | null) {
    for (const item of page?.items ?? []) {
      const lead = parseLeadFromItem(item, options);
      if (lead) {
        leads.push(lead);
      }
    }
  }

  // First page: nested in boards
  const firstData = await query<{ boards: Array<{ items_page: ItemsPage }> }>(`
    query {
      boards(ids: ${BOARD_IDS.LEADS}) {
        items_page(limit: 500) {
          cursor
          items { ${itemFields} }
        }
      }
    }
  `);

  const firstPage = firstData.boards?.[0]?.items_page ?? null;
  collectLeads(firstPage);
  cursor = firstPage?.cursor ?? null;

  // Subsequent pages: next_items_page at root level
  while (cursor) {
    const nextData = await query<{ next_items_page: ItemsPage }>(`
      query {
        next_items_page(limit: 500, cursor: "${cursor}") {
          cursor
          items { ${itemFields} }
        }
      }
    `);

    collectLeads(nextData.next_items_page);
    cursor = nextData.next_items_page?.cursor ?? null;
  }

  return leads;
}

// =============================================================================
// Helpers
// =============================================================================

function buildColumnIds(options: LeadFetchOptions): string[] {
  return [
    LEADS_COLUMNS.ESTIMATE_LINK.id,
    LEADS_COLUMNS.OVERALL_STATUS.id,
    LEADS_COLUMNS.MIRRORED_BID_STATUS.id,
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

function parseLeadFromItem(
  item: { id: string; name: string; column_values: ItemColumnValue[] },
  options: LeadFetchOptions
): LeadWithEstimate | null {
  const estimateCol = findColumnValue(
    item.column_values,
    LEADS_COLUMNS.ESTIMATE_LINK.id
  );
  const firstEstimateId = estimateCol?.linked_item_ids?.[0];
  if (!firstEstimateId) {
    return null;
  }

  const statusCol = findColumnValue(
    item.column_values,
    LEADS_COLUMNS.OVERALL_STATUS.id
  );
  const mirrorCol = findColumnValue(
    item.column_values,
    LEADS_COLUMNS.MIRRORED_BID_STATUS.id
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
