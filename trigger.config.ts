import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_wkzoqdssbjqgovmwhvjq",
  runtime: "node",
  maxDuration: 7200,
  dirs: ["./apps/trigger-dev/src/trigger"],
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30_000,
      factor: 2,
      randomize: true,
    },
  },
});
