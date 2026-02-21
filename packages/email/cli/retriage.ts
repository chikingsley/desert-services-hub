#!/usr/bin/env bun

import { runRetriage } from "@email/sync/retriage";

runRetriage(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
