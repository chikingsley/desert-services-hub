# Monday Relation Backfill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Write resolved fallback relations back to Monday.com "Direct" columns, keeping them in sync via Trigger.dev.

**Architecture:** A standalone `schemaTask` that fetches board items, identifies those with empty direct columns but resolvable fallback chains, and writes the resolved IDs back via `updateItem()`. Triggered fire-and-forget by `runFullMondaySync()`, or manually for specific items/scopes.

**Tech Stack:** Trigger.dev `schemaTask`, Monday GraphQL API (`@monday/client`), existing `@monday/types/schema` column defs.

---

### Task 1: Add queue guardrail for the new task

**Files:**
- Modify: `lib/config/throughput-guardrails.ts`

**Step 1: Add guardrail entry**

Add to the `trigger` object in `THROUGHPUT_GUARDRAILS`, after `mondaySyncFiles`:

```typescript
mondayRelationBackfill: {
  name: "monday-relation-backfill",
  env: "MONDAY_RELATION_BACKFILL_QUEUE_CONCURRENCY",
  defaultConcurrency: 1,
},
```

**Step 2: Verify no type errors**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to throughput-guardrails.

**Step 3: Commit**

```bash
git add lib/config/throughput-guardrails.ts
git commit -m "feat: add monday-relation-backfill queue guardrail"
```

---

### Task 2: Create the Trigger.dev task

**Files:**
- Create: `apps/trigger-dev/src/trigger/monday-relation-backfill.ts`

**Step 1: Write the task file**

```typescript
/**
 * Monday Relation Backfill — writes resolved fallback relations to "Direct" columns.
 *
 * Two Estimating board chains:
 *   1. Contacts-Direct: legacy deal_contact → Contacts-Direct column
 *   2. Contractors-Direct: deal_contact → Contacts board → contact_account → Contractors-Direct
 *
 * Idempotent — items with populated direct columns are skipped.
 * Triggered by monday-sync at end of full sync, or manually for specific items/scopes.
 */
import {
  queueConfig,
  THROUGHPUT_GUARDRAILS,
} from "@lib/config/throughput-guardrails";
import { query as mondayQuery } from "@monday/client/query";
import { updateItem } from "@monday/client/search";
import {
  BOARD_IDS,
  CONTACTS_COLUMNS,
  ESTIMATING_COLUMNS,
  ESTIMATING_SKIP_GROUPS,
} from "@monday/types/schema";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

// ── Types ──────────────────────────────────────────────────────────────

interface BoardItem {
  id: string;
  name: string;
  groupTitle: string;
  columns: Record<string, string[]>; // columnId → linked_item_ids
}

interface BackfillChain {
  boardId: string;
  directColumnId: string;
  label: string;
  resolve: (items: BoardItem[]) => Promise<Map<string, string[]>>;
  scope: string;
  skipGroups: readonly string[];
}

interface ChainResult {
  failed: number;
  resolved: number;
  scope: string;
  skipped: number;
  total: number;
  wouldResolve?: number; // dry-run only
}

// ── GraphQL fetch ──────────────────────────────────────────────────────

const FETCH_PAGE_SIZE = 200;

async function fetchBoardItems(
  boardId: string,
  columnIds: string[]
): Promise<BoardItem[]> {
  const results: BoardItem[] = [];
  let cursor: string | null = null;
  const columnIdsLiteral = columnIds.map((id) => `"${id}"`).join(", ");

  do {
    const cursorPart = cursor ? `, cursor: ${JSON.stringify(cursor)}` : "";

    const data = await mondayQuery<{
      boards: {
        items_page: {
          cursor: string | null;
          items: {
            id: string;
            name: string;
            group: { title: string };
            column_values: {
              id: string;
              linked_item_ids?: string[];
            }[];
          }[];
        };
      }[];
    }>(`
      query {
        boards(ids: ${boardId}) {
          items_page(limit: ${FETCH_PAGE_SIZE}${cursorPart}) {
            cursor
            items {
              id
              name
              group { title }
              column_values(ids: [${columnIdsLiteral}]) {
                id
                ... on BoardRelationValue {
                  linked_item_ids
                }
              }
            }
          }
        }
      }
    `);

    const page = data.boards[0]?.items_page;
    if (!page) break;

    for (const item of page.items) {
      const columns: Record<string, string[]> = {};
      for (const col of item.column_values) {
        columns[col.id] = col.linked_item_ids ?? [];
      }
      results.push({
        id: item.id,
        name: item.name,
        groupTitle: item.group.title,
        columns,
      });
    }

    cursor = page.cursor;
  } while (cursor);

  return results;
}

/**
 * Fetch the contractor IDs linked to a set of contacts via their contact_account column.
 * Returns a map: contactItemId → contractorItemIds[]
 */
async function fetchContactContractorMap(
  contactIds: string[]
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (contactIds.length === 0) return result;

  const BATCH_SIZE = 50;
  for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
    const batch = contactIds.slice(i, i + BATCH_SIZE);
    const idsLiteral = batch.join(",");

    const data = await mondayQuery<{
      items: {
        id: string;
        column_values: { id: string; linked_item_ids?: string[] }[];
      }[];
    }>(`
      query {
        items(ids: [${idsLiteral}]) {
          id
          column_values(ids: ["${CONTACTS_COLUMNS.CONTRACTOR.id}"]) {
            id
            ... on BoardRelationValue {
              linked_item_ids
            }
          }
        }
      }
    `);

    for (const item of data.items) {
      const ids = item.column_values[0]?.linked_item_ids ?? [];
      if (ids.length > 0) {
        result.set(item.id, ids);
      }
    }
  }

  return result;
}

// ── Chain resolvers ────────────────────────────────────────────────────

/**
 * Contacts-Direct: copy linked_item_ids from legacy deal_contact → Contacts-Direct.
 */
async function resolveContactsDirect(
  items: BoardItem[]
): Promise<Map<string, string[]>> {
  const writes = new Map<string, string[]>();
  for (const item of items) {
    const legacyIds = item.columns[ESTIMATING_COLUMNS.CONTACTS.id] ?? [];
    if (legacyIds.length > 0) {
      writes.set(item.id, legacyIds);
    }
  }
  return writes;
}

/**
 * Contractors-Direct: two-hop via deal_contact → Contacts board → contact_account.
 */
async function resolveContractorsDirect(
  items: BoardItem[]
): Promise<Map<string, string[]>> {
  // Collect all contact IDs referenced by items missing a direct contractor
  const allContactIds = new Set<string>();
  for (const item of items) {
    for (const contactId of item.columns[ESTIMATING_COLUMNS.CONTACTS.id] ?? []) {
      allContactIds.add(contactId);
    }
  }

  const contactToContractors = await fetchContactContractorMap([...allContactIds]);

  const writes = new Map<string, string[]>();
  for (const item of items) {
    const contactIds = item.columns[ESTIMATING_COLUMNS.CONTACTS.id] ?? [];
    const contractorIds = new Set<string>();

    for (const contactId of contactIds) {
      for (const contractorId of contactToContractors.get(contactId) ?? []) {
        contractorIds.add(contractorId);
      }
    }

    if (contractorIds.size > 0) {
      writes.set(item.id, [...contractorIds]);
    }
  }

  return writes;
}

// ── Chain definitions ──────────────────────────────────────────────────

const CHAINS: BackfillChain[] = [
  {
    scope: "estimating-contacts",
    label: "Estimating: Contacts - Direct",
    boardId: BOARD_IDS.ESTIMATING,
    directColumnId: ESTIMATING_COLUMNS.CONTACTS_DIRECT.id,
    skipGroups: ESTIMATING_SKIP_GROUPS,
    resolve: resolveContactsDirect,
  },
  {
    scope: "estimating-account",
    label: "Estimating: Contractors - Direct",
    boardId: BOARD_IDS.ESTIMATING,
    directColumnId: ESTIMATING_COLUMNS.CONTRACTORS_DIRECT.id,
    skipGroups: ESTIMATING_SKIP_GROUPS,
    resolve: resolveContractorsDirect,
  },
];

// ── Core backfill logic ────────────────────────────────────────────────

async function runChainBackfill(
  chain: BackfillChain,
  options: { dryRun: boolean; itemIds?: string[] }
): Promise<ChainResult> {
  const columnIds = [
    chain.directColumnId,
    ESTIMATING_COLUMNS.CONTACTS.id, // legacy column needed by both resolvers
  ];

  const allItems = options.itemIds
    ? // Targeted: fetch just those items
      await fetchBoardItems(chain.boardId, columnIds).then((items) => {
        const targetSet = new Set(options.itemIds);
        return items.filter((item) => targetSet.has(item.id));
      })
    : await fetchBoardItems(chain.boardId, columnIds);

  // Filter to active items (skip shell/sales groups)
  const activeItems = allItems.filter(
    (item) => !chain.skipGroups.includes(item.groupTitle)
  );

  // Only process items where the direct column is empty
  const candidates = activeItems.filter(
    (item) => (item.columns[chain.directColumnId] ?? []).length === 0
  );

  logger.info(`${chain.label}: ${candidates.length} candidates from ${activeItems.length} active items`);

  const writes = await chain.resolve(candidates);

  if (options.dryRun) {
    logger.info(`${chain.label} [dry-run]: ${writes.size} would resolve`);
    return {
      scope: chain.scope,
      total: activeItems.length,
      skipped: activeItems.length - candidates.length,
      resolved: 0,
      failed: 0,
      wouldResolve: writes.size,
    };
  }

  let resolved = 0;
  let failed = 0;

  for (const [itemId, linkedIds] of writes) {
    try {
      await updateItem({
        boardId: chain.boardId,
        itemId,
        columnValues: {
          [chain.directColumnId]: { item_ids: linkedIds.map(Number) },
        },
      });
      resolved++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`${chain.label}: failed to update item ${itemId}`, { error: msg });
    }
  }

  logger.info(`${chain.label}: resolved=${resolved} failed=${failed}`);

  return {
    scope: chain.scope,
    total: activeItems.length,
    skipped: activeItems.length - candidates.length,
    resolved,
    failed,
  };
}

// ── Task definition ────────────────────────────────────────────────────

const BACKFILL_QUEUE = queueConfig(
  THROUGHPUT_GUARDRAILS.trigger.mondayRelationBackfill
);

export const mondayRelationBackfill = schemaTask({
  id: "monday-relation-backfill",
  queue: BACKFILL_QUEUE,
  schema: z.object({
    scope: z
      .enum(["all", "estimating-contacts", "estimating-account"])
      .default("all"),
    itemIds: z.array(z.string().min(1)).optional(),
    dryRun: z.boolean().default(false),
  }),
  maxDuration: 600,
  retry: { maxAttempts: 1 },
  run: async ({ scope, itemIds, dryRun }) => {
    const chains =
      scope === "all" ? CHAINS : CHAINS.filter((c) => c.scope === scope);

    if (chains.length === 0) {
      throw new Error(`Unknown scope: ${scope}`);
    }

    const results: ChainResult[] = [];
    for (const chain of chains) {
      const result = await runChainBackfill(chain, { dryRun, itemIds });
      results.push(result);
    }

    return { results };
  },
});
```

**Step 2: Verify no type errors**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add apps/trigger-dev/src/trigger/monday-relation-backfill.ts
git commit -m "feat: add monday-relation-backfill trigger task"
```

---

### Task 3: Hook into runFullMondaySync

**Files:**
- Modify: `apps/trigger-dev/src/trigger/monday-sync.ts`

**Step 1: Add fire-and-forget trigger at end of runFullMondaySync**

After the SharePoint sync `safeStage` block (around line 376) and before the `return` statement at line 378, add:

```typescript
await safeStage("Relation backfill", async () => {
  await tasks.trigger("monday-relation-backfill", {
    scope: "all",
    dryRun: false,
  });
  logger.info("Relation backfill triggered");
});
```

**Step 2: Verify no type errors**

Run: `bunx tsc --noEmit --pretty 2>&1 | head -20`

**Step 3: Commit**

```bash
git add apps/trigger-dev/src/trigger/monday-sync.ts
git commit -m "feat: trigger relation backfill after full monday sync"
```

---

### Task 4: Test with dry-run

**Step 1: Deploy the task**

Run: `bunx trigger.dev@latest deploy -a http://localhost:8030`

**Step 2: Trigger a dry-run for both chains**

```bash
printf '{"payload":{"scope":"all","dryRun":true},"options":{}}' | \
  curl -s -X POST http://localhost:8030/api/v1/tasks/monday-relation-backfill/trigger \
    -H "Authorization: Bearer tr_dev_GOyEDErgPSH6SZlGjBZ8" \
    -H "Content-Type: application/json" -d @-
```

**Step 3: Check results in Trigger dashboard**

Visit <https://trigger.desertservices.app>, find the run, verify:
- `wouldResolve` counts match the audit's `relation_fallback` numbers (~238 contacts, ~150 contractors)
- No errors

**Step 4: If dry-run looks good, run for real on a small scope**

```bash
printf '{"payload":{"scope":"estimating-contacts","dryRun":false,"itemIds":["18101436989","18101457664"]},"options":{}}' | \
  curl -s -X POST http://localhost:8030/api/v1/tasks/monday-relation-backfill/trigger \
    -H "Authorization: Bearer tr_dev_GOyEDErgPSH6SZlGjBZ8" \
    -H "Content-Type: application/json" -d @-
```

Verify the two items now have Contacts-Direct populated on Monday.

**Step 5: Full run**

```bash
printf '{"payload":{"scope":"all","dryRun":false},"options":{}}' | \
  curl -s -X POST http://localhost:8030/api/v1/tasks/monday-relation-backfill/trigger \
    -H "Authorization: Bearer tr_dev_GOyEDErgPSH6SZlGjBZ8" \
    -H "Content-Type: application/json" -d @-
```

**Step 6: Re-run audit to confirm improvement**

```bash
bun packages/monday/cli/cli.ts audit-rel estimating-account --active-only
bun packages/monday/cli/cli.ts audit-rel estimating-contacts --active-only
```

Expected: `relation_fallback` counts drop to near 0, `direct` counts increase by ~150/~238.
