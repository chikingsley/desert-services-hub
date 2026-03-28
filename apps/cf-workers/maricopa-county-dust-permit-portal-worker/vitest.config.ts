import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/**/*.ts"],
      provider: "v8",
      reportOnFailure: true,
      reporter: ["text", "html"],
    },
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**"],
    fileParallelism: false,
    hookTimeout: 60_000,
    include: ["tests/**/*.test.ts"],
    passWithNoTests: false,
    pool: "forks",
    testTimeout: 60_000,
  },
});
