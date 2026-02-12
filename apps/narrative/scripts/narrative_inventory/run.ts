/**
 * Narrative inventory workflow runner.
 *
 * Usage:
 *   bun apps/narrative/scripts/narrative_inventory/run.ts --all
 *   bun apps/narrative/scripts/narrative_inventory/run.ts --inventory --report --export
 *   bun apps/narrative/scripts/narrative_inventory/run.ts --diff
 *   bun apps/narrative/scripts/narrative_inventory/run.ts --validate
 */

import { parseArgs } from "node:util";

interface Step {
  name: string;
  cmd: string[];
}

function runStep(step: Step): void {
  console.log(`\n== ${step.name} ==`);
  const p = Bun.spawnSync({
    cmd: step.cmd,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (p.exitCode !== 0) {
    throw new Error(`${step.name} failed (exit=${p.exitCode})`);
  }
}

function main(): void {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      all: { type: "boolean", default: false },
      download: { type: "boolean", default: false },
      inventory: { type: "boolean", default: false },
      report: { type: "boolean", default: false },
      diff: { type: "boolean", default: false },
      export: { type: "boolean", default: false },
      validate: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  const runAll = Boolean(values.all);
  const steps: Step[] = [];

  const wantDownload = runAll || Boolean(values.download);
  const wantInventory = runAll || Boolean(values.inventory);
  const wantReport = runAll || Boolean(values.report);
  const wantDiff = runAll || Boolean(values.diff);
  const wantExport = runAll || Boolean(values.export);
  const wantValidate = runAll || Boolean(values.validate);

  if (wantDownload) {
    steps.push({
      name: "Download Eva -> Jayson Attachments",
      cmd: [
        "bun",
        "apps/narrative/scripts/narrative_inventory/download-eva-to-jayson-attachments.ts",
      ],
    });
  }
  if (wantInventory) {
    steps.push({
      name: "Build Raw Variable Inventory",
      cmd: [
        "bun",
        "apps/narrative/scripts/narrative_inventory/inventory-swppp-variables.ts",
      ],
    });
  }
  if (wantReport) {
    steps.push({
      name: "Build Canonical Report",
      cmd: [
        "bun",
        "apps/narrative/scripts/narrative_inventory/report-variable-inventory.ts",
      ],
    });
  }
  if (wantDiff) {
    steps.push({
      name: "Generate Example Diff",
      cmd: [
        "bun",
        "apps/narrative/scripts/narrative_inventory/diff-narratives.ts",
        "--auto",
      ],
    });
  }
  if (wantExport) {
    steps.push({
      name: "Export Snapshot Artifacts",
      cmd: [
        "bun",
        "apps/narrative/scripts/narrative_inventory/export-snapshot.ts",
      ],
    });
  }
  if (wantValidate) {
    steps.push({
      name: "Validate Deterministic Source Packets",
      cmd: [
        "uv",
        "run",
        "--directory",
        "apps/narrative",
        "python",
        "scripts/narrative_inventory/validate_source_packets.py",
        "--limit",
        "20",
        "--field-scope",
        "all",
        "--hard-block",
      ],
    });
  }

  if (steps.length === 0) {
    console.log(
      "No steps selected. Use --all or one of --download/--inventory/--report/--diff/--export/--validate"
    );
    return;
  }

  for (const s of steps) {
    runStep(s);
  }
  console.log("\nWorkflow complete.");
}

main();
