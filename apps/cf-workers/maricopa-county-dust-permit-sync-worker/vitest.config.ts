/**
 * Vitest configuration.
 *
 * References (read in order):
 * - https://vitest.dev/guide/ — Getting Started: `defineConfig` from `vitest/config`, `test` block, Node ≥ 20 / Vite ≥ 6
 * - https://vitest.dev/config/ — full `test.*` options
 * - https://vitest.dev/config/pool — default `forks`; keep `forks` when using Node `fetch` (see Common Errors → “Failed to Terminate Worker”)
 * - https://vitest.dev/config/fileparallelism — `fileParallelism: false` caps workers when running integration suites
 * - https://vitest.dev/guide/common-errors — `vite-tsconfig-paths` if you rely on `tsconfig` path aliases; merge `configDefaults.exclude` when adding custom `exclude`
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 30_000,
    include: ["tests/**/*.test.ts"],
    passWithNoTests: false,
    /** Explicit default: safe with native `fetch` (Vitest “Common Errors”). */
    pool: "forks",
    testTimeout: 30_000,
  },
});
