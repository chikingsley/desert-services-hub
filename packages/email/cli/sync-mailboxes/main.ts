import { parseArgs, printHelp, printSummaryHeader } from "./args";
import { runMailboxSync, showSyncStatus } from "./core";

export async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
  }

  if (args.includes("status")) {
    await showSyncStatus();
    return;
  }

  const options = parseArgs(args);
  printSummaryHeader(options);
  await runMailboxSync(options);
}
