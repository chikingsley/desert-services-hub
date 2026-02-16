#!/usr/bin/env bun
import { parseCliArgs, runWatcher } from "./docusign-link-watcher/core";

runWatcher(parseCliArgs()).catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
