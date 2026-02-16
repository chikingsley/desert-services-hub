/**
 * Test estimate extraction against multiple PDFs
 *
 * Usage:
 *   bun packages/contracts/scripts/test-estimate-extraction.ts
 */

import type { Estimate } from "./extract-estimate";

// Sample estimate texts (would come from PDF reads in production)
const _TEST_CASES: {
  name: string;
  expectedNumber: string;
  expectedTotal: number;
}[] = [
  {
    expectedNumber: "11042501",
    expectedTotal: 19_140,
    name: "Edison Park (11042501)",
  },
  {
    expectedNumber: "12102503",
    expectedTotal: 86_260,
    name: "Modera PV R0 (12102503)",
  },
  {
    expectedNumber: "12102503",
    expectedTotal: 79_215.02,
    name: "Modera PV R1 (12102503-R1)",
  },
];

function _validateEstimate(
  estimate: Estimate,
  expected: { expectedNumber: string; expectedTotal: number }
) {
  const issues: string[] = [];

  // Check estimate number
  if (estimate.header.estimateNumber !== expected.expectedNumber) {
    issues.push(
      `Estimate number: got ${estimate.header.estimateNumber}, expected ${expected.expectedNumber}`
    );
  }

  // Check total (within $1 tolerance for rounding)
  if (Math.abs(estimate.total - expected.expectedTotal) > 1) {
    issues.push(
      `Total: got $${estimate.total.toFixed(2)}, expected $${expected.expectedTotal.toFixed(2)}`
    );
  }

  // Check required fields
  if (!estimate.header.date) {
    issues.push("Missing date");
  }
  if (!estimate.header.gcName) {
    issues.push("Missing GC name");
  }
  if (!estimate.header.jobName) {
    issues.push("Missing job name");
  }
  if (!estimate.header.estimator) {
    issues.push("Missing estimator");
  }

  // Check line items
  if (estimate.lineItems.length === 0) {
    issues.push("No line items extracted");
  }

  // Check math
  const lineItemTotal = estimate.lineItems.reduce(
    (sum, item) => sum + item.total,
    0
  );
  const expectedSubtotal = estimate.tax
    ? estimate.total - estimate.tax.taxAmount
    : estimate.total;

  if (Math.abs(lineItemTotal - expectedSubtotal) > 1) {
    issues.push(
      `Line item sum: $${lineItemTotal.toFixed(2)}, expected ~$${expectedSubtotal.toFixed(2)}`
    );
  }

  return issues;
}

function printEstimateSummary(estimate: Estimate) {
  console.log(
    `\n  Estimate #: ${estimate.header.estimateNumber}${estimate.header.revision || ""}`
  );
  console.log(`  Date: ${estimate.header.date}`);
  console.log(`  GC: ${estimate.header.gcName}`);
  console.log(`  Job: ${estimate.header.jobName}`);
  console.log(`  Estimator: ${estimate.header.estimator}`);
  console.log(`  Line Items: ${estimate.lineItems.length}`);
  console.log(`  Subtotal: $${estimate.subtotal.toFixed(2)}`);
  if (estimate.tax) {
    console.log(
      `  Tax (${(estimate.tax.taxRate * 100).toFixed(2)}%): $${estimate.tax.taxAmount.toFixed(2)}`
    );
  }
  console.log(`  Total: $${estimate.total.toFixed(2)}`);

  // Show taxable items
  const taxableItems = estimate.lineItems.filter((i) => i.taxable);
  if (taxableItems.length > 0) {
    console.log("  Taxable items:");
    for (const item of taxableItems) {
      console.log(`    - ${item.item}: $${item.total.toFixed(2)}`);
    }
  }
}

console.log("=== Estimate Extraction Test Suite ===\n");
console.log("Note: This script shows the expected extraction structure.");
console.log("Run against actual PDF text to validate extraction logic.\n");

// Show sample output structure
const sampleEstimate: Estimate = {
  extractedAt: new Date().toISOString(),
  header: {
    estimateNumber: "12102503",
    revision: "-R1",
    date: "12/10/2025",
    gcName: "Mill Creek Residential",
    gcAddress: "15210 N. Scottsdale, Suite 210, Scottsdale, AZ 85254",
    jobName: "MODERA PARADISE VALLEY",
    jobAddress: "4580 E CACTUS ROAD, PHOENIX, AZ 85032",
    estimator: "Jared Aiken",
  },
  lineItems: [
    {
      item: "SWPPP Narrative",
      description: "SWPPP Narrative Design Manual",
      qty: 1,
      unit: "ea",
      unitPrice: 1350,
      total: 1350,
      taxable: false,
      section: "required",
    },
    {
      item: "Compost Filter Sock",
      description: 'Installation of 9" Compost Filter Sock (LF)',
      qty: 1780,
      unit: "LF",
      unitPrice: 2.75,
      total: 4895,
      taxable: false,
      section: "phase1",
    },
    {
      item: "Rock Entrance",
      description: "Rock Entrance with Filterfabric",
      qty: 3,
      unit: "ea",
      unitPrice: 2475,
      total: 7425,
      taxable: false,
      section: "phase1",
    },
    {
      item: "Rumble Grates",
      description: "Monthly rental (BOGO 4 entrances)",
      qty: 24,
      unit: "mo",
      unitPrice: 1100,
      total: 26_400,
      taxable: true,
      section: "phase1",
    },
    {
      item: "Curb Inlet Protection",
      description: "Curb Inlet Protection",
      qty: 2,
      unit: "ea",
      unitPrice: 375,
      total: 750,
      taxable: false,
      section: "phase1",
    },
    {
      item: "SWPPP Sign",
      description: "SWPPP Sign per ADEQ",
      qty: 2,
      unit: "ea",
      unitPrice: 275,
      total: 550,
      taxable: false,
      section: "required",
    },
    {
      item: "Spill Kit",
      description: "Spill Kit per ADEQ",
      qty: 2,
      unit: "ea",
      unitPrice: 345,
      total: 690,
      taxable: false,
      section: "required",
    },
    {
      item: "Fire Access Signs",
      description: "City Approved Fire Access Signs",
      qty: 2,
      unit: "ea",
      unitPrice: 675,
      total: 1350,
      taxable: false,
      section: "required",
    },
    {
      item: "Textura",
      description: "Textura/Procore/GCPay fees",
      qty: 1,
      unit: "ea",
      unitPrice: 100,
      total: 100,
      taxable: false,
      section: "required",
    },
    {
      item: "CCIP/OCIP",
      description: "Insurance portal fees",
      qty: 1,
      unit: "ea",
      unitPrice: 250,
      total: 250,
      taxable: false,
      section: "required",
    },
    {
      item: "Inspections",
      description: "SWPPP Inspections (27 mo, biweekly)",
      qty: 60,
      unit: "ea",
      unitPrice: 195,
      total: 11_700,
      taxable: false,
      section: "required",
    },
    {
      item: "Dust Permit",
      description: "Dust Control Permit (Expedited)",
      qty: 1,
      unit: "ea",
      unitPrice: 2760,
      total: 2760,
      taxable: false,
      section: "required",
    },
    {
      item: "Dust Permit Renewal",
      description: "Dust Permit Renewal",
      qty: 2,
      unit: "ea",
      unitPrice: 1630,
      total: 3260,
      taxable: false,
      section: "required",
    },
    {
      item: "Mobilization",
      description: "Mobilization Charges",
      qty: 1,
      unit: "ea",
      unitPrice: 255,
      total: 255,
      taxable: false,
      section: "required",
    },
    {
      item: "Backflow Certification",
      description: "Certification per City",
      qty: 2,
      unit: "ea",
      unitPrice: 295,
      total: 590,
      taxable: true,
      section: "required",
    },
    {
      item: "Backflow Rental",
      description: "Monthly Rental",
      qty: 27,
      unit: "mo",
      unitPrice: 490,
      total: 13_230,
      taxable: true,
      section: "required",
    },
  ],
  sourceFile: "12102503-R1.pdf",
  subtotal: 75_555,
  tax: {
    taxableSubtotal: 40_220, // 26400 + 590 + 13230
    taxAmount: 3660.02,
    taxRate: 0.091,
  },
  total: 79_215.02,
};

console.log("Sample Extraction Output:");
printEstimateSummary(sampleEstimate);

console.log("\n\n--- Line Items ---\n");
console.log("Item | Qty | Unit | Unit Cost | Total | Taxable | Section");
console.log("-".repeat(80));
for (const item of sampleEstimate.lineItems) {
  console.log(
    `${item.item.padEnd(25)} | ${String(item.qty).padStart(5)} | ${(item.unit || "").padEnd(4)} | $${item.unitPrice.toFixed(2).padStart(8)} | $${item.total.toFixed(2).padStart(10)} | ${item.taxable ? "T" : " "} | ${item.section}`
  );
}

console.log("\n\nTo use in production:");
console.log("1. Read PDF with Read tool (extracts text)");
console.log("2. Call parseEstimateText(pdfText, filename)");
console.log("3. Get structured JSON back");
