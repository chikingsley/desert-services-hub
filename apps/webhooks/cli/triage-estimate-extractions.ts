#!/usr/bin/env bun

import { runEstimateExtractionTriage } from "@/apps/webhooks/lib/estimate-extraction-triage";

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

async function main(): Promise<void> {
  const provider = (process.env.ESTIMATE_TRIAGE_PROVIDER ?? "mistral").trim();
  const maxRows = parsePositiveInt(process.env.ESTIMATE_TRIAGE_MAX_ROWS, 25);

  const result = await runEstimateExtractionTriage({
    provider,
    maxRows,
    includeNullNonPdf: true,
    onlyUntaggedFailed: true,
  });

  console.log(
    `[triage] done candidates=${result.candidateRows} fixed=${result.fixedByRetry} non_estimate=${result.markedNonEstimate} non_pdf=${result.markedNonPdf} unknown=${result.markedUnknown} retry_failed=${result.retryStillFailed} no_asset=${result.skippedNoAsset}`
  );
}

main().catch((error) => {
  const msg =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`[triage] fatal ${msg}`);
  process.exit(1);
});
