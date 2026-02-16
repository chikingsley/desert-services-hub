/**
 * Monday.com file fetching and account resolution for estimate sync.
 */

import type { MondayColumnValue } from "@monday/client";
import { getItemNames, query } from "@monday/client";
import { FILE_COLUMNS } from "@monday/sync/helpers";
import type { Asset } from "@monday/sync/types";
import { CONTACTS_COLUMNS, ESTIMATING_COLUMNS } from "@monday/types";

interface SyncItem {
  id: string;
  columns: Record<string, string | null>;
  columnValues: MondayColumnValue[];
}

/**
 * Fetch file assets for a single Monday column.
 */
export async function fetchItemAssets(
  itemId: string,
  columnId: string
): Promise<Asset[]> {
  const result = await query<{
    items: { assets: Asset[] }[];
  }>(`
    query {
      items(ids: [${itemId}]) {
        assets(column_ids: ["${columnId}"]) {
          id
          name
          public_url
        }
      }
    }
  `);

  return result.items[0]?.assets ?? [];
}

/**
 * Fetch assets for all file columns in parallel.
 */
export async function fetchAllColumnAssets(
  itemId: string
): Promise<Map<string, Asset[]>> {
  const columnIds = FILE_COLUMNS.map((c) => c.column.id);
  const results = await Promise.all(
    columnIds.map((columnId) => fetchItemAssets(itemId, columnId))
  );

  const assetMap = new Map<string, Asset[]>();
  columnIds.forEach((columnId, index) => {
    assetMap.set(columnId, results[index] ?? []);
  });

  return assetMap;
}

/**
 * Download a file from Monday's public URL.
 */
export async function downloadAsset(asset: Asset): Promise<Buffer> {
  const response = await fetch(asset.public_url);
  if (!response.ok) {
    throw new Error(
      `Download failed: ${response.status} ${response.statusText}`
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Get linked item IDs from a column value.
 */
export function getLinkedIds(
  columnValues: MondayColumnValue[],
  columnId: string
): string[] {
  const col = columnValues.find((c) => c.id === columnId);
  return col?.linkedItemIds ?? [];
}

interface LookupBuckets {
  directAccountIds: Set<string>;
  contactIds: Set<string>;
}

function classifyItemsForLookup(items: SyncItem[]): LookupBuckets {
  const directAccountIds = new Set<string>();
  const contactIds = new Set<string>();

  for (const item of items) {
    const accountIds = getLinkedIds(
      item.columnValues,
      ESTIMATING_COLUMNS.ACCOUNTS.id
    );
    if (accountIds.length > 0) {
      directAccountIds.add(accountIds[0]);
      continue;
    }

    const contactIdList = getLinkedIds(
      item.columnValues,
      ESTIMATING_COLUMNS.CONTACTS.id
    );
    if (contactIdList.length > 0) {
      contactIds.add(contactIdList[0]);
    }
  }

  return { directAccountIds, contactIds };
}

function mapDirectAccountNames(
  directAccountIds: Set<string>
): Promise<Map<string, string>> {
  return getItemNames([...directAccountIds]);
}

function assignDirectAccountNames(
  items: SyncItem[],
  accountNames: Map<string, string>,
  accountNameMap: Map<string, string>
): void {
  for (const item of items) {
    const accountIds = getLinkedIds(
      item.columnValues,
      ESTIMATING_COLUMNS.ACCOUNTS.id
    );
    const firstAccountId = accountIds[0];
    if (!firstAccountId) {
      continue;
    }

    const accountName = accountNames.get(firstAccountId);
    if (accountName) {
      accountNameMap.set(item.id, accountName);
    }
  }
}

function addMirrorFallbackNames(
  items: SyncItem[],
  accountNameMap: Map<string, string>
): void {
  for (const item of items) {
    if (accountNameMap.has(item.id)) {
      continue;
    }

    const mirrorCol = item.columnValues.find(
      (c) => c.id === ESTIMATING_COLUMNS.CONTRACTOR.id
    );
    const mirrorValue = mirrorCol?.displayValue;
    if (mirrorValue && mirrorValue !== "null") {
      accountNameMap.set(item.id, mirrorValue);
    }
  }
}

function findContactIdsRequiringFallback(items: SyncItem[]): string[] {
  const contactIds = new Set<string>();

  for (const item of items) {
    const accountIds = getLinkedIds(
      item.columnValues,
      ESTIMATING_COLUMNS.ACCOUNTS.id
    );
    if (accountIds.length > 0) {
      continue;
    }
    const contactIdList = getLinkedIds(
      item.columnValues,
      ESTIMATING_COLUMNS.CONTACTS.id
    );
    if (contactIdList[0]) {
      contactIds.add(contactIdList[0]);
    }
  }

  return [...contactIds];
}

function assignContactFallbackNames(
  items: SyncItem[],
  contactAccountMap: Map<string, string>,
  accountNameMap: Map<string, string>
): void {
  for (const item of items) {
    if (accountNameMap.has(item.id)) {
      continue;
    }

    const contactIdList = getLinkedIds(
      item.columnValues,
      ESTIMATING_COLUMNS.CONTACTS.id
    );
    const accountName = contactIdList[0]
      ? contactAccountMap.get(contactIdList[0])
      : undefined;
    if (accountName) {
      accountNameMap.set(item.id, accountName);
    }
  }
}

/**
 * Resolve account names for all items using board relations.
 */
export async function resolveAccountNames(
  items: {
    id: string;
    columns: Record<string, string | null>;
    columnValues: MondayColumnValue[];
  }[]
): Promise<Map<string, string>> {
  const syncItems = items as SyncItem[];
  const accountNameMap = new Map<string, string>();

  const { directAccountIds } = classifyItemsForLookup(syncItems);
  const accountNames = await mapDirectAccountNames(directAccountIds);
  assignDirectAccountNames(syncItems, accountNames, accountNameMap);

  const contactIdsNeedingFallback = findContactIdsRequiringFallback(syncItems);
  if (contactIdsNeedingFallback.length > 0) {
    const contactAccountMap = await lookupContactAccounts(
      contactIdsNeedingFallback
    );
    assignContactFallbackNames(syncItems, contactAccountMap, accountNameMap);
  }

  addMirrorFallbackNames(syncItems, accountNameMap);

  return accountNameMap;
}

interface ContactQueryItem {
  id: string;
  column_values: Array<{
    id: string;
    linked_item_ids?: string[];
  }>;
}

/**
 * Look up account names for contacts via their CONTRACTOR relation.
 */
async function lookupContactAccounts(
  contactIds: string[]
): Promise<Map<string, string>> {
  const contactAccountMap = new Map<string, string>();
  const accountIdsToLookup = new Set<string>();
  const contactToAccountId = new Map<string, string>();

  const BATCH_SIZE = 50;

  for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
    const batch = contactIds.slice(i, i + BATCH_SIZE);
    const idsStr = batch.join(",");

    const result = await query<{
      items: ContactQueryItem[];
    }>(`
      query {
        items(ids: [${idsStr}]) {
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

    for (const contact of result.items) {
      const relCol = contact.column_values[0];
      const accountId = relCol?.linked_item_ids?.[0];
      if (accountId) {
        contactToAccountId.set(contact.id, accountId);
        accountIdsToLookup.add(accountId);
      }
    }
  }

  const accountNames = await getItemNames([...accountIdsToLookup]);
  for (const [contactId, accountId] of contactToAccountId) {
    const name = accountNames.get(accountId);
    if (name) {
      contactAccountMap.set(contactId, name);
    }
  }

  return contactAccountMap;
}
