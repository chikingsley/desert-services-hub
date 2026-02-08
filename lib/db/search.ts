/**
 * Shared ILIKE search builder for Postgres.
 *
 * Eliminates duplicated `%query%` pattern matching across repositories.
 */
import { db } from "@lib/db/hub";

/**
 * Build an ILIKE WHERE clause and its params.
 * Use when you need just the clause fragment for a complex query.
 *
 * @example
 * const { clause, params } = likeWhere(["name", "contractor"], "acme");
 * // clause: "name ILIKE ? OR contractor ILIKE ?"
 * // params: ["%acme%", "%acme%"]
 */
export function likeWhere(
  columns: string[],
  query: string
): { clause: string; params: string[] } {
  const pattern = `%${query}%`;
  return {
    clause: columns.map((c) => `${c} ILIKE ?`).join(" OR "),
    params: columns.map(() => pattern),
  };
}

/**
 * Run a full ILIKE search query against a table.
 *
 * @example
 * const rows = await likeSearch<Estimate>({
 *   table: "estimates",
 *   columns: ["name", "estimate_number", "contractor"],
 *   query: "acme",
 *   orderBy: "synced_at DESC",
 *   limit: 50,
 * });
 */
export async function likeSearch<T>(opts: {
  table: string;
  columns: string[];
  query: string;
  select?: string;
  joins?: string;
  extraWhere?: string;
  orderBy?: string;
  limit?: number;
}): Promise<T[]> {
  const { clause, params } = likeWhere(opts.columns, opts.query);
  const allParams: unknown[] = [...params];

  let sql = `SELECT ${opts.select ?? "*"} FROM ${opts.table}`;
  if (opts.joins) {
    sql += ` ${opts.joins}`;
  }
  sql += ` WHERE (${clause})`;
  if (opts.extraWhere) {
    sql += ` AND (${opts.extraWhere})`;
  }
  if (opts.orderBy) {
    sql += ` ORDER BY ${opts.orderBy}`;
  }
  if (opts.limit != null) {
    sql += " LIMIT ?";
    allParams.push(opts.limit);
  }

  return await db.query<T>(sql).all(...allParams);
}
