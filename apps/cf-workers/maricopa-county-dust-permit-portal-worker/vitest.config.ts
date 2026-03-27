import { defineConfig } from "vitest/config";

/**
 * Default: real integration tests only (AZDEQ NOI + Maricopa Assessor over the network).
 * Fast offline checks: `bun run test:unit`
 */
export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**"],
    fileParallelism: false,
    hookTimeout: 60_000,
    include: ["tests/**/*-live.test.ts"],
    passWithNoTests: false,
    pool: "forks",
    testTimeout: 60_000,
  },
});
