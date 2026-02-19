import { AsyncLocalStorage } from "node:async_hooks";
import { type SQL, sql } from "bun";

const txStore = new AsyncLocalStorage<SQL>();

function conn(): SQL {
  return txStore.getStore() ?? sql;
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
    return await sql.begin(async (tx) => {
      return await txStore.run(tx as unknown as SQL, async () => await fn());
    });
  },
};

export const databasePath = process.env.DATABASE_URL ?? "";
