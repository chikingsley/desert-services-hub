#!/usr/bin/env bun
/**
 * Dust Permit Automation CLI
 *
 * Unified command-line interface for dust permit operations.
 *
 * Usage:
 *   bun src/cli.ts <command> [options]
 *   bun src/cli.ts list
 *   bun src/cli.ts create --flow new-company --form-data ./data.json
 *   bun src/cli.ts renew D0058823 --company "Weis Builders Inc"
 *   bun src/cli.ts close D0056240
 *   bun src/cli.ts delete --all
 *   bun src/cli.ts sync
 *
 * Run with --help to see all available commands.
 */

import { defineCommand, runMain } from "citty";

const main = defineCommand({
  meta: {
    name: "permit-cli",
    version: "1.0.0",
    description: "Dust permit automation CLI for Maricopa County portal",
  },
  subCommands: {
    // Query commands
    list: () => import("./commands/permit/list").then((m) => m.default),

    // Permit lifecycle commands
    create: () => import("./commands/permit/create").then((m) => m.default),
    renew: () => import("./commands/permit/renew").then((m) => m.default),
    revise: () => import("./commands/permit/revise").then((m) => m.default),
    close: () => import("./commands/permit/close").then((m) => m.default),
    delete: () => import("./commands/permit/delete").then((m) => m.default),

    // Data commands
    sync: () => import("./commands/sync").then((m) => m.default),
    scrape: () => import("./commands/scrape").then((m) => m.default),
  },
});

runMain(main);
