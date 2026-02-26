import { defineConfig } from "@trigger.dev/sdk";

const BUN_IMPORT_RE = /^bun$/;

export default defineConfig({
  project: "proj_cebbbbrvbstcozdvvnri",
  runtime: "bun",
  maxDuration: 300,
  dirs: ["./apps/trigger-dev/src/trigger"],
  build: {
    external: ["bun"],
    extensions: [
      {
        name: "bun-external",
        onBuildStart(context) {
          context.registerPlugin({
            name: "bun-external-plugin",
            setup(build) {
              build.onResolve({ filter: BUN_IMPORT_RE }, () => ({
                external: true,
              }));
            },
          });
        },
      },
    ],
  },
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
