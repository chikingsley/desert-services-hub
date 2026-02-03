/**
 * Sync Leads Overall Status from linked Estimate Bid Status
 *
 * Maps:
 *   Won / Pending Won / Add to Projects → Won
 *   Lost / GC Not Awarded / Duplicates → Lost
 *   Everything else → Open (or leave unchanged)
 *
 * Usage:
 *   bun sync-leads-status.ts --dry-run    # Preview changes
 *   bun sync-leads-status.ts              # Execute changes
 */

import { query } from "@services/monday/client";

const LEADS_BOARD = "7943937841";
const ESTIMATING_BOARD = "7943937851";
const OVERALL_STATUS_COL = "color_mm068kjz";
const ESTIMATE_LINK_COL = "board_relation_mktg3z60";
const BID_STATUS_COL = "deal_stage";

// Status mapping: Estimating Bid Status -> Leads Overall Status
const STATUS_MAP: Record<string, string> = {
  Won: "Won",
  "Pending Won": "Won",
  "Add to Projects": "Won",
  Lost: "Lost",
  "GC Not Awarded": "Lost",
  Duplicates: "Lost",
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

interface Lead {
  id: string;
  name: string;
  estimateId: string | null;
  currentStatus: string | null;
}

async function getLeads(): Promise<Lead[]> {
  const allLeads: Lead[] = [];
  let cursor: string | null = null;

  console.log("Fetching leads...");

  do {
    const cursorParam = cursor ? `, cursor: "${cursor}"` : "";

    const result = await query<{
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
    }>(`
      query {
        boards(ids: ${LEADS_BOARD}) {
          items_page(limit: 100${cursorParam}) {
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
    `);

    const page = result.boards[0]?.items_page;
    if (page?.items) {
      for (const item of page.items) {
        const estimateLink = item.column_values.find(
          (c) => c.id === ESTIMATE_LINK_COL
        );
        const overallStatus = item.column_values.find(
          (c) => c.id === OVERALL_STATUS_COL
        );

        allLeads.push({
          id: item.id,
          name: item.name,
          estimateId: estimateLink?.linked_item_ids?.[0] ?? null,
          currentStatus: overallStatus?.label ?? null,
        });
      }
      console.log(`  Fetched ${allLeads.length} leads...`);
    }
    cursor = page?.cursor ?? null;
  } while (cursor);

  return allLeads;
}

async function getEstimateStatuses(
  estimateIds: string[]
): Promise<Map<string, string>> {
  const statusMap = new Map<string, string>();
  const BATCH = 50;

  for (let i = 0; i < estimateIds.length; i += BATCH) {
    const batch = estimateIds.slice(i, i + BATCH);
    const idsStr = batch.join(",");

    const result = await query<{
      items: Array<{
        id: string;
        column_values: Array<{ id: string; label?: string }>;
      }>;
    }>(`
      query {
        items(ids: [${idsStr}]) {
          id
          column_values(ids: ["${BID_STATUS_COL}"]) {
            id
            ... on StatusValue { label }
          }
        }
      }
    `);

    for (const item of result.items) {
      const statusCol = item.column_values.find((c) => c.id === BID_STATUS_COL);
      if (statusCol?.label) {
        statusMap.set(item.id, statusCol.label);
      }
    }
  }

  return statusMap;
}

async function updateLeadStatus(leadId: string, status: string): Promise<void> {
  await query(`
    mutation {
      change_simple_column_value(
        board_id: ${LEADS_BOARD}
        item_id: ${leadId}
        column_id: "${OVERALL_STATUS_COL}"
        value: "${status}"
      ) { id }
    }
  `);
}

async function main() {
  console.log("=".repeat(50));
  console.log("SYNC LEADS OVERALL STATUS");
  console.log("=".repeat(50));
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}\n`);

  const leads = await getLeads();
  console.log(`Total leads: ${leads.length}\n`);

  // Get unique estimate IDs
  const estimateIds = [
    ...new Set(leads.filter((l) => l.estimateId).map((l) => l.estimateId!)),
  ];
  console.log(
    `Fetching statuses for ${estimateIds.length} linked estimates...`
  );
  const estimateStatuses = await getEstimateStatuses(estimateIds);
  console.log(`Got ${estimateStatuses.size} estimate statuses\n`);

  const stats = { updated: 0, skipped: 0, noEstimate: 0, errors: 0 };

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];

    if (!lead.estimateId) {
      stats.noEstimate++;
      continue;
    }

    const bidStatus = estimateStatuses.get(lead.estimateId);
    const newStatus = bidStatus ? STATUS_MAP[bidStatus] : null;

    // Skip if no mapping or already correct
    if (!newStatus || newStatus === lead.currentStatus) {
      stats.skipped++;
      continue;
    }

    if (dryRun) {
      console.log(
        `[${i + 1}/${leads.length}] Would update "${lead.name}": ${lead.currentStatus || "-"} → ${newStatus} (Estimate: ${bidStatus})`
      );
    } else {
      try {
        await updateLeadStatus(lead.id, newStatus);
        console.log(
          `[${i + 1}/${leads.length}] Updated "${lead.name}": ${lead.currentStatus || "-"} → ${newStatus}`
        );
      } catch (e) {
        console.error(
          `[${i + 1}/${leads.length}] ERROR updating "${lead.name}": ${e}`
        );
        stats.errors++;
        continue;
      }
    }
    stats.updated++;
  }

  console.log("\n" + "=".repeat(50));
  console.log("COMPLETE");
  console.log("=".repeat(50));
  console.log(`Updated: ${stats.updated}`);
  console.log(`Skipped (already correct): ${stats.skipped}`);
  console.log(`No linked estimate: ${stats.noEstimate}`);
  if (stats.errors > 0) console.log(`Errors: ${stats.errors}`);
}

main().catch(console.error);
