#!/usr/bin/env bun
import { main } from "./sync-mailboxes/main";

main().catch((error) => {
  console.error("Sync failed:", error);
  process.exit(1);
});
