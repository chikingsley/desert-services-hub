#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { join } from "node:path";

interface CloudflareWorker {
  dir: string;
  name: string;
  url?: string;
}

interface RuntimeRegistry {
  compose: {
    required: string[];
    optional: string[];
  };
  legacySystemdOverlapUnits: string[];
  cloudflare: {
    deploymentWorkers: CloudflareWorker[];
  };
}

const key = process.argv[2];
if (!key) {
  console.error(
    "Usage: bun scripts/runtime-registry.ts <compose.required|compose.optional|legacySystemdOverlapUnits|cloudflare.deploymentWorkers>"
  );
  process.exit(1);
}

const registryPath = join(
  import.meta.dir,
  "..",
  "ops",
  "runtime",
  "worker-registry.json"
);
const registry = JSON.parse(
  readFileSync(registryPath, "utf8")
) as RuntimeRegistry;

function printLines(values: string[]): void {
  for (const value of values) {
    console.log(value);
  }
}

switch (key) {
  case "compose.required":
    printLines(registry.compose.required);
    break;
  case "compose.optional":
    printLines(registry.compose.optional);
    break;
  case "legacySystemdOverlapUnits":
    printLines(registry.legacySystemdOverlapUnits);
    break;
  case "cloudflare.deploymentWorkers":
    printLines(
      registry.cloudflare.deploymentWorkers.map(
        (worker) => `${worker.dir}|${worker.name}|${worker.url ?? ""}`
      )
    );
    break;
  default:
    console.error(`Unknown key: ${key}`);
    process.exit(1);
}
