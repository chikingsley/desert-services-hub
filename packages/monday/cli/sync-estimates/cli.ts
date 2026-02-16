#!/usr/bin/env bun
import { SharePointClient } from "@sharepoint/client";
import { syncEstimateFolders } from "./core";

const DEFAULT_CONCURRENCY = 15;
const ICON_CREATED = "\u2713";
const ICON_ERROR = "\u2717";
const ICON_MOVED = "\u2192";
const ICON_SKIPPED = "\u2013";

const STATUS_ICONS: Record<string, string> = {
  created: ICON_CREATED,
  error: ICON_ERROR,
  moved: ICON_MOVED,
  skipped: ICON_SKIPPED,
};

interface CliArgs {
  limit?: number;
  concurrency?: number;
  dryRun: boolean;
}

function parseCliArgs(): CliArgs {
  const args = process.argv.slice(2);

  const limit = parseNumericArg(args, "--limit");
  const concurrency = parseNumericArg(args, "--concurrency");
  const dryRun = args.includes("--dry-run");

  return {
    concurrency,
    dryRun,
    limit,
  };
}

function parseNumericArg(
  args: string[],
  key: "--limit" | "--concurrency"
): number | undefined {
  const direct = args.find((a) => a.startsWith(`${key}=`));
  if (direct) {
    const parsed = Number.parseInt(direct.slice(key.length + 1), 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  const index = args.indexOf(key);
  if (index !== -1 && args[index + 1]) {
    const parsed = Number.parseInt(args[index + 1], 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

function logProgress(
  total: number,
  dryRun: boolean
): (progress: {
  phase: "fetching" | "syncing" | "complete";
  current?: number;
  total?: number;
  itemName?: string;
  status?: string;
  filesUploaded?: number;
  action?: string;
  errorMessage?: string;
}) => void {
  return (p) => {
    if (p.phase === "fetching") {
      console.log("Fetching items from Monday.com...");
      return;
    }

    if (p.phase === "syncing" && p.current !== undefined) {
      const syncing = p as {
        current: number;
        total?: number;
        itemName?: string;
        status?: string;
        filesUploaded?: number;
        action?: string;
        errorMessage?: string;
      };
      logSyncing(syncing, total, dryRun);
    }
  };
}

function logSyncing(
  progress: {
    current: number;
    total?: number;
    itemName?: string;
    status?: string;
    filesUploaded?: number;
    action?: string;
    errorMessage?: string;
  },
  total: number,
  dryRun: boolean
): void {
  if (progress.current === 1) {
    console.log(`Found ${total} estimates\n`);
    if (dryRun) {
      console.log("DRY RUN \u2014 no folders will be created or moved\n");
    }
  }

  if (progress.itemName) {
    const icon = progress.status ? (STATUS_ICONS[progress.status] ?? "?") : "?";
    const label = (progress.status ?? "unknown").padEnd(7);
    const name = progress.itemName.slice(0, 45).padEnd(45);
    const files =
      progress.filesUploaded !== undefined
        ? `  [${progress.filesUploaded} files]`
        : "";
    const extra = progress.action ? `  ${progress.action}` : "";

    console.log(
      `[${progress.current}/${total}] ${icon} ${label} ${name}${files}${extra}`
    );

    if (progress.status === "error" && progress.errorMessage) {
      console.log(`    ERROR: ${progress.errorMessage}`);
    }
  }
}

export function main(): void {
  const { limit, concurrency, dryRun } = parseCliArgs();

  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!(tenantId && clientId && clientSecret)) {
    console.error(
      "Missing required AZURE_TENANT_ID, AZURE_CLIENT_ID, or AZURE_CLIENT_SECRET env vars"
    );
    process.exit(1);
  }

  const sp = new SharePointClient({
    azureClientId: clientId,
    azureClientSecret: clientSecret,
    azureTenantId: tenantId,
  });

  console.log("=".repeat(50));
  console.log("MONDAY > SHAREPOINT FOLDER SYNC");
  console.log("=".repeat(50));
  console.log(`Limit: ${limit ?? "all"}`);
  console.log(`Concurrency: ${concurrency ?? DEFAULT_CONCURRENCY}`);
  console.log(`Dry run: ${dryRun}`);
  console.log("=".repeat(50), "\n");

  const total = (limit && limit > 0 ? limit : 0) ?? 0;

  syncEstimateFolders(sp, {
    concurrency,
    dryRun,
    limit,
    onProgress: logProgress(total, dryRun),
  })
    .then((result) => {
      console.log(`\n${"=".repeat(50)}`);
      console.log("SYNC COMPLETE");
      console.log("=".repeat(50));
      console.log(`Created: ${result.created}`);
      console.log(`Moved:   ${result.moved}`);
      console.log(`Skipped: ${result.skipped}`);
      console.log(`Files:   ${result.filesUploaded}`);

      if (result.errors.length > 0) {
        console.log(`\nErrors (${result.errors.length}):`);
        for (const err of result.errors.slice(0, 10)) {
          console.log(`  - ${err}`);
        }
        if (result.errors.length > 10) {
          console.log(`  ... and ${result.errors.length - 10} more`);
        }
      }
    })
    .catch((error) => {
      console.error("Sync failed:", error);
      process.exit(1);
    });
}

if (import.meta.main) {
  main();
}
