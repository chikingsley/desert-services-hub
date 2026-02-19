#!/usr/bin/env bun

/**
 * SWPPP Sync — Status
 *
 * Shows current state of SWPPP work orders in Supabase Postgres.
 *
 * Usage:
 *   bun cli/status.ts
 */

import { getStatus } from "../lib/sync";

const status = await getStatus();

console.log("SWPPP Work Orders Status");
console.log("========================\n");

console.log("By Worksheet:");
for (const ws of status.byWorksheet) {
  console.log(`  ${ws.worksheet}: ${ws.count}`);
}

console.log(`\nTotal: ${status.total}`);
console.log(
  `Linked to account: ${status.linked} (${Math.round((100 * status.linked) / (status.total || 1))}%)`
);
console.log(`Unlinked: ${status.unlinked}`);
console.log(
  `\nContractors: ${status.uniqueContractors} unique, ${status.linkedContractors} linked`
);
