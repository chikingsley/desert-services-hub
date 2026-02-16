#!/usr/bin/env bun

import { runRetryAttachmentFailedParse } from "@email/sync/retry-attachment-failed-parse";

runRetryAttachmentFailedParse(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
