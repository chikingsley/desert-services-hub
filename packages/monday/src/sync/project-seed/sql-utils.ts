/**
 * Shared SQL utilities for Monday project-seed sync.
 * Centralizes chunk(), batch-fetch patterns, and placeholder generation.
 */
import { db } from "@lib/db/client";

/**
 * Split an array into batches of `size`.
 */
export function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/**
 * Fetch rows in batches using numbered Postgres placeholders, returning a flat array.
 */
export async function batchFetchRows<R>(
  keys: unknown[],
  batchSize: number,
  buildSql: (placeholders: string) => string
): Promise<R[]> {
  if (keys.length === 0) {
    return [];
  }

  const rows: R[] = [];
  for (const batch of chunk(keys, batchSize)) {
    const placeholders = batch.map((_, index) => `$${index + 1}`).join(", ");
    const batchRows = await db.query<R>(buildSql(placeholders)).all(...batch);
    rows.push(...batchRows);
  }
  return rows;
}

/**
 * Fetch rows in batches and collect into a Map (one value per key).
 * `getKey` extracts the map key from each row.
 */
export async function batchFetchMap<K, R>(
  keys: unknown[],
  batchSize: number,
  buildSql: (placeholders: string) => string,
  getKey: (row: R) => K | null
): Promise<Map<K, R>> {
  const out = new Map<K, R>();
  const rows = await batchFetchRows<R>(keys, batchSize, buildSql);
  for (const row of rows) {
    const k = getKey(row);
    if (k != null) {
      out.set(k, row);
    }
  }
  return out;
}

/**
 * Fetch rows in batches and collect into a Map (array of values per key).
 * `getKey` extracts the grouping key from each row.
 */
export async function batchFetchGroupMap<K, R>(
  keys: unknown[],
  batchSize: number,
  buildSql: (placeholders: string) => string,
  getKey: (row: R) => K | null
): Promise<Map<K, R[]>> {
  const out = new Map<K, R[]>();
  const rows = await batchFetchRows<R>(keys, batchSize, buildSql);
  for (const row of rows) {
    const k = getKey(row);
    if (k == null) {
      continue;
    }
    const arr = out.get(k) ?? [];
    arr.push(row);
    out.set(k, arr);
  }
  return out;
}
