#!/usr/bin/env bun

import { runImmutableIds } from "@email/sync/immutable-ids";

const args = process.argv.slice(2);

runImmutableIds(args).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
