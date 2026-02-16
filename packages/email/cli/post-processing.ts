#!/usr/bin/env bun

import { runEmailPostProcessing } from "@email/sync/post";

runEmailPostProcessing().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
