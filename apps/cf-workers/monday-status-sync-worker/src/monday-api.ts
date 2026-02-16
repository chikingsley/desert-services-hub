/**
 * Monday.com GraphQL API client for Cloudflare Workers.
 *
 * CF Workers receive env via handler params rather than process.env,
 * so we can't use the shared packages/monday query client. This module
 * provides equivalent query/mutation helpers that accept env explicitly.
 *
 * Board/column IDs mirror packages/monday/src/types/schema.ts — update
 * both if Monday board structure changes.
 */

import type { Env, ItemColumnValue } from "./types";

// =============================================================================
// Board & Column Constants
// =============================================================================

/** @see packages/monday/src/types/schema.ts BOARD_IDS */
export const ESTIMATING_BOARD_ID = "7943937851";
export const LEADS_BOARD_ID = "7943937841";
export const DEFAULT_PROJECTS_BOARD_ID = "8692330900";

// Estimating columns
export const BID_STATUS_COLUMN_ID = "deal_stage";
export const TARGET_STATUS = "GC Not Awarded";

// Leads columns
export const OVERALL_STATUS_COL = "color_mm068kjz";
export const ESTIMATE_LINK_COL = "board_relation_mktg3z60";
export const MIRRORED_BID_STATUS_COL = "lookup_mktg8b1z";

// Default project relationship columns
export const DEFAULT_ESTIMATE_PROJECT_LINK_COL = "board_relation_mktgebxf";
export const DEFAULT_PROJECT_ESTIMATE_LINK_COL = "board_relation_mktgn7cb";

// Estimating Group IDs
export const WON_GROUP = "group_mkthxpv3";
export const OPEN_GROUP = "group_mkt5hjqh";
export const SENT_GROUP = "group_mkt5fv3a";

// =============================================================================
// GraphQL Client
// =============================================================================

export async function mondayQuery(env: Env, query: string): Promise<unknown> {
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

// =============================================================================
// Query Helpers
// =============================================================================

export interface MondayItem {
  id: string;
  name: string;
  bidStatus: string | null;
}

export async function getItemsFromGroup(
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

export async function getItemsColumnValues(
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

// =============================================================================
// Mutation Helpers
// =============================================================================

export async function updateItemStatus(
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

export async function updateLeadOverallStatus(
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

export async function updateTextColumn(
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

export async function updateBoardRelation(
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
// String Helpers
// =============================================================================

function escapeGraphQLString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}
