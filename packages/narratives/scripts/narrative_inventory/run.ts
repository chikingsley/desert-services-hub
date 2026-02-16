/**
 * Narrative inventory workflow runner.
 *
 * Usage:
 *   bun packages/narratives/scripts/narrative_inventory/run.ts --all
 *   bun packages/narratives/scripts/narrative_inventory/run.ts --inventory --report --export
 *   bun packages/narratives/scripts/narrative_inventory/run.ts --diff
 *   bun packages/narratives/scripts/narrative_inventory/run.ts --validate
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
    stderr: "inherit",
    stdout: "inherit",
  });
  if (p.exitCode !== 0) {
    throw new Error(`${step.name} failed (exit=${p.exitCode})`);
  }
}

function main(): void {
  const { values } = parseArgs({
    allowPositionals: false,
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
      cmd: [
        "bun",
        "packages/narratives/scripts/narrative_inventory/download-eva-to-jayson-attachments.ts",
      ],
      name: "Download Eva -> Jayson Attachments",
    });
  }
  if (wantInventory) {
    steps.push({
      cmd: [
        "bun",
        "packages/narratives/scripts/narrative_inventory/inventory-swppp-variables.ts",
      ],
      name: "Build Raw Variable Inventory",
    });
  }
  if (wantReport) {
    steps.push({
      cmd: [
        "bun",
        "packages/narratives/scripts/narrative_inventory/report-variable-inventory.ts",
      ],
      name: "Build Canonical Report",
    });
  }
  if (wantDiff) {
    steps.push({
      cmd: [
        "bun",
        "packages/narratives/scripts/narrative_inventory/diff-narratives.ts",
        "--auto",
      ],
      name: "Generate Example Diff",
    });
  }
  if (wantExport) {
    steps.push({
      cmd: [
        "bun",
        "packages/narratives/scripts/narrative_inventory/export-snapshot.ts",
      ],
      name: "Export Snapshot Artifacts",
    });
  }
  if (wantValidate) {
    steps.push({
      cmd: [
        "uv",
        "run",
        "--directory",
        "packages/narratives",
        "python",
        "scripts/narrative_inventory/validate_source_packets.py",
        "--limit",
        "20",
        "--field-scope",
        "all",
        "--hard-block",
      ],
      name: "Validate Deterministic Source Packets",
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
