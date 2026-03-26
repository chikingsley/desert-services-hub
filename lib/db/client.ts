import { AsyncLocalStorage } from "node:async_hooks";
import postgres from "postgres";

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

let pool: postgres.Sql | null = null;

function getPool(): postgres.Sql {
  if (pool) {
    return pool;
  }
  pool = postgres(databaseUrl, getDbPoolOptions());
  return pool;
}

// Sql and TransactionSql both have unsafe() — this is the shared shape
type SqlConnection = Pick<postgres.Sql, "unsafe">;

const txStore = new AsyncLocalStorage<SqlConnection>();

function conn(): SqlConnection {
  return txStore.getStore() ?? getPool();
}

// Exact parameter type that postgres.js unsafe() accepts
export type SqlParam = postgres.ParameterOrJSON<never>;

// Row constraint for db.query<T>() — re-exported so callers don't need to import postgres
export type DbRow = postgres.Row;

export const db = {
  async run(query: string, params?: SqlParam[]) {
    return await conn().unsafe(query, params);
  },

  query<T extends postgres.Row = postgres.Row, _P = unknown>(query: string) {
    return {
      async all(...params: SqlParam[]): Promise<T[]> {
        return await conn().unsafe<T[]>(query, params);
      },
      async get(...params: SqlParam[]): Promise<T | null> {
        const rows = await conn().unsafe<T[]>(query, params);
        return rows[0] ?? null;
      },
      async run(...params: SqlParam[]) {
        return await conn().unsafe(query, params);
      },
    };
  },

  async transaction<T>(fn: () => T | Promise<T>) {
    return await getPool().begin(async (tx) => {
      return await txStore.run(tx, async () => await fn());
    });
  },
};

export const databasePath = process.env.DATABASE_URL ?? "";
