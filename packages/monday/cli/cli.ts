#!/usr/bin/env bun
/**
 * Desert Monday CLI
 *
 * Command-line interface for Monday.com operations.
 *
 * Usage:
 *   bun packages/monday/cli/cli.ts <command> [options]
 */
import { runMondayCli } from "./runner";

const args = process.argv.slice(2);

runMondayCli(args).catch((error) => {
  if (error instanceof Error) {
    console.error(error.message);
    console.error("Use `--help` for usage");
  } else {
    console.error(error);
  }
  process.exit(1);
});
