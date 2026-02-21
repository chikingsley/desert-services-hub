import { resolve } from "node:path";
import { runArcGisExportCli, runArcGisSyncCli } from "./cli-arcgis";

function readFlag(argv: string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0) {
    return null;
  }
  return argv[index + 1] ?? null;
}

function readFlags(argv: string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag && argv[index + 1]) {
      values.push(argv[index + 1]);
    }
  }
  return values;
}

function parsePositiveIntegerFlag(
  argv: string[],
  flag: string,
  defaultValue: number
): number | null {
  const value = Number(readFlag(argv, flag) ?? `${defaultValue}`);
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

export async function runArcGisSyncFromArgv(
  argv: string[],
  defaultDbPath: string
): Promise<void> {
  const dbPath = resolve(readFlag(argv, "--db") ?? defaultDbPath);
  const layerKeys = readFlags(argv, "--layer");
  const pageSize = parsePositiveIntegerFlag(argv, "--page-size", 1000);
  const delayMs = parsePositiveIntegerFlag(argv, "--delay-ms", 25);

  if (!pageSize) {
    throw new Error("--page-size must be a positive integer");
  }
  if (delayMs === null) {
    throw new Error("--delay-ms must be a positive integer");
  }

  await runArcGisSyncCli({
    dbPath,
    layerKeys,
    pageSize,
    delayMs,
  });
}

export async function runArcGisExportFromArgv(
  argv: string[],
  defaultDbPath: string,
  defaultOutputDir: string
): Promise<void> {
  const dbPath = resolve(readFlag(argv, "--db") ?? defaultDbPath);
  const outputDir = resolve(readFlag(argv, "--out-dir") ?? defaultOutputDir);
  const perLayer = parsePositiveIntegerFlag(argv, "--per-layer", 20);

  if (!perLayer) {
    throw new Error("--per-layer must be a positive integer");
  }

  await runArcGisExportCli({
    dbPath,
    outputDir,
    perLayer,
  });
}
