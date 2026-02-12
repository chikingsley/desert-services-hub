#!/usr/bin/env bun
/**
 * Desert SDS List CLI
 *
 * Usage:
 *   bun apps/cli-tools/sds-cli/bin/cli.ts init <output.json>
 *   bun apps/cli-tools/sds-cli/bin/cli.ts generate --in <input.json> --out <output.pdf> [--include-sheets] [--download-sheets-from-url] [--fail-on-missing-sheets]
 */

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { generatePdf } from "../src/generate";
import { templateDoc } from "../src/template";

function ensureDir(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

function die(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(msg);
  process.exit(1);
}

function help() {
  // eslint-disable-next-line no-console
  console.log(`
Desert SDS CLI

Usage:
  bun apps/cli-tools/sds-cli/bin/cli.ts init <output.json>
  bun apps/cli-tools/sds-cli/bin/cli.ts generate --in <input.json> --out <output.pdf> [--include-sheets] [--download-sheets-from-url] [--fail-on-missing-sheets]
`);
}

const cmd = Bun.argv[2];
if (!cmd || cmd === "--help" || cmd === "-h") {
  help();
  process.exit(0);
}

if (cmd === "init") {
  const out = Bun.argv[3];
  if (!out) {
    die("init requires an output path: init <output.json>");
  }
  const outPath = resolve(out);
  ensureDir(outPath);
  await Bun.write(outPath, `${JSON.stringify(templateDoc(), null, 2)}\n`);
  // eslint-disable-next-line no-console
  console.log(`Wrote template JSON: ${outPath}`);
  process.exit(0);
}

if (cmd === "generate") {
  const { values } = parseArgs({
    args: Bun.argv.slice(3),
    options: {
      in: { type: "string" },
      out: { type: "string" },
      "include-sheets": { type: "boolean", default: false },
      "download-sheets-from-url": { type: "boolean", default: false },
      "fail-on-missing-sheets": { type: "boolean", default: false },
    },
  });

  const inPath = values.in ? resolve(values.in) : null;
  const outPath = values.out ? resolve(values.out) : null;
  if (!(inPath && outPath)) {
    die("generate requires --in <input.json> --out <output.pdf>");
  }
  ensureDir(outPath);
  const result = await generatePdf(inPath, outPath, {
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
  process.exit(0);
}

die(`Unknown command: ${cmd}`);
