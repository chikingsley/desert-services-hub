/**
 * Monday.com file fetching and account resolution for estimate sync.
 */
import { getItemNames, type MondayColumnValue, query } from "@monday/client";
import { FILE_COLUMNS } from "@monday/sync/helpers";
import type { Asset } from "@monday/sync/types";
import { CONTACTS_COLUMNS, ESTIMATING_COLUMNS } from "@monday/types";

/**
 * Fetch file assets for a single Monday column.
 */
export async function fetchItemAssets(
  itemId: string,
  columnId: string
): Promise<Asset[]> {
  const result = await query<{
    items: Array<{ assets: Asset[] }>;
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

/**
 * Resolve account names for all items using board relations.
 *
 * Strategy:
 * 1. Try ACCOUNTS board relation (direct link)
 * 2. Fall back to CONTACTS board relation -> lookup contact's CONTRACTOR
 * 3. Fall back to CONTRACTOR mirror column (display_value)
 */
export async function resolveAccountNames(
  items: Array<{
    id: string;
    columns: Record<string, string | null>;
    columnValues: MondayColumnValue[];
  }>
): Promise<Map<string, string>> {
  const accountNameMap = new Map<string, string>();

  const directAccountIds = new Set<string>();
  const contactIds = new Set<string>();

  for (const item of items) {
    const accountIds = getLinkedIds(
      item.columnValues,
      ESTIMATING_COLUMNS.ACCOUNTS.id
    );

    if (accountIds.length > 0) {
      directAccountIds.add(accountIds[0]);
    } else {
      const contactIdList = getLinkedIds(
        item.columnValues,
        ESTIMATING_COLUMNS.CONTACTS.id
      );
      if (contactIdList.length > 0) {
        contactIds.add(contactIdList[0]);
      }
    }
  }

  // Batch lookup account names
  const accountNames = await getItemNames([...directAccountIds]);

  // Map items with direct account links
  for (const item of items) {
    const accountIds = getLinkedIds(
      item.columnValues,
      ESTIMATING_COLUMNS.ACCOUNTS.id
    );
    if (accountIds.length > 0 && accountNames.has(accountIds[0])) {
      const accountName = accountNames.get(accountIds[0]);
      if (accountName) {
        accountNameMap.set(item.id, accountName);
      }
    }
  }

  // For items with contacts, look up the contact's CONTRACTOR relation
  if (contactIds.size > 0) {
    const contactAccountMap = await lookupContactAccounts([...contactIds]);

    for (const item of items) {
      if (accountNameMap.has(item.id)) {
        continue;
      }

      const contactIdList = getLinkedIds(
        item.columnValues,
        ESTIMATING_COLUMNS.CONTACTS.id
      );
      if (contactIdList.length > 0) {
        const accountName = contactAccountMap.get(contactIdList[0]);
        if (accountName) {
          accountNameMap.set(item.id, accountName);
        }
      }
    }
  }

  // Fall back to CONTRACTOR mirror column
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

  return accountNameMap;
}

/**
 * Look up account names for contacts via their CONTRACTOR relation.
 */
async function lookupContactAccounts(
  contactIds: string[]
): Promise<Map<string, string>> {
  if (contactIds.length === 0) {
    return new Map();
  }

  const contactAccountMap = new Map<string, string>();
  const accountIdsToLookup = new Set<string>();
  const contactToAccountId = new Map<string, string>();

  const BATCH_SIZE = 50;
  for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
    const batch = contactIds.slice(i, i + BATCH_SIZE);
    const idsStr = batch.join(",");

    interface ContactQueryResult {
      items: Array<{
        id: string;
        column_values: Array<{
          id: string;
          linked_item_ids?: string[];
        }>;
      }>;
    }

    const result = await query<ContactQueryResult>(`
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
