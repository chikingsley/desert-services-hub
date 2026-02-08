#!/usr/bin/env bun
/**
 * Desert Monday CLI
 *
 * Command-line interface for Monday.com operations.
 *
 * Usage:
 *   bun apps/cli-tools/monday-cli/bin/cli.ts <command> [options]
 */
import {
  getBoard,
  getBoardColumns,
  getItemRich,
  query as mondayQuery,
  searchByColumnValue,
  searchItems,
  updateItem,
} from "@monday/client";

const BOARDS: Record<string, string> = {
  estimating: "7943937851",
  leads: "7943937841",
  projects: "8692330900",
  contacts: "7943937855",
  contractors: "7943937856",
  dust_permits: "9850624269",
  swppp_plans: "9778304069",
  inspection_reports: "8791849123",
  service_lines: "8686470518",
};

const ESTIMATING_NON_PROD_GROUPS = [
  "Shell Estimates ( Do Not Move)",
  "Sales Team Estimates",
];

const args = process.argv.slice(2);
const command = args[0];

type BucketKey =
  | "direct"
  | "relation_fallback"
  | "display_fallback"
  | "unresolved";

type FallbackSpec =
  | {
      kind: "relation";
      columnId: string;
      label: string;
      requiresDisplay?: boolean;
    }
  | {
      kind: "contact_to_contractors";
      contactRelationColumnId: string;
      contactBoardId: string;
      contactToContractorColumnId: string;
      label: string;
    };

interface AuditChainSpec {
  key: string;
  label: string;
  boardAlias: string;
  boardId: string;
  directColumnId: string;
  directLabel: string;
  fallback?: FallbackSpec;
  displayFallbackColumnIds: string[];
  displayFallbackLabel: string;
  skipGroupsWhenActiveOnly?: string[];
}

interface RichColumnValue {
  id: string;
  type: string;
  text: string | null;
  value: string | null;
  linked_item_ids?: string[];
  display_value?: string | null;
}

interface AuditItem {
  id: string;
  name: string;
  groupId: string;
  groupTitle: string;
  columnValues: RichColumnValue[];
}

interface AuditResult {
  spec: AuditChainSpec;
  totalItems: number;
  filteredOut: number;
  counts: Record<BucketKey, number>;
  samples: Record<BucketKey, string[]>;
}

const AUDIT_CHAINS: AuditChainSpec[] = [
  {
    key: "estimating-account",
    label: "Estimating: Contractor/Account Resolution",
    boardAlias: "estimating",
    boardId: BOARDS.estimating,
    directColumnId: "board_relation_mkzdd0r4",
    directLabel: "Contractors - Direct",
    fallback: {
      kind: "contact_to_contractors",
      contactRelationColumnId: "deal_contact",
      contactBoardId: BOARDS.contacts,
      contactToContractorColumnId: "contact_account",
      label: "Legacy Contacts relation -> Contacts.contact_account",
    },
    displayFallbackColumnIds: ["deal_account"],
    displayFallbackLabel: "Contractor mirror display",
    skipGroupsWhenActiveOnly: ESTIMATING_NON_PROD_GROUPS,
  },
  {
    key: "estimating-contacts",
    label: "Estimating: Contacts Resolution",
    boardAlias: "estimating",
    boardId: BOARDS.estimating,
    directColumnId: "board_relation_mm065k5n",
    directLabel: "Contacts - Direct",
    fallback: {
      kind: "relation",
      columnId: "deal_contact",
      label: "Legacy Contacts relation",
    },
    displayFallbackColumnIds: [],
    displayFallbackLabel: "(none)",
    skipGroupsWhenActiveOnly: ESTIMATING_NON_PROD_GROUPS,
  },
  {
    key: "leads-estimate-link",
    label: "Leads: Estimate Link Health",
    boardAlias: "leads",
    boardId: BOARDS.leads,
    directColumnId: "board_relation_mktg3z60",
    directLabel: "Estimate Name relation",
    displayFallbackColumnIds: ["lookup_mktg8b1z", "lookup_mktgymd0"],
    displayFallbackLabel: "Mirrors (Bid Status/Contractor)",
  },
  {
    key: "projects-service-lines",
    label: "Projects: Service Lines Resolution",
    boardAlias: "projects",
    boardId: BOARDS.projects,
    directColumnId: "board_relation_mkp8pr9e",
    directLabel: "Service Lines (direct)",
    fallback: {
      kind: "relation",
      columnId: "board_relation_mktgn7cb",
      label: "Linked Estimate relation",
      requiresDisplay: true,
    },
    displayFallbackColumnIds: ["lookup_mktg3b6w"],
    displayFallbackLabel: "Service Lines mirror",
  },
  {
    key: "dust-account",
    label: "Dust Permits: Account Resolution",
    boardAlias: "dust_permits",
    boardId: BOARDS.dust_permits,
    directColumnId: "board_relation_mkxfk8ky",
    directLabel: "Contractors (direct)",
    fallback: {
      kind: "relation",
      columnId: "board_relation_mkxmhqdf",
      label: "Linked Estimate relation",
      requiresDisplay: true,
    },
    displayFallbackColumnIds: ["lookup_mkxp5f5n", "lookup_mkxmqvqk"],
    displayFallbackLabel: "Account mirrors",
  },
  {
    key: "dust-contacts",
    label: "Dust Permits: Contacts Resolution",
    boardAlias: "dust_permits",
    boardId: BOARDS.dust_permits,
    directColumnId: "board_relation_mkxmh6zg",
    directLabel: "Contacts (direct)",
    fallback: {
      kind: "relation",
      columnId: "board_relation_mkxmhqdf",
      label: "Linked Estimate relation",
      requiresDisplay: true,
    },
    displayFallbackColumnIds: ["lookup_mkxpsgqk"],
    displayFallbackLabel: "Contacts mirror",
  },
  {
    key: "swppp-estimate-link",
    label: "SWPPP Plans: Estimate Link Health",
    boardAlias: "swppp_plans",
    boardId: BOARDS.swppp_plans,
    directColumnId: "board_relation_mktmfqzj",
    directLabel: "Estimating relation",
    displayFallbackColumnIds: ["lookup_mktmqf1r"],
    displayFallbackLabel: "Status mirror",
  },
  {
    key: "inspection-project-link",
    label: "Inspection Reports: Project Link Health",
    boardAlias: "inspection_reports",
    boardId: BOARDS.inspection_reports,
    directColumnId: "board_relation_mkpfq0mk",
    directLabel: "Project relation",
    displayFallbackColumnIds: ["lookup_mkrws4a7", "lookup_mkqy8nyj"],
    displayFallbackLabel: "Project-derived mirrors",
  },
  {
    key: "contractors-contacts-link",
    label: "Contractors: Contacts Link Health",
    boardAlias: "contractors",
    boardId: BOARDS.contractors,
    directColumnId: "account_contact",
    directLabel: "Contacts relation",
    displayFallbackColumnIds: [],
    displayFallbackLabel: "(none)",
  },
  {
    key: "contacts-contractor-link",
    label: "Contacts: Contractor Link Health",
    boardAlias: "contacts",
    boardId: BOARDS.contacts,
    directColumnId: "contact_account",
    directLabel: "Contractor relation",
    displayFallbackColumnIds: [],
    displayFallbackLabel: "(none)",
  },
  {
    key: "service-lines-project-link",
    label: "Service Lines: Projects Link Health",
    boardAlias: "service_lines",
    boardId: BOARDS.service_lines,
    directColumnId: "board_relation_mkp8rqas",
    directLabel: "Projects relation",
    displayFallbackColumnIds: [],
    displayFallbackLabel: "(none)",
  },
];

function showHelp() {
  console.log(`
Desert Monday CLI

Usage: bun apps/cli-tools/monday-cli/bin/cli.ts <command> [options]

Commands:
  get <itemId>                    Get item by ID (rich: linked items, mirrors)
  search <board> <query>          Search items by name on a board
  search-col <board> <colId> <value>  Search by column value
  boards                          List known boards
  columns <board>                 List columns for a board
  groups <board>                  List groups for a board
  update <board> <itemId> <json>  Update item column values
  audit-rel [all|chain-key]       Resolution audit (direct/relation_fallback/display_fallback/unresolved)
                                  Add --active-only to skip known non-production groups where configured

Boards: ${Object.keys(BOARDS).join(", ")}

Audit chain keys:
  ${AUDIT_CHAINS.map((c) => c.key).join("\n  ")}

Examples:
  bun apps/cli-tools/monday-cli/bin/cli.ts get 9758584422
  bun apps/cli-tools/monday-cli/bin/cli.ts search leads "Revolve"
  bun apps/cli-tools/monday-cli/bin/cli.ts columns leads
  bun apps/cli-tools/monday-cli/bin/cli.ts groups estimating
  bun apps/cli-tools/monday-cli/bin/cli.ts update leads 12345 '{"color_mm068kjz":{"label":"Lost"}}'
  bun apps/cli-tools/monday-cli/bin/cli.ts audit-rel all
  bun apps/cli-tools/monday-cli/bin/cli.ts audit-rel estimating-account --active-only
`);
}

function resolveBoardId(nameOrId: string): string {
  return BOARDS[nameOrId.toLowerCase()] ?? nameOrId;
}

function formatItem(item: {
  id: string;
  name: string;
  groupTitle?: string;
  columns?: Record<string, string | null>;
  columnValues?: Array<{
    id: string;
    type: string;
    text: string | null;
    value: string | null;
    linkedItemIds?: string[];
    displayValue?: string;
  }>;
}) {
  console.log(`\n${item.name} (${item.id})`);
  if (item.groupTitle) {
    console.log(`  Group: ${item.groupTitle}`);
  }
  if (item.columnValues) {
    for (const col of item.columnValues) {
      const display = col.displayValue || col.text || col.value;
      if (!display) {
        continue;
      }
      const linked = col.linkedItemIds?.length
        ? ` [linked: ${col.linkedItemIds.join(", ")}]`
        : "";
      console.log(`  ${col.id} (${col.type}): ${display}${linked}`);
    }
  } else if (item.columns) {
    for (const [colId, val] of Object.entries(item.columns)) {
      if (!val) {
        continue;
      }
      console.log(`  ${colId}: ${val}`);
    }
  }
}

function getColumnValue(
  item: AuditItem,
  columnId: string
): RichColumnValue | null {
  return item.columnValues.find((c) => c.id === columnId) ?? null;
}

function hasLinkedRelation(item: AuditItem, columnId: string): boolean {
  const col = getColumnValue(item, columnId);
  return (col?.linked_item_ids?.length ?? 0) > 0;
}

function getDisplayValue(item: AuditItem, columnId: string): string | null {
  const col = getColumnValue(item, columnId);
  const display = (col?.display_value ?? col?.text ?? "").trim();
  if (!display || display.toLowerCase() === "null") {
    return null;
  }
  return display;
}

function pct(value: number, total: number): string {
  if (total === 0) {
    return "0.00%";
  }
  return `${((value / total) * 100).toFixed(2)}%`;
}

function formatBucketCounts(
  counts: Record<BucketKey, number>,
  total: number
): string[] {
  return [
    `  direct:            ${String(counts.direct).padStart(6)} (${pct(counts.direct, total)})`,
    `  relation_fallback: ${String(counts.relation_fallback).padStart(6)} (${pct(counts.relation_fallback, total)})`,
    `  display_fallback:  ${String(counts.display_fallback).padStart(6)} (${pct(counts.display_fallback, total)})`,
    `  unresolved:        ${String(counts.unresolved).padStart(6)} (${pct(counts.unresolved, total)})`,
  ];
}

async function fetchBoardItemsWithColumns(
  boardId: string,
  columnIds: string[]
): Promise<AuditItem[]> {
  interface ItemsPage {
    cursor: string | null;
    items: Array<{
      id: string;
      name: string;
      group: { id: string; title: string };
      column_values: RichColumnValue[];
    }>;
  }
  interface BoardItemsQuery {
    boards: Array<{
      items_page: ItemsPage;
    }>;
  }

  const results: AuditItem[] = [];
  let cursor: string | null = null;

  const columnIdsLiteral = columnIds.map((id) => `"${id}"`).join(", ");

  do {
    const cursorPart: string = cursor
      ? `, cursor: ${JSON.stringify(cursor)}`
      : "";

    const data: BoardItemsQuery = await mondayQuery<BoardItemsQuery>(`
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
        id: item.id,
        name: item.name,
        groupId: item.group.id,
        groupTitle: item.group.title,
        columnValues: item.column_values,
      });
    }

    cursor = page.cursor;
  } while (cursor);

  return results;
}

async function fetchContactsWithContractorLink(
  contactIds: string[],
  contactToContractorColumnId: string
): Promise<Set<string>> {
  const linked = new Set<string>();
  if (contactIds.length === 0) {
    return linked;
  }

  const batchSize = 50;
  for (let i = 0; i < contactIds.length; i += batchSize) {
    const batch = contactIds.slice(i, i + batchSize);
    const idsLiteral = batch.join(",");

    const data = await mondayQuery<{
      items: Array<{
        id: string;
        column_values: Array<{
          id: string;
          linked_item_ids?: string[];
        }>;
      }>;
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

function createCounts(): Record<BucketKey, number> {
  return {
    direct: 0,
    relation_fallback: 0,
    display_fallback: 0,
    unresolved: 0,
  };
}

function createSamples(): Record<BucketKey, string[]> {
  return {
    direct: [],
    relation_fallback: [],
    display_fallback: [],
    unresolved: [],
  };
}

function sampleItem(
  samples: Record<BucketKey, string[]>,
  bucket: BucketKey,
  item: AuditItem
): void {
  if (samples[bucket].length < 5) {
    samples[bucket].push(`${item.id}: ${item.name}`);
  }
}

async function runChainAudit(
  spec: AuditChainSpec,
  activeOnly: boolean
): Promise<AuditResult> {
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

  const allRows = await fetchBoardItemsWithColumns(spec.boardId, [
    ...columnIds,
  ]);

  const rows =
    activeOnly && spec.skipGroupsWhenActiveOnly?.length
      ? allRows.filter(
          (row) => !spec.skipGroupsWhenActiveOnly?.includes(row.groupTitle)
        )
      : allRows;

  let contactIdsWithContractor = new Set<string>();
  if (spec.fallback?.kind === "contact_to_contractors") {
    const contactIds = new Set<string>();
    for (const row of rows) {
      if (hasLinkedRelation(row, spec.directColumnId)) {
        continue;
      }
      const relCol = getColumnValue(row, spec.fallback.contactRelationColumnId);
      for (const contactId of relCol?.linked_item_ids ?? []) {
        contactIds.add(contactId);
      }
    }

    contactIdsWithContractor = await fetchContactsWithContractorLink(
      [...contactIds],
      spec.fallback.contactToContractorColumnId
    );
  }

  const counts = createCounts();
  const samples = createSamples();

  for (const row of rows) {
    const direct = hasLinkedRelation(row, spec.directColumnId);
    const hasDisplayFallback = spec.displayFallbackColumnIds.some(
      (colId) => getDisplayValue(row, colId) !== null
    );

    let relationFallback = false;

    if (!direct && spec.fallback) {
      if (spec.fallback.kind === "relation") {
        const relationPresent = hasLinkedRelation(row, spec.fallback.columnId);
        relationFallback = spec.fallback.requiresDisplay
          ? relationPresent && hasDisplayFallback
          : relationPresent;
      } else {
        const relCol = getColumnValue(
          row,
          spec.fallback.contactRelationColumnId
        );
        relationFallback = (relCol?.linked_item_ids ?? []).some((contactId) =>
          contactIdsWithContractor.has(contactId)
        );
      }
    }

    let bucket: BucketKey = "unresolved";
    if (direct) {
      bucket = "direct";
    } else if (relationFallback) {
      bucket = "relation_fallback";
    } else if (hasDisplayFallback) {
      bucket = "display_fallback";
    }

    counts[bucket] += 1;
    sampleItem(samples, bucket, row);
  }

  return {
    spec,
    totalItems: rows.length,
    filteredOut: allRows.length - rows.length,
    counts,
    samples,
  };
}

function printAuditResult(result: AuditResult, activeOnly: boolean): void {
  const { spec, totalItems, counts, samples, filteredOut } = result;

  console.log(`\n[${spec.key}] ${spec.label}`);
  console.log(`  board: ${spec.boardAlias} (${spec.boardId})`);
  console.log(`  direct target: ${spec.directColumnId} (${spec.directLabel})`);
  if (spec.fallback?.kind === "relation") {
    console.log(
      `  relation fallback: ${spec.fallback.columnId} (${spec.fallback.label})${
        spec.fallback.requiresDisplay ? " + display fallback present" : ""
      }`
    );
  }
  if (spec.fallback?.kind === "contact_to_contractors") {
    console.log(
      `  relation fallback: ${spec.fallback.contactRelationColumnId} (${spec.fallback.label})`
    );
  }
  if (spec.displayFallbackColumnIds.length > 0) {
    console.log(
      `  display fallback: ${spec.displayFallbackColumnIds.join(", ")} (${spec.displayFallbackLabel})`
    );
  }

  if (activeOnly && filteredOut > 0) {
    console.log(`  filtered out by --active-only: ${filteredOut}`);
  }

  console.log(`  total evaluated: ${totalItems}`);
  for (const line of formatBucketCounts(counts, totalItems)) {
    console.log(line);
  }

  if (samples.unresolved.length > 0) {
    console.log("  unresolved samples:");
    for (const sample of samples.unresolved) {
      console.log(`    - ${sample}`);
    }
  }
}

async function runResolutionAudit(
  scope: string,
  activeOnly: boolean
): Promise<void> {
  const chainSpecs =
    scope === "all"
      ? AUDIT_CHAINS
      : AUDIT_CHAINS.filter((chain) => chain.key === scope);

  if (chainSpecs.length === 0) {
    throw new Error(
      `Unknown audit chain: ${scope}. Use one of: all, ${AUDIT_CHAINS.map((c) => c.key).join(", ")}`
    );
  }

  console.log("Resolution audit buckets:");
  console.log(
    "  direct: direct relation column on the target board is populated"
  );
  console.log(
    "  relation_fallback: direct is blank, but relation-chain fallback resolves"
  );
  console.log(
    "  display_fallback: direct/fallback relation is blank, display mirror still has value"
  );
  console.log(
    "  unresolved: no direct relation, no relation fallback, no display fallback"
  );

  for (const spec of chainSpecs) {
    const result = await runChainAudit(spec, activeOnly);
    printAuditResult(result, activeOnly);
  }
}

async function main() {
  if (!command || command === "--help" || command === "-h") {
    showHelp();
    return;
  }

  switch (command) {
    case "get": {
      const itemId = args[1];
      if (!itemId) {
        console.error("Usage: get <itemId>");
        process.exit(1);
      }
      const item = await getItemRich(itemId);
      if (!item) {
        console.error(`Item ${itemId} not found`);
        process.exit(1);
      }
      formatItem(item);
      break;
    }

    case "search": {
      const boardName = args[1];
      const query = args[2];
      if (!(boardName && query)) {
        console.error("Usage: search <board> <query>");
        process.exit(1);
      }
      const boardId = resolveBoardId(boardName);
      const items = await searchItems(boardId, query);
      console.log(`Found ${items.length} results:`);
      for (const item of items) {
        console.log(`  ${item.id}: ${item.name} (${item.groupTitle})`);
      }
      break;
    }

    case "search-col": {
      const boardName = args[1];
      const colId = args[2];
      const value = args[3];
      if (!(boardName && colId && value)) {
        console.error("Usage: search-col <board> <colId> <value>");
        process.exit(1);
      }
      const boardId = resolveBoardId(boardName);
      const items = await searchByColumnValue(boardId, colId, value);
      console.log(`Found ${items.length} results:`);
      for (const item of items) {
        formatItem(item);
      }
      break;
    }

    case "boards": {
      console.log("Known boards:");
      for (const [name, id] of Object.entries(BOARDS)) {
        console.log(`  ${name}: ${id}`);
      }
      break;
    }

    case "columns": {
      const boardName = args[1];
      if (!boardName) {
        console.error("Usage: columns <board>");
        process.exit(1);
      }
      const boardId = resolveBoardId(boardName);
      const columns = await getBoardColumns(boardId);
      for (const col of columns) {
        console.log(`  ${col.id} (${col.type}): ${col.title}`);
      }
      break;
    }

    case "groups": {
      const boardName = args[1];
      if (!boardName) {
        console.error("Usage: groups <board>");
        process.exit(1);
      }
      const boardId = resolveBoardId(boardName);
      const board = await getBoard(boardId);
      if (!board) {
        console.error(`Board ${boardId} not found`);
        process.exit(1);
      }
      console.log(`${board.name} groups:`);
      for (const g of board.groups) {
        console.log(`  ${g.id}: ${g.title}`);
      }
      break;
    }

    case "update": {
      const boardName = args[1];
      const itemId = args[2];
      const jsonStr = args[3];
      if (!(boardName && itemId && jsonStr)) {
        console.error("Usage: update <board> <itemId> '<json>'");
        process.exit(1);
      }
      const boardId = resolveBoardId(boardName);
      const columnValues = JSON.parse(jsonStr);
      await updateItem({
        boardId,
        itemId,
        columnValues,
        createLabelsIfMissing: true,
      });
      console.log(`Updated item ${itemId}`);
      break;
    }

    case "audit-rel": {
      const scope = args[1] ?? "all";
      const activeOnly = args.includes("--active-only");
      await runResolutionAudit(scope, activeOnly);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
