import { defineConfig } from "vitest/config";

/** Offline / fixture tests (KML, worker health, create validation). Not the integration suite. */
export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "**/*-live.test.ts"],
    fileParallelism: false,
    hookTimeout: 30_000,
    include: ["tests/**/*.test.ts"],
    passWithNoTests: false,
    pool: "forks",
    testTimeout: 30_000,
  },
});
