/**
 * File-based MSAL token cache for persistent Azure AD authentication.
 * Stores tokens in data/.token-cache.json to avoid repeated logins.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ICachePlugin, TokenCacheContext } from "@azure/msal-node";

// Store token cache in project data directory
const CACHE_FILE = join(import.meta.dir, "../../data/.token-cache.json");

/**
 * Simple file-based token cache plugin for MSAL
 * Works with Bun's native file APIs
 */
export const fileCachePlugin: ICachePlugin = {
  async beforeCacheAccess(cacheContext: TokenCacheContext): Promise<void> {
    try {
      if (existsSync(CACHE_FILE)) {
        const cacheData = await Bun.file(CACHE_FILE).text();
        cacheContext.tokenCache.deserialize(cacheData);
      }
    } catch {
      // Cache doesn't exist or is corrupted - start fresh
      console.warn("Could not load token cache, will create new one");
    }
  },

  async afterCacheAccess(cacheContext: TokenCacheContext): Promise<void> {
    if (cacheContext.cacheHasChanged) {
      try {
        const cacheData = cacheContext.tokenCache.serialize();
        await Bun.write(CACHE_FILE, cacheData);
      } catch (error) {
        console.warn("Could not save token cache:", error);
      }
    }
  },
};

export function getCacheFilePath(): string {
  return CACHE_FILE;
}
