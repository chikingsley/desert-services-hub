#!/usr/bin/env bun
/**
 * Desert SSSP CLI
 *
 * Usage:
 *   bun apps/cli-tools/sssp-cli/bin/cli.ts init <output.json>
 *   bun apps/cli-tools/sssp-cli/bin/cli.ts generate --in <input.json> --out <output.pdf>
 */

import { parseArgs } from "node:util";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { templateDoc } from "../src/template";
import { generatePdf } from "../src/generate";

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
Desert SSSP CLI

Usage:
  bun apps/cli-tools/sssp-cli/bin/cli.ts init <output.json>
  bun apps/cli-tools/sssp-cli/bin/cli.ts generate --in <input.json> --out <output.pdf>
`);
}

const cmd = Bun.argv[2];
if (!cmd || cmd === "--help" || cmd === "-h") {
  help();
  process.exit(0);
}

if (cmd === "init") {
  const out = Bun.argv[3];
  if (!out) die("init requires an output path: init <output.json>");
  const outPath = resolve(out);
  ensureDir(outPath);
  await Bun.write(outPath, JSON.stringify(templateDoc(), null, 2) + "\n");
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
    },
  });

  const inPath = values.in ? resolve(values.in) : null;
  const outPath = values.out ? resolve(values.out) : null;
  if (!inPath || !outPath) {
    die("generate requires --in <input.json> --out <output.pdf>");
  }
  ensureDir(outPath);
  await generatePdf(inPath, outPath);
  // eslint-disable-next-line no-console
  console.log(`Wrote PDF: ${outPath}`);
  process.exit(0);
}

die(`Unknown command: ${cmd}`);

