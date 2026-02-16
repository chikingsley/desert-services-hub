#!/usr/bin/env bun

import { main as runSyncEstimates } from "./sync-estimates/cli";

export { main as runSyncEstimates } from "./sync-estimates/cli";
export { syncEstimateFolders } from "./sync-estimates/core";

if (import.meta.main) {
  runSyncEstimates();
}
