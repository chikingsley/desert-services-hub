#!/usr/bin/env bun

/**
 * Estimate Email Linker — Standalone CLI
 *
 * Usage:
 *   bun apps/background-jobs/workers/estimate-email-linker/cli/run.ts --once
 *   bun apps/background-jobs/workers/estimate-email-linker/cli/run.ts --once --dry-run
 *   bun apps/background-jobs/workers/estimate-email-linker/cli/run.ts --interval=60000
 *   bun apps/background-jobs/workers/estimate-email-linker/cli/run.ts --min-id=0 --once
 *   bun apps/background-jobs/workers/estimate-email-linker/cli/run.ts --min-id=0 --batches=0 --enable-project-single
 */

import { pollEstimateEmailLinker } from "@/apps/background-jobs/workers/estimate-email-linker/lib/poll";

const args = process.argv.slice(2);
const once = args.includes("--once");
const dryRun = args.includes("--dry-run");

const intervalArg = args.find((a) => a.startsWith("--interval="));
const batchArg = args.find((a) => a.startsWith("--batch="));
const batchesArg = args.find((a) => a.startsWith("--batches="));
const minIdArg = args.find((a) => a.startsWith("--min-id="));
const enableProjectSingle = args.includes("--enable-project-single");

const interval = intervalArg
  ? Number.parseInt(intervalArg.split("=")[1] ?? "60000", 10)
  : 60_000;
const batchSize = batchArg
  ? Number.parseInt(batchArg.split("=")[1] ?? "500", 10)
  : 500;
const maxBatches = batchesArg
  ? Number.parseInt(batchesArg.split("=")[1] ?? "10", 10)
  : 10;
const minEmailId = minIdArg
  ? Number.parseInt(minIdArg.split("=")[1] ?? "0", 10)
  : undefined;

async function runOnce() {
  const stats = await pollEstimateEmailLinker({
    dryRun,
    batchSize,
    maxBatches,
    minEmailId,
    enableProjectSingle,
  });

  console.log(
    [
      "[estimate-email-linker] batch complete",
      `processed=${stats.processedEmails}`,
      `linksInserted=${stats.linksInserted}${dryRun ? " (dry-run)" : ""}`,
      `skippedAmbiguous=${stats.skippedAmbiguous}`,
      `skippedNoSignal=${stats.skippedNoSignal}`,
      `lastEmailId=${stats.lastEmailId}`,
    ].join(" | ")
  );
}

console.log(
  `[estimate-email-linker] start | once=${once} dryRun=${dryRun} interval=${interval}ms batch=${batchSize} batches=${maxBatches}${minEmailId != null ? ` minId=${minEmailId}` : ""} projectSingle=${enableProjectSingle}`
);

if (once) {
  await runOnce();
  process.exit(0);
}

while (true) {
  try {
    await runOnce();
  } catch (err) {
    console.error("[estimate-email-linker] error:", err);
  }
  await Bun.sleep(interval);
}
