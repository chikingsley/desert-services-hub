import { AsyncLocalStorage } from "node:async_hooks";
import { SQL as BunSQL, type SQL } from "bun";

// Explicit connection with prepare: false for Supavisor transaction-mode pooling.
// Named prepared statements are connection-specific but Supavisor rotates backend
// connections between requests, causing "prepared statement already exists" errors.
const databaseUrl = process.env.DATABASE_URL ?? "";
const DEFAULT_DB_POOL_MAX = 2;
const TEST_DEFAULT_DB_POOL_MAX = 1;

type DbPoolEnv = Record<string, string | undefined> & {
  NODE_ENV?: string;
};

function readPositiveIntEnv(
  key: string,
  fallback: number,
  env: Record<string, string | undefined> = process.env
): number {
  const raw = env[key]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed >= 1) {
    return parsed;
  }

  return fallback;
}

export function resolveDbPoolMax(env: DbPoolEnv = process.env): number {
  const fallback =
    env.NODE_ENV === "test" ? TEST_DEFAULT_DB_POOL_MAX : DEFAULT_DB_POOL_MAX;

  return readPositiveIntEnv("DB_POOL_MAX", fallback, env);
}

export const dbPoolMax = resolveDbPoolMax();

export function getDbPoolOptions(): { max: number; prepare: false } {
  return {
    max: dbPoolMax,
    prepare: false,
  };
}

let pool: SQL | null = null;

function getPool(): SQL {
  if (pool) {
    return pool;
  }
  pool = new BunSQL(databaseUrl, getDbPoolOptions());
  return pool;
}

const txStore = new AsyncLocalStorage<SQL>();

function conn(): SQL {
  return txStore.getStore() ?? getPool();
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
    return await getPool().begin(async (tx) => {
      return await txStore.run(tx as unknown as SQL, async () => await fn());
    });
  },
};

export const databasePath = process.env.DATABASE_URL ?? "";
