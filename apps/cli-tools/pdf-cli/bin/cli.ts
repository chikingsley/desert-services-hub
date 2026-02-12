#!/usr/bin/env bun

/**
 * Desert PDF CLI
 *
 * Usage:
 *   bun apps/cli-tools/pdf-cli/bin/cli.ts safety sssp init <output.json>
 *   bun apps/cli-tools/pdf-cli/bin/cli.ts safety sssp generate --in <input.json> --out <output.pdf>
 *   bun apps/cli-tools/pdf-cli/bin/cli.ts safety sds init <output.json>
 *   bun apps/cli-tools/pdf-cli/bin/cli.ts safety sds generate --in <input.json> --out <output.pdf> [--include-sheets] [--download-sheets-from-url] [--fail-on-missing-sheets]
 */

import { parseArgs } from "node:util";
import { die, ensureDir, resolvePath } from "../src/common";
import {
  generatePdf as generateSdsPdf,
  type GeneratePdfResult as SdsGenerateResult,
} from "../src/safety/sds/generate";
import { templateDoc as sdsTemplateDoc } from "../src/safety/sds/template";
import { generatePdf as generateSsspPdf } from "../src/safety/sssp/generate";
import { templateDoc as ssspTemplateDoc } from "../src/safety/sssp/template";

type SafetyDocKind = "sds" | "sssp";
type SafetyAction = "init" | "generate";

function isSafetyDocKind(value: string): value is SafetyDocKind {
  return value === "sds" || value === "sssp";
}

function isSafetyAction(value: string): value is SafetyAction {
  return value === "init" || value === "generate";
}

function help(): void {
  // eslint-disable-next-line no-console
  console.log(`
Desert PDF CLI

Usage:
  bun apps/cli-tools/pdf-cli/bin/cli.ts safety sssp init <output.json>
  bun apps/cli-tools/pdf-cli/bin/cli.ts safety sssp generate --in <input.json> --out <output.pdf>

  bun apps/cli-tools/pdf-cli/bin/cli.ts safety sds init <output.json>
  bun apps/cli-tools/pdf-cli/bin/cli.ts safety sds generate --in <input.json> --out <output.pdf> [--include-sheets] [--download-sheets-from-url] [--fail-on-missing-sheets]
`);
}

async function handleSafetyInit(
  kind: SafetyDocKind,
  argv: string[]
): Promise<void> {
  const outputPath = argv[0];
  if (!outputPath) {
    die(`init requires an output path: safety ${kind} init <output.json>`);
  }

  const outPath = resolvePath(outputPath);
  const template = kind === "sds" ? sdsTemplateDoc() : ssspTemplateDoc();

  ensureDir(outPath);
  await Bun.write(outPath, `${JSON.stringify(template, null, 2)}\n`);
  // eslint-disable-next-line no-console
  console.log(`Wrote template JSON: ${outPath}`);
}

function parseInOut(argv: string[]): { inPath: string; outPath: string } {
  const { values } = parseArgs({
    args: argv,
    options: {
      in: { type: "string" },
      out: { type: "string" },
    },
  });

  const inPath = values.in ? resolvePath(values.in) : null;
  const outPath = values.out ? resolvePath(values.out) : null;
  if (!(inPath && outPath)) {
    die("generate requires --in <input.json> --out <output.pdf>");
  }

  return { inPath, outPath };
}

async function handleSafetySsspGenerate(argv: string[]): Promise<void> {
  const { inPath, outPath } = parseInOut(argv);
  ensureDir(outPath);
  await generateSsspPdf(inPath, outPath);
  // eslint-disable-next-line no-console
  console.log(`Wrote PDF: ${outPath}`);
}

async function handleSafetySdsGenerate(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      in: { type: "string" },
      out: { type: "string" },
      "include-sheets": { type: "boolean", default: false },
      "download-sheets-from-url": { type: "boolean", default: false },
      "fail-on-missing-sheets": { type: "boolean", default: false },
    },
  });

  const inPath = values.in ? resolvePath(values.in) : null;
  const outPath = values.out ? resolvePath(values.out) : null;
  if (!(inPath && outPath)) {
    die("generate requires --in <input.json> --out <output.pdf>");
  }

  ensureDir(outPath);
  const result: SdsGenerateResult = await generateSdsPdf(inPath, outPath, {
    includeSheets: values["include-sheets"],
    downloadSheetsFromUrl: values["download-sheets-from-url"],
    failOnMissingSheets: values["fail-on-missing-sheets"],
  });

  // eslint-disable-next-line no-console
  console.log(`Wrote PDF: ${outPath}`);
  if (values["include-sheets"]) {
    // eslint-disable-next-line no-console
    console.log(
      `Sheets included: ${result.sheetsIncluded}, skipped: ${result.sheetsSkipped}`
    );
  }
}

async function handleSafetyGenerate(
  kind: SafetyDocKind,
  argv: string[]
): Promise<void> {
  if (kind === "sds") {
    await handleSafetySdsGenerate(argv);
    return;
  }

  await handleSafetySsspGenerate(argv);
}

async function main(): Promise<void> {
  const [domain, kindArg, actionArg, ...rest] = Bun.argv.slice(2);

  if (!domain || domain === "--help" || domain === "-h") {
    help();
    process.exit(0);
  }

  if (domain !== "safety") {
    die(`Unknown namespace: ${domain}. Expected: safety`);
  }

  if (!(kindArg && isSafetyDocKind(kindArg))) {
    die("Missing or invalid document type. Expected one of: sssp, sds");
  }

  if (!(actionArg && isSafetyAction(actionArg))) {
    die("Missing or invalid action. Expected one of: init, generate");
  }

  if (actionArg === "init") {
    await handleSafetyInit(kindArg, rest);
    process.exit(0);
  }

  await handleSafetyGenerate(kindArg, rest);
  process.exit(0);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  die(message);
});
