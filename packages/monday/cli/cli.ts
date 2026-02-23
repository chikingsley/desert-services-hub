#!/usr/bin/env bun
/**
 * Desert Monday CLI
 *
 * Command-line interface for Monday.com operations.
 *
 * Usage:
 *   bun packages/monday/cli/cli.ts <command> [options]
 */
import { commandHandlers } from "./commands";
import { showHelp } from "./commands/args";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    showHelp();
    return;
  }

  const handler = commandHandlers[command];
  if (!handler) {
    throw new Error(`Unknown command: ${command}`);
  }

  try {
    await handler(args);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Usage:")) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(error.message);
    console.error("Use `--help` for usage");
  } else {
    console.error(error);
  }
  process.exit(1);
});
