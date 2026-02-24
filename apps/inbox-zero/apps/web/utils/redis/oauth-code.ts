import { createHash } from "node:crypto";
import { redis } from "@/utils/redis";

// Not password hashing - creating a short cache key for OAuth authorization codes
function createOAuthCodeCacheKey(code: string): string {
  return createHash("sha256").update(code).digest("hex").slice(0, 16);
}

function getCodeKey(code: string) {
  return `oauth-code:${createOAuthCodeCacheKey(code)}`;
}

interface OAuthCodeResult {
  params: Record<string, string>;
  status: "success";
}

const OAUTH_CODE_TTL_SECONDS = 60;
const OAUTH_CODE_TTL_MS = OAUTH_CODE_TTL_SECONDS * 1000;

type OAuthCodeValue = "processing" | OAuthCodeResult;
const memoryOAuthCodeCache = new Map<
  string,
  { value: OAuthCodeValue; expiresAt: number }
>();

function isRedisConfigured() {
  return Boolean(
    process.env.UPSTASH_REDIS_URL && process.env.UPSTASH_REDIS_TOKEN
  );
}

function cleanupExpiredMemoryEntries(now = Date.now()) {
  for (const [key, entry] of memoryOAuthCodeCache.entries()) {
    if (entry.expiresAt <= now) {
      memoryOAuthCodeCache.delete(key);
    }
  }
}

export async function acquireOAuthCodeLock(code: string): Promise<boolean> {
  const codeKey = getCodeKey(code);

  if (isRedisConfigured()) {
    try {
      const result = await redis.set(codeKey, "processing", {
        ex: OAUTH_CODE_TTL_SECONDS,
        nx: true, // Only set if key doesn't exist (atomic)
      });

      return result === "OK";
    } catch {
      // Fall back to in-memory lock for self-hosted setups without Redis.
    }
  }

  const now = Date.now();
  cleanupExpiredMemoryEntries(now);

  if (memoryOAuthCodeCache.has(codeKey)) {
    return false;
  }

  memoryOAuthCodeCache.set(codeKey, {
    value: "processing",
    expiresAt: now + OAUTH_CODE_TTL_MS,
  });
  return true;
}

export async function getOAuthCodeResult(
  code: string
): Promise<OAuthCodeResult | null> {
  const codeKey = getCodeKey(code);

  if (isRedisConfigured()) {
    try {
      const value = await redis.get<string | OAuthCodeResult>(codeKey);

      if (!value || value === "processing") {
        return null;
      }

      if (typeof value === "object" && value.status === "success") {
        return value;
      }

      return null;
    } catch {
      // Fall back to in-memory result cache.
    }
  }

  const now = Date.now();
  cleanupExpiredMemoryEntries(now);
  const entry = memoryOAuthCodeCache.get(codeKey);
  if (!entry) {
    return null;
  }
  if (entry.value === "processing") {
    return null;
  }
  return entry.value;
}

export async function setOAuthCodeResult(
  code: string,
  params: Record<string, string>
): Promise<void> {
  const codeKey = getCodeKey(code);
  const result: OAuthCodeResult = {
    status: "success",
    params,
  };

  if (isRedisConfigured()) {
    try {
      await redis.set(codeKey, result, { ex: OAUTH_CODE_TTL_SECONDS });
      return;
    } catch {
      // Fall back to in-memory result cache.
    }
  }

  memoryOAuthCodeCache.set(codeKey, {
    value: result,
    expiresAt: Date.now() + OAUTH_CODE_TTL_MS,
  });
}

/**
 * Clear the OAuth code from Redis.
 * Fails silently - cleanup errors should never mask the original error in catch blocks.
 */
export async function clearOAuthCode(code: string): Promise<void> {
  const codeKey = getCodeKey(code);
  try {
    if (isRedisConfigured()) {
      await redis.del(codeKey);
      return;
    }
  } catch {
    // Silently ignore - this is called in error handlers where we don't want
    // cleanup failures to mask the original error
  }

  memoryOAuthCodeCache.delete(codeKey);
}
