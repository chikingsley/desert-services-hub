/**
 * Monday CLI command dispatcher.
 */

import { commandHandlers } from "./commands";
import { showHelp } from "./commands/args";

const args = process.argv.slice(2);

export async function runMondayCli(argsInput?: string[]): Promise<void> {
  const commandArgs = argsInput ?? args;
  const commandToRun = commandArgs[0];

  if (!commandToRun || commandToRun === "--help" || commandToRun === "-h") {
    showHelp();
    return;
  }

  const handler = commandHandlers[commandToRun];
  if (!handler) {
    throw new Error(`Unknown command: ${commandToRun}`);
  }

  try {
    await handler(commandArgs);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Usage:")) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}
