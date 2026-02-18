#!/usr/bin/env bun

import { main as runSyncEstimates } from "./sync-estimates/cli";

if (import.meta.main) {
  runSyncEstimates();
}
