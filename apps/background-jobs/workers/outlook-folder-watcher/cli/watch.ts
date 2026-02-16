#!/usr/bin/env bun

/**
 * Folder Watcher — CLI Entry Point
 *
 * Thin wrapper around pollFolderWatcher() for standalone/debug use.
 * In production, the web container runs this via worker.ts instead.
 *
 * Usage:
 *   bun cli/watch.ts                    # Continuous polling (60s default)
 *   bun cli/watch.ts --once             # Single poll cycle then exit
 *   bun cli/watch.ts --interval=30000   # Custom interval (ms)
 */

import { pollFolderWatcher } from "@background-jobs/workers/outlook-folder-watcher/lib/poll";
import { getConfig } from "@background-jobs/workers/outlook-folder-watcher/lib/state";

// Parse CLI args
const args = process.argv.slice(2);
const once = args.includes("--once");
const intervalArg = args.find((a) => a.startsWith("--interval="));
const configInterval = await getConfig("poll_interval_ms");
const interval = intervalArg
  ? Number.parseInt(intervalArg.split("=")[1] ?? "60000", 10)
  : Number.parseInt(configInterval ?? "60000", 10);

console.log(`[Watch] Starting. Interval: ${interval}ms, Once: ${once}`);

if (once) {
  await pollFolderWatcher();
} else {
  while (true) {
    try {
      await pollFolderWatcher();
    } catch (err) {
      console.error("[Watch] Poll error:", err);
    }
    await Bun.sleep(interval);
  }
}
