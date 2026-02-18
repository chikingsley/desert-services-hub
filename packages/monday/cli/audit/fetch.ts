import { query as mondayQuery } from "@monday/client/query";

import type { AuditChainSpec, AuditItem, RichColumnValue } from "./chains";

const RELATION_FALLBACK_ROW_LIMIT = 50;

interface ItemsPage {
  cursor: string | null;
  items: {
    id: string;
    name: string;
    group: { id: string; title: string };
    column_values: RichColumnValue[];
  }[];
}

interface BoardItemsQuery {
  boards: {
    items_page: ItemsPage;
  }[];
}

export async function fetchBoardItemsWithColumns(
  boardId: string,
  columnIds: string[]
): Promise<AuditItem[]> {
  const results: AuditItem[] = [];
  let cursor: string | null = null;

  const columnIdsLiteral = columnIds.map((id) => `"${id}"`).join(", ");

  do {
    const cursorPart: string = cursor
      ? `, cursor: ${JSON.stringify(cursor)}`
      : "";

    const data = await mondayQuery<BoardItemsQuery>(`
      query {
        boards(ids: ${boardId}) {
          items_page(limit: 200${cursorPart}) {
            cursor
            items {
              id
              name
              group {
                id
                title
              }
              column_values(ids: [${columnIdsLiteral}]) {
                id
                type
                text
                value
                ... on BoardRelationValue {
                  linked_item_ids
                  display_value
                }
                ... on MirrorValue {
                  display_value
                }
              }
            }
          }
        }
      }
    `);

    const page: ItemsPage | undefined = data.boards[0]?.items_page;
    if (!page) {
      break;
    }

    for (const item of page.items) {
      results.push({
        columnValues: item.column_values,
        groupId: item.group.id,
        groupTitle: item.group.title,
        id: item.id,
        name: item.name,
      });
    }

    ({ cursor } = page);
  } while (cursor);

  return results;
}

export function getColumnsToFetch(spec: AuditChainSpec): string[] {
  const columnIds = new Set<string>([spec.directColumnId]);
  if (spec.fallback?.kind === "relation") {
    columnIds.add(spec.fallback.columnId);
  }
  if (spec.fallback?.kind === "contact_to_contractors") {
    columnIds.add(spec.fallback.contactRelationColumnId);
  }
  for (const colId of spec.displayFallbackColumnIds) {
    columnIds.add(colId);
  }
  return [...columnIds];
}

export async function fetchContactsWithContractorLink(
  contactIds: string[],
  contactToContractorColumnId: string
): Promise<Set<string>> {
  const linked = new Set<string>();
  if (contactIds.length === 0) {
    return linked;
  }

  for (let i = 0; i < contactIds.length; i += RELATION_FALLBACK_ROW_LIMIT) {
    const batch = contactIds.slice(i, i + RELATION_FALLBACK_ROW_LIMIT);
    const idsLiteral = batch.join(",");

    const data = await mondayQuery<{
      items: {
        id: string;
        column_values: Array<{
          id: string;
          linked_item_ids?: string[];
        }>;
      }[];
    }>(`
      query {
        items(ids: [${idsLiteral}]) {
          id
          column_values(ids: ["${contactToContractorColumnId}"]) {
            id
            ... on BoardRelationValue {
              linked_item_ids
            }
          }
        }
      }
    `);

    for (const item of data.items) {
      const relation = item.column_values[0];
      if ((relation?.linked_item_ids?.length ?? 0) > 0) {
        linked.add(item.id);
      }
    }
  }

  return linked;
}

export function filterActiveItems(
  rows: AuditItem[],
  skipGroupsWhenActiveOnly: string[] | undefined,
  activeOnly: boolean
): AuditItem[] {
  if (!(activeOnly && skipGroupsWhenActiveOnly?.length)) {
    return rows;
  }
  return rows.filter(
    (row) => !skipGroupsWhenActiveOnly.includes(row.groupTitle)
  );
}
