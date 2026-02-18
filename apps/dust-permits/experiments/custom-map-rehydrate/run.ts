#!/usr/bin/env bun

import { runRehydratedPipeline } from "./pipeline";
import type { ExtractedPlanHints, RehydrateOptions } from "./types";

type CliArgs = {
  inputPath: string | null;
  outputPath: string | null;
  options: RehydrateOptions;
};

function parseArgs(argv: string[]): CliArgs {
  const args = [...argv];
  const options: RehydrateOptions = {
    enableRoadGeometry: false,
  };

  let inputPath: string | null = null;
  let outputPath: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) {
      continue;
    }

    if (arg === "--input") {
      inputPath = args[i + 1] ?? null;
      i += 1;
      continue;
    }

    if (arg === "--out") {
      outputPath = args[i + 1] ?? null;
      i += 1;
      continue;
    }

    if (arg === "--with-roads") {
      options.enableRoadGeometry = true;
      continue;
    }

    if (arg === "--radius") {
      options.clusterRadiusMeters = Number(args[i + 1] ?? "500");
      i += 1;
      continue;
    }

    if (arg === "--max-roads") {
      options.maxRoads = Number(args[i + 1] ?? "5");
      i += 1;
      continue;
    }

    if (arg === "--max-intersections") {
      options.maxIntersections = Number(args[i + 1] ?? "4");
      i += 1;
      continue;
    }

    if (arg === "--size") {
      options.defaultSiteSizeMeters = Number(args[i + 1] ?? "150");
      i += 1;
      continue;
    }

    if (arg === "--aspect") {
      options.aspectRatio = Number(args[i + 1] ?? "1");
      i += 1;
      continue;
    }

    if (arg === "--api-key") {
      options.googleMapsApiKey = args[i + 1] ?? undefined;
      i += 1;
    }
  }

  return { inputPath, outputPath, options };
}

function printUsage(): void {
  console.log(`Usage:
  bun experiments/custom-map-rehydrate/run.ts --input <hints.json> [options]

Options:
  --with-roads            Fetch road geometry using Google Directions
  --radius <meters>       Cluster radius (default: 500)
  --max-roads <n>         Max road grounding lookups (default: 5)
  --max-intersections <n> Max intersection lookups (default: 4)
  --size <meters>         Default site size if missing in hints (default: 150)
  --aspect <ratio>        Width/height ratio for suggested bounds (default: 1)
  --api-key <key>         Override GOOGLE_MAPS_API_KEY for this run
  --out <path>            Write result JSON to a file
`);
}

async function main(): Promise<void> {
  const { inputPath, outputPath, options } = parseArgs(process.argv.slice(2));

  if (!inputPath) {
    printUsage();
    process.exit(1);
  }

  const file = Bun.file(inputPath);
  if (!(await file.exists())) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const hints = (await file.json()) as ExtractedPlanHints;
  const result = await runRehydratedPipeline(hints, options);

  console.log("\n=== Rehydrate Summary ===");
  console.log(`signals: ${result.signals.length}`);
  console.log(`clusters: ${result.clusters.length}`);
  console.log(`confidence: ${result.consensusConfidence}`);
  console.log(
    `consensus: ${result.consensusLocation ? `${result.consensusLocation.lat.toFixed(6)}, ${result.consensusLocation.lng.toFixed(6)}` : "none"}`
  );
  console.log(`roads: ${result.roadGeometries.length}`);

  if (result.suggestedBounds) {
    console.log(
      `bounds: N=${result.suggestedBounds.north.toFixed(6)} S=${result.suggestedBounds.south.toFixed(6)} E=${result.suggestedBounds.east.toFixed(6)} W=${result.suggestedBounds.west.toFixed(6)}`
    );
  }

  console.log("\n--- log ---");
  for (const line of result.log) {
    console.log(`- ${line}`);
  }

  const payload = JSON.stringify(result, null, 2);
  if (outputPath) {
    await Bun.write(outputPath, payload);
    console.log(`\nWrote output: ${outputPath}`);
  } else {
    console.log("\n--- result json ---");
    console.log(payload);
  }
}

main().catch((error) => {
  console.error("Failed:", error);
  process.exit(1);
});
