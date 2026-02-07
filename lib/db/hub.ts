/**
 * Hub Database Connection (Postgres via Bun.sql)
 *
 * Shared database connection for all hub operations across all apps.
 * All modules should import the db instance from here.
 *
 * Uses AsyncLocalStorage for transparent transaction support —
 * code inside db.transaction() automatically routes queries through
 * the transaction connection without any explicit `tx` parameter.
 *
 * Env: DATABASE_URL=postgres://user:pass@host:port/db
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { type SQL, sql } from "bun";

// AsyncLocalStorage holds the active transaction connection (if any).
// When code runs inside db.transaction(), all db calls automatically
// use the transaction connection instead of the default pool.
const txStore = new AsyncLocalStorage<SQL>();

/** Get the active connection: transaction-scoped if inside db.transaction(), otherwise the pool. */
function conn(): SQL {
  return txStore.getStore() ?? sql;
}

/** Convert SQLite-style `?` placeholders to Postgres `$1, $2, ...` */
function pgParams(query: string): string {
  let i = 0;
  return query.replace(/\?/g, () => `$${++i}`);
}

/**
 * Compatibility wrapper matching the old bun:sqlite API but backed by Postgres.
 *
 * All methods are async (return Promises). Call sites must use `await`.
 *
 * - db.run(sql, params?)        — execute DML/DDL
 * - db.query<T>(sql).all(...)   — SELECT returning T[]
 * - db.query<T>(sql).get(...)   — SELECT returning T | null
 * - db.prepare<T>(sql)          — alias for query()
 * - db.transaction(fn)          — wraps fn in BEGIN/COMMIT with automatic rollback
 */
export const db = {
  /** Execute a statement (INSERT, UPDATE, DELETE, DDL). */
  async run(query: string, params?: unknown[]) {
    return await conn().unsafe(pgParams(query), params);
  },

  /** Create a reusable query handle with .all() and .get(). */
  query<T, _P = unknown>(query: string) {
    const pg = pgParams(query);
    return {
      async all(...params: unknown[]): Promise<T[]> {
        return (await conn().unsafe(pg, params)) as T[];
      },
      async get(...params: unknown[]): Promise<T | null> {
        const rows = await conn().unsafe(pg, params);
        return (rows[0] as T) ?? null;
      },
      /** Alias for run — executes the statement with params. */
      async run(...params: unknown[]) {
        return await conn().unsafe(pg, params);
      },
    };
  },

  /** Alias for query() — same async interface. */
  prepare<T, _P = unknown>(query: string) {
    return this.query<T>(query);
  },

  /**
   * Run fn inside a Postgres transaction.
   * All db.run / db.query calls within fn automatically use the transaction.
   */
  async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    return await sql.begin(async (tx) => {
      return await txStore.run(tx as unknown as SQL, async () => await fn());
    });
  },
};

/** Connection string for debugging/logging. */
export const databasePath = process.env.DATABASE_URL ?? "";
