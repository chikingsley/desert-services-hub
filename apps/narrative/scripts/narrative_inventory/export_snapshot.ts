/**
 * Export narrative inventory outputs (from local intake dir) into a committed workflow folder.
 *
 * Source (ignored, local):
 *   apps/narrative/data/intake/eva-to-jayson/variable-inventory/
 *
 * Destination (committed):
 *   apps/narrative/workflows/eva-jayson-variable-inventory/artifacts/
 *
 * Usage:
 *   bun apps/narrative/scripts/narrative_inventory/export_snapshot.ts
 */

import { parseArgs } from "node:util";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

function main(): void {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      from: {
        type: "string",
        default: "apps/narrative/data/intake/eva-to-jayson/variable-inventory",
      },
      to: {
        type: "string",
        default: "apps/narrative/workflows/eva-jayson-variable-inventory/artifacts",
      },
    },
    allowPositionals: false,
  });

  const fromDir = String(values.from);
  const toDir = String(values.to);

  if (!existsSync(fromDir)) {
    throw new Error(`Source directory not found: ${fromDir}`);
  }
  mkdirSync(toDir, { recursive: true });

  const explicitFiles = ["REPORT.md", "CANONICAL_MVP.tsv", "CANONICAL_DOCS.tsv"];
  const copied: string[] = [];

  for (const name of explicitFiles) {
    const src = join(fromDir, name);
    if (!existsSync(src)) continue;
    const dst = join(toDir, name);
    copyFileSync(src, dst);
    copied.push(name);
  }

  // Copy any generated diff markdowns as examples.
  for (const name of readdirSync(fromDir)) {
    if (!name.startsWith("DIFF_") || !name.endsWith(".md")) continue;
    const src = join(fromDir, name);
    const dst = join(toDir, name);
    copyFileSync(src, dst);
    copied.push(name);
  }

  console.log(`Copied ${copied.length} artifact file(s) to ${toDir}`);
  for (const f of copied.sort()) {
    console.log(`  - ${f}`);
  }
}

main();

