#!/usr/bin/env bun

/**
 * Desert Services Estimate CLI
 *
 * Usage:
 *   bun apps/quoting-cli/cli.ts list
 *   bun apps/quoting-cli/cli.ts get <estimate-id>
 *   bun apps/quoting-cli/cli.ts create --file new-estimate.json
 *   bun apps/quoting-cli/cli.ts update <estimate-id> --file changes.json
 *   bun apps/quoting-cli/cli.ts pdf <estimate-id> --output ./path/to/file.pdf
 *
 * JSON format for create:
 * {
 *   "jobName": "Kiwanis Playground",
 *   "clientName": "Caliente Construction",
 *   "lineItems": [
 *     {"code": "SWPPP-001", "quantity": 1},
 *     {"code": "DUST-001", "quantity": 1}
 *   ]
 * }
 *
 * JSON format for update:
 * {
 *   "remove": ["line-item-uuid-1", "line-item-uuid-2"],
 *   "add": [
 *     {"code": "SWPPP-001", "quantity": 1, "sectionId": "optional-section-id"}
 *   ],
 *   "notes": "Updated per client request"
 * }
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { findItem } from "../../lib/catalog";
import {
  applyLineItemChanges,
  type CreateEstimateInput,
  createEstimate,
  deleteEstimate,
  duplicateEstimate,
  getEstimate,
  getEstimateByBaseNumber,
  getEstimateNumber,
  getEstimateWithDetails,
  type LineItemChange,
  listEstimates,
  updateEstimate,
} from "../../lib/estimating";
import { generatePDF, getPDFFilename } from "../../lib/pdf/generate-pdf";
import type { EditorEstimate } from "../../lib/types";

const args = process.argv.slice(2);
const command = args[0];

function printUsage(): void {
  console.log(`
Desert Services Estimate CLI

Usage:
  bun apps/quoting-cli/cli.ts list [--limit 20]
  bun apps/quoting-cli/cli.ts get <estimate-id-or-base-number>
  bun apps/quoting-cli/cli.ts create --file new-estimate.json
  bun apps/quoting-cli/cli.ts update <estimate-id> --file changes.json
  bun apps/quoting-cli/cli.ts delete <estimate-id>
  bun apps/quoting-cli/cli.ts duplicate <estimate-id> [--name "New Name"]
  bun apps/quoting-cli/cli.ts pdf <estimate-id> [--output ./path/to/file.pdf]

Environment:
  DATABASE_PATH - Path to SQLite database (default: lib/db/app.db)

Examples:
  # List recent estimates
  bun apps/quoting-cli/cli.ts list --limit 10

  # Get estimate details
  bun apps/quoting-cli/cli.ts get 25122301
  bun apps/quoting-cli/cli.ts get abc-def-123

  # Create from JSON file
  bun apps/quoting-cli/cli.ts create --file ./new-estimate.json

  # Update with changes
  bun apps/quoting-cli/cli.ts update abc-def-123 --file ./changes.json

  # Generate PDF
  bun apps/quoting-cli/cli.ts pdf abc-def-123 --output ./Estimate-25122301R0.pdf
`);
}

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value && !value.startsWith("--")) {
        result[key] = value;
        i++;
      } else {
        result[key] = "true";
      }
    }
  }
  return result;
}

async function loadJsonFile<T>(path: string): Promise<T> {
  const content = await readFile(path, "utf-8");
  return JSON.parse(content) as T;
}

// List estimates
function listCommand(argv: string[]): void {
  const opts = parseArgs(argv);
  const limit = opts.limit ? Number.parseInt(opts.limit, 10) : 20;

  const estimates = listEstimates();
  const limited = estimates.slice(0, limit);

  if (limited.length === 0) {
    console.log("No estimates found.");
    return;
  }

  console.log(
    `${"Base #".padEnd(12)} ${"Job Name".padEnd(30)} ${"Client".padEnd(20)} ${"Status".padEnd(10)} ${"Versions"}`
  );
  console.log("-".repeat(80));

  for (const e of limited) {
    const currentVersion = e.versions.find((v) => v.is_current);
    const estimateNumber = currentVersion
      ? getEstimateNumber(e.base_number, currentVersion.version_number)
      : e.base_number;
    console.log(
      `${estimateNumber.padEnd(12)} ${e.job_name.slice(0, 28).padEnd(30)} ${(e.client_name || "-").slice(0, 18).padEnd(20)} ${e.status.padEnd(10)} ${e.versions.length}`
    );
  }

  console.log(`\nTotal: ${estimates.length} estimates`);
}

// Get estimate details
function getCommand(argv: string[]): void {
  const idOrBase = argv[0];
  if (!idOrBase) {
    console.error("Error: Estimate ID or base number is required");
    process.exit(1);
  }

  // Try to find by base number first, then by ID
  let estimate = getEstimateByBaseNumber(idOrBase);
  if (!estimate) {
    estimate = getEstimate(idOrBase);
  }

  if (!estimate) {
    console.error(`Estimate not found: ${idOrBase}`);
    process.exit(1);
  }

  const details = getEstimateWithDetails(estimate.id);
  if (!details) {
    console.error(`Failed to load estimate details: ${idOrBase}`);
    process.exit(1);
  }

  const currentVersion = details.current_version;
  const estimateNumber = getEstimateNumber(
    details.base_number,
    currentVersion.version_number
  );

  console.log(`\nEstimate: ${estimateNumber}`);
  console.log("-".repeat(40));
  console.log(`Job Name:   ${details.job_name}`);
  console.log(`Client:     ${details.client_name || "-"}`);
  console.log(`Address:    ${details.job_address || "-"}`);
  console.log(`Status:     ${details.status}`);
  console.log(`Created:    ${details.created_at}`);
  console.log(`Updated:    ${details.updated_at}`);

  if (details.notes) {
    console.log(`Notes:      ${details.notes}`);
  }

  console.log(
    `\nVersion:    ${currentVersion.version_number} (R${currentVersion.version_number - 1})`
  );
  console.log(`Total:      $${currentVersion.total.toFixed(2)}`);

  if (currentVersion.sections.length > 0) {
    console.log("\nSections:");
    for (const section of currentVersion.sections) {
      const sectionItems = currentVersion.line_items.filter(
        (i) => i.section_id === section.id
      );
      const sectionTotal = sectionItems.reduce(
        (sum, i) => sum + i.quantity * i.unit_cost,
        0
      );
      console.log(
        `  ${section.name}: ${sectionItems.length} items, $${sectionTotal.toFixed(2)}`
      );
    }
  }

  if (currentVersion.line_items.length > 0) {
    console.log("\nLine Items:");
    for (const item of currentVersion.line_items) {
      const total = item.quantity * item.unit_cost;
      console.log(
        `  ${item.description.slice(0, 40).padEnd(42)} ${String(item.quantity).padStart(4)} ${item.unit.padEnd(4)} $${total.toFixed(2).padStart(10)}`
      );
    }
  }
}

// Create estimate
async function createCommand(argv: string[]): Promise<void> {
  const opts = parseArgs(argv);

  if (!opts.file) {
    console.error("Error: --file is required");
    console.error(
      "Usage: bun apps/quoting-cli/cli.ts create --file new-estimate.json"
    );
    process.exit(1);
  }

  if (!existsSync(opts.file)) {
    console.error(`Error: File not found: ${opts.file}`);
    process.exit(1);
  }

  const data = await loadJsonFile<{
    jobName: string;
    clientName?: string;
    jobAddress?: string;
    clientEmail?: string;
    clientPhone?: string;
    notes?: string;
    lineItems?: Array<{
      code: string;
      quantity?: number;
      sectionId?: string;
    }>;
  }>(opts.file);

  const input: CreateEstimateInput = {
    job_name: data.jobName,
    client_name: data.clientName,
    job_address: data.jobAddress,
    client_email: data.clientEmail,
    client_phone: data.clientPhone,
    notes: data.notes,
    status: "draft",
  };

  // Convert line items from codes to descriptions
  if (data.lineItems && data.lineItems.length > 0) {
    input.line_items = [];
    for (const item of data.lineItems) {
      const catalogItem = findItem(item.code);
      if (catalogItem) {
        input.line_items.push({
          section_id: item.sectionId,
          description: `${catalogItem.code}: ${catalogItem.name}`,
          quantity: item.quantity ?? catalogItem.defaultQty ?? 1,
          unit: catalogItem.unit,
          unit_cost: catalogItem.price,
          notes: catalogItem.notes,
        });
      } else {
        console.warn(`Warning: Catalog item not found: ${item.code}`);
      }
    }
  }

  const estimate = createEstimate(input);
  const currentVersion = estimate.versions.find((v) => v.is_current);
  const estimateNumber = currentVersion
    ? getEstimateNumber(estimate.base_number, currentVersion.version_number)
    : estimate.base_number;

  console.log(`Created estimate: ${estimateNumber}`);
  console.log(`ID: ${estimate.id}`);
  console.log(`Job: ${estimate.job_name}`);
}

// Update estimate
async function updateCommand(argv: string[]): Promise<void> {
  const id = argv[0];
  if (!id) {
    console.error("Error: Estimate ID is required");
    process.exit(1);
  }

  const opts = parseArgs(argv.slice(1));

  if (!opts.file) {
    console.error("Error: --file is required");
    console.error(
      "Usage: bun apps/quoting-cli/cli.ts update <id> --file changes.json"
    );
    process.exit(1);
  }

  if (!existsSync(opts.file)) {
    console.error(`Error: File not found: ${opts.file}`);
    process.exit(1);
  }

  const estimate = getEstimate(id);
  if (!estimate) {
    console.error(`Estimate not found: ${id}`);
    process.exit(1);
  }

  const data = await loadJsonFile<{
    remove?: string[]; // Line item IDs to remove
    add?: Array<{
      code: string;
      quantity?: number;
      sectionId?: string;
    }>;
    notes?: string;
    status?: "draft" | "sent" | "accepted" | "declined";
  }>(opts.file);

  // Build line item changes
  const changes: LineItemChange[] = [];

  if (data.remove && data.remove.length > 0) {
    for (const lineItemId of data.remove) {
      changes.push({ action: "remove", id: lineItemId });
    }
  }

  if (data.add && data.add.length > 0) {
    for (const item of data.add) {
      const catalogItem = findItem(item.code);
      if (catalogItem) {
        changes.push({
          action: "add",
          section_id: item.sectionId,
          description: `${catalogItem.code}: ${catalogItem.name}`,
          quantity: item.quantity ?? catalogItem.defaultQty ?? 1,
          unit: catalogItem.unit,
          unit_cost: catalogItem.price,
          notes: catalogItem.notes,
        });
      } else {
        console.warn(`Warning: Catalog item not found: ${item.code}`);
      }
    }
  }

  // Apply line item changes
  if (changes.length > 0) {
    const result = applyLineItemChanges(id, changes);
    if (!result) {
      console.error("Failed to apply line item changes");
      process.exit(1);
    }
  }

  // Update estimate metadata
  if (data.notes !== undefined || data.status !== undefined) {
    const result = updateEstimate(id, {
      notes: data.notes,
      status: data.status,
    });
    if (!result) {
      console.error("Failed to update estimate");
      process.exit(1);
    }
  }

  console.log(`Updated estimate: ${id}`);
}

// Delete estimate
function deleteCommand(argv: string[]): void {
  const id = argv[0];
  if (!id) {
    console.error("Error: Estimate ID is required");
    process.exit(1);
  }

  const estimate = getEstimate(id);
  if (!estimate) {
    console.error(`Estimate not found: ${id}`);
    process.exit(1);
  }

  const currentVersion = estimate.versions.find((v) => v.is_current);
  const estimateNumber = currentVersion
    ? getEstimateNumber(estimate.base_number, currentVersion.version_number)
    : estimate.base_number;

  const success = deleteEstimate(id);
  if (success) {
    console.log(`Deleted estimate: ${estimateNumber}`);
  } else {
    console.error(`Failed to delete estimate: ${id}`);
    process.exit(1);
  }
}

// Duplicate estimate
function duplicateCommand(argv: string[]): void {
  const id = argv[0];
  if (!id) {
    console.error("Error: Estimate ID is required");
    process.exit(1);
  }

  const opts = parseArgs(argv.slice(1));
  const newName = opts.name;

  const original = getEstimate(id);
  if (!original) {
    console.error(`Estimate not found: ${id}`);
    process.exit(1);
  }

  const duplicate = duplicateEstimate(id, newName);
  if (!duplicate) {
    console.error(`Failed to duplicate estimate: ${id}`);
    process.exit(1);
  }

  const currentVersion = duplicate.versions.find((v) => v.is_current);
  const estimateNumber = currentVersion
    ? getEstimateNumber(duplicate.base_number, currentVersion.version_number)
    : duplicate.base_number;

  console.log(`Duplicated estimate: ${estimateNumber}`);
  console.log(`ID: ${duplicate.id}`);
  console.log(`Job: ${duplicate.job_name}`);
}

// Generate PDF
async function pdfCommand(argv: string[]): Promise<void> {
  const id = argv[0];
  if (!id) {
    console.error("Error: Estimate ID is required");
    process.exit(1);
  }

  const opts = parseArgs(argv.slice(1));

  const details = getEstimateWithDetails(id);
  if (!details) {
    console.error(`Estimate not found: ${id}`);
    process.exit(1);
  }

  const currentVersion = details.current_version;

  // Convert to EditorEstimate format for PDF generation
  const estimate: EditorEstimate = {
    estimateNumber: getEstimateNumber(
      details.base_number,
      currentVersion.version_number
    ),
    date: details.created_at,
    estimator: "",
    estimatorEmail: "",
    billTo: {
      companyName: details.client_name || "",
      address: "",
      email: details.client_email || "",
      phone: details.client_phone || "",
    },
    jobInfo: {
      siteName: details.job_name,
      address: details.job_address || "",
    },
    sections: currentVersion.sections.map((s) => ({
      id: s.id,
      name: s.name,
      showSubtotal: s.show_subtotal,
    })),
    lineItems: currentVersion.line_items.map((i) => ({
      id: i.id,
      item: i.description,
      description: i.description,
      qty: i.quantity,
      quantity: i.quantity,
      uom: i.unit,
      unit: i.unit,
      cost: i.unit_cost,
      unitCost: i.unit_cost,
      total: i.quantity * i.unit_cost,
      sectionId: i.section_id || undefined,
    })),
    total: currentVersion.total,
  };

  const pdf = await generatePDF(estimate, { includeBackPage: true });

  let outputPath: string;
  if (opts.output) {
    outputPath = opts.output;
  } else {
    const filename = getPDFFilename(estimate);
    outputPath = join(process.cwd(), filename);
  }

  await Bun.write(outputPath, pdf);
  console.log(`PDF saved: ${outputPath}`);
}

// Main command dispatcher
async function main(): Promise<void> {
  if (!command || command === "--help" || command === "-h") {
    printUsage();
    process.exit(0);
  }

  try {
    switch (command) {
      case "list":
        await listCommand(args.slice(1));
        break;
      case "get":
        await getCommand(args.slice(1));
        break;
      case "create":
        await createCommand(args.slice(1));
        break;
      case "update":
        await updateCommand(args.slice(1));
        break;
      case "delete":
        await deleteCommand(args.slice(1));
        break;
      case "duplicate":
        await duplicateCommand(args.slice(1));
        break;
      case "pdf":
        await pdfCommand(args.slice(1));
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}

main();
