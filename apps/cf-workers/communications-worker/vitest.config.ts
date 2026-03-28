import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:workers": "./tests/cloudflare-workers-shim.ts",
    },
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**"],
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    passWithNoTests: false,
    testTimeout: 60_000,
  },
});
