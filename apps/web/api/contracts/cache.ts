/**
 * Lightweight contracts list cache:
 * - short TTL response cache
 * - in-flight dedupe so identical requests share one DB query
 */

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const DEFAULT_CONTRACTS_LIST_CACHE_TTL_MS = 10_000;
const MAX_CACHE_ENTRIES = 200;

const contractsListCache = new Map<string, CacheEntry<unknown>>();
const contractsListInflight = new Map<string, Promise<unknown>>();

function resolveContractsListTtlMs(): number {
  const raw = process.env.CONTRACTS_LIST_CACHE_TTL_MS?.trim();
  if (!raw) {
    return DEFAULT_CONTRACTS_LIST_CACHE_TTL_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_CONTRACTS_LIST_CACHE_TTL_MS;
}

function pruneCache(now: number): void {
  for (const [key, entry] of contractsListCache) {
    if (entry.expiresAt <= now) {
      contractsListCache.delete(key);
    }
  }

  if (contractsListCache.size <= MAX_CACHE_ENTRIES) {
    return;
  }

  // Simple bounded memory policy: evict oldest insertion order entries.
  const overflow = contractsListCache.size - MAX_CACHE_ENTRIES;
  let removed = 0;
  for (const key of contractsListCache.keys()) {
    contractsListCache.delete(key);
    removed += 1;
    if (removed >= overflow) {
      break;
    }
  }
}

export function getContractsListCacheKey(url: URL): string {
  return url.searchParams.toString();
}

export function getCachedContractsListResponse<T>(key: string): T | null {
  const now = Date.now();
  const cached = contractsListCache.get(key);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= now) {
    contractsListCache.delete(key);
    return null;
  }
  return cached.value as T;
}

export function setCachedContractsListResponse<T>(key: string, value: T): void {
  const now = Date.now();
  pruneCache(now);
  contractsListCache.set(key, {
    value,
    expiresAt: now + resolveContractsListTtlMs(),
  });
}

export function getContractsListInflight<T>(key: string): Promise<T> | null {
  return (contractsListInflight.get(key) as Promise<T> | undefined) ?? null;
}

export function setContractsListInflight<T>(key: string, promise: Promise<T>): void {
  contractsListInflight.set(key, promise);
}

export function clearContractsListInflight(key: string): void {
  contractsListInflight.delete(key);
}

export function invalidateContractsListCache(): void {
  contractsListCache.clear();
  contractsListInflight.clear();
}

