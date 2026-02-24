import { AsyncLocalStorage } from "node:async_hooks";
import { SQL as BunSQL, type SQL } from "bun";

// Explicit connection with prepare: false for Supavisor transaction-mode pooling.
// Named prepared statements are connection-specific but Supavisor rotates backend
// connections between requests, causing "prepared statement already exists" errors.
const databaseUrl = process.env.DATABASE_URL ?? "";
const pool = new BunSQL(databaseUrl, { prepare: false });

const txStore = new AsyncLocalStorage<SQL>();

function conn(): SQL {
  return txStore.getStore() ?? pool;
}

export const db = {
  async run(query: string, params?: unknown[]) {
    return await conn().unsafe(query, params);
  },

  query<T, _P = unknown>(query: string) {
    return {
      async all(...params: unknown[]): Promise<T[]> {
        return (await conn().unsafe(query, params)) as T[];
      },
      async get(...params: unknown[]): Promise<T | null> {
        const rows = await conn().unsafe(query, params);
        return (rows[0] as T) ?? null;
      },
      async run(...params: unknown[]) {
        return await conn().unsafe(query, params);
      },
    };
  },

  async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    return await pool.begin(async (tx) => {
      return await txStore.run(tx as unknown as SQL, async () => await fn());
    });
  },
};

export const databasePath = process.env.DATABASE_URL ?? "";
