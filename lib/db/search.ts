/**
 * Shared ILIKE search builder for Postgres.
 *
 * Eliminates duplicated `%query%` pattern matching across repositories.
 * All placeholders use Postgres $1, $2 ... positional syntax.
 */
import { db } from "@lib/db/client";

/**
 * Build an ILIKE WHERE clause and its params.
 * Use when you need just the clause fragment for a complex query.
 *
 * @param startIndex - first $N placeholder index (default 1)
 * @returns clause, params, and nextIndex for chaining additional params
 *
 * @example
 * const { clause, params, nextIndex } = likeWhere(["name", "contractor"], "acme");
 * // clause: "name ILIKE $1 OR contractor ILIKE $2"
 * // params: ["%acme%", "%acme%"]
 * // nextIndex: 3
 */
export function likeWhere(
  columns: string[],
  query: string,
  startIndex = 1
): { clause: string; params: string[]; nextIndex: number } {
  const pattern = `%${query}%`;
  return {
    clause: columns.map((c, i) => `${c} ILIKE $${startIndex + i}`).join(" OR "),
    params: columns.map(() => pattern),
    nextIndex: startIndex + columns.length,
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
  const { clause, params, nextIndex } = likeWhere(opts.columns, opts.query);
  const allParams: unknown[] = [...params];
  let paramIndex = nextIndex;

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
    sql += ` LIMIT $${paramIndex++}`;
    allParams.push(opts.limit);
  }

  return await db.query<T>(sql).all(...allParams);
}
