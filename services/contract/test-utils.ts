/**
 * Contract Service Test Utilities
 *
 * Helpers for testing contract extraction without external API calls.
 * Uses local pdftotext (from poppler) for PDF text extraction.
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { $ } from "bun";

const FIXTURES_DIR = `${dirname(import.meta.path)}/test-fixtures`;

export type FixtureExpectedItem = {
  description: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  total?: number;
  included: boolean;
  notes?: string;
};

export type FixtureExpectedEstimate = {
  projectName: string;
  contractorName: string;
  totalAmount: number;
  hasLineItemPricing: boolean;
  items: FixtureExpectedItem[];
  alternates?: { description: string; price: number }[];
  exclusions?: string[];
};

export type FixtureExpectedContract = {
  docType: string;
  contractor?: Record<string, unknown>;
  subcontractor?: Record<string, unknown>;
  owner?: Record<string, unknown>;
  project?: Record<string, unknown>;
  amounts?: {
    originalAmount: number;
    retainage?: number;
    bonding?: { required: boolean };
  };
  dates?: Record<string, unknown>;
  exhibits?: { letter: string; title: string }[];
  contractNumber?: string;
};

export type FixtureExpectedReconciliation = {
  expectedStatus: "MATCH" | "EXPLAINABLE" | "NEEDS_REVIEW" | "SCOPE_GAP";
  totals: {
    estimate: number;
    contract: number;
    difference: number;
    match: boolean;
  };
  lineItems: {
    removed: { description: string; amount: number }[];
    added: { description: string }[];
    mathWorks: boolean;
  };
  notes?: string;
};

export type FixtureExpected = {
  meta: {
    fixture: string;
    description: string;
    estimateNumber?: string;
    contractNumber?: string;
    verifiedDate: string;
    notes?: string;
  };
  estimate: FixtureExpectedEstimate;
  contract: FixtureExpectedContract;
  reconciliation: FixtureExpectedReconciliation;
};

export type TestFixtureFiles = {
  estimate?: string;
  contract?: string;
  sov?: string;
  ref?: string[];
};

export type TestFixture = {
  name: string;
  dir: string;
  files: TestFixtureFiles;
  expected: FixtureExpected;
};

export async function extractTextWithPdftotext(
  pdfPath: string,
  options: { layout?: boolean; firstPage?: number; lastPage?: number } = {}
): Promise<string> {
  const absPath = resolve(pdfPath);
  if (!existsSync(absPath)) {
    throw new Error(`PDF not found: ${absPath}`);
  }

  const args: string[] = [];
  if (options.layout) {
    args.push("-layout");
  }
  if (options.firstPage) {
    args.push("-f", String(options.firstPage));
  }
  if (options.lastPage) {
    args.push("-l", String(options.lastPage));
  }

  const result = await $`pdftotext ${args} ${absPath} -`.quiet();
  return result.text();
}

async function loadFixtureFiles(dir: string): Promise<TestFixtureFiles> {
  const files: TestFixtureFiles = {};

  if (existsSync(`${dir}/estimate.pdf`)) {
    files.estimate = `${dir}/estimate.pdf`;
  }
  if (existsSync(`${dir}/contract.pdf`)) {
    files.contract = `${dir}/contract.pdf`;
  }
  if (existsSync(`${dir}/sov.xlsx`)) {
    files.sov = `${dir}/sov.xlsx`;
  }
  if (existsSync(`${dir}/ref`)) {
    const refFiles = await $`ls ${dir}/ref`.quiet();
    files.ref = refFiles
      .text()
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((f) => `${dir}/ref/${f}`);
  }

  return files;
}

export async function loadFixture(name: string): Promise<TestFixture> {
  const dir = `${FIXTURES_DIR}/${name}`;
  if (!existsSync(dir)) {
    throw new Error(`Fixture not found: ${name}`);
  }

  const expectedPath = `${dir}/expected.json`;
  if (!existsSync(expectedPath)) {
    throw new Error(`Expected.json not found for fixture: ${name}`);
  }

  const expected = await Bun.file(expectedPath).json();
  const files = await loadFixtureFiles(dir);

  return { name, dir, files, expected };
}

export async function listFixtures(): Promise<string[]> {
  if (!existsSync(FIXTURES_DIR)) {
    return [];
  }
  const result = await $`ls ${FIXTURES_DIR}`.quiet();
  return result
    .text()
    .trim()
    .split("\n")
    .filter((d) => existsSync(`${FIXTURES_DIR}/${d}/expected.json`));
}

export type ComparisonResult = {
  passed: boolean;
  errors: string[];
  warnings: string[];
};

export function compareScopeExtraction(
  actual: {
    projectName: string;
    contractorName: string;
    totalAmount: number;
    hasLineItemPricing: boolean;
    items: { description: string; total?: number; included: boolean }[];
  },
  expected: FixtureExpectedEstimate,
  tolerance = 0.01
): ComparisonResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const totalDiff = Math.abs(actual.totalAmount - expected.totalAmount);
  const toleranceAmount = expected.totalAmount * tolerance;

  if (totalDiff > toleranceAmount) {
    errors.push(
      `Total mismatch: got $${actual.totalAmount}, expected $${expected.totalAmount} (diff: $${totalDiff})`
    );
  }

  if (actual.hasLineItemPricing !== expected.hasLineItemPricing) {
    warnings.push(
      `hasLineItemPricing: got ${actual.hasLineItemPricing}, expected ${expected.hasLineItemPricing}`
    );
  }

  const actualIncluded = actual.items.filter((i) => i.included);
  const expectedIncluded = expected.items.filter((i) => i.included);

  if (actualIncluded.length !== expectedIncluded.length) {
    warnings.push(
      `Included items count: got ${actualIncluded.length}, expected ${expectedIncluded.length}`
    );
  }

  const actualSum = actualIncluded.reduce((s, i) => s + (i.total ?? 0), 0);
  const expectedSum = expectedIncluded.reduce((s, i) => s + (i.total ?? 0), 0);

  if (Math.abs(actualSum - expectedSum) > toleranceAmount) {
    errors.push(
      `Line items sum mismatch: got $${actualSum}, expected $${expectedSum}`
    );
  }

  return { passed: errors.length === 0, errors, warnings };
}

export type ReconciliationComparisonResult = {
  passed: boolean;
  errors: string[];
};

export function compareReconciliation(
  actual: {
    totals: {
      estimate: number;
      contract: number;
      difference: number;
      match: boolean;
    };
    verdict: { status: string };
    lineItems?: { mathWorks: boolean };
  },
  expected: FixtureExpectedReconciliation
): ReconciliationComparisonResult {
  const errors: string[] = [];

  if (actual.verdict.status !== expected.expectedStatus) {
    errors.push(
      `Status mismatch: got ${actual.verdict.status}, expected ${expected.expectedStatus}`
    );
  }

  if (actual.totals.match !== expected.totals.match) {
    errors.push(
      `Match flag: got ${actual.totals.match}, expected ${expected.totals.match}`
    );
  }

  const shouldCheckMathWorks =
    expected.expectedStatus !== "MATCH" && actual.lineItems;
  if (
    shouldCheckMathWorks &&
    actual.lineItems?.mathWorks !== expected.lineItems.mathWorks
  ) {
    errors.push(
      `Math works: got ${actual.lineItems?.mathWorks}, expected ${expected.lineItems.mathWorks}`
    );
  }

  return { passed: errors.length === 0, errors };
}

if (import.meta.main) {
  const [cmd, ...args] = process.argv.slice(2);

  switch (cmd) {
    case "list": {
      const fixtures = await listFixtures();
      console.log("Available fixtures:");
      for (const f of fixtures) {
        console.log(`  - ${f}`);
      }
      break;
    }

    case "extract": {
      const pdfPath = args[0];
      if (!pdfPath) {
        console.log("Usage: bun test-utils.ts extract <pdf-path>");
        process.exit(1);
      }
      const text = await extractTextWithPdftotext(pdfPath);
      console.log(text);
      break;
    }

    case "fixture": {
      const name = args[0];
      if (!name) {
        console.log("Usage: bun test-utils.ts fixture <name>");
        process.exit(1);
      }
      const fixture = await loadFixture(name);
      console.log(`Fixture: ${fixture.name}`);
      console.log(`Dir: ${fixture.dir}`);
      console.log("Files:", fixture.files);
      console.log("Expected total:", fixture.expected.estimate.totalAmount);
      break;
    }

    default:
      console.log(`
Contract Test Utilities

Commands:
  list                List available test fixtures
  extract <pdf>       Extract text from PDF using pdftotext
  fixture <name>      Show fixture info

Example:
  bun services/contract/test-utils.ts list
  bun services/contract/test-utils.ts extract ./contract.pdf
  bun services/contract/test-utils.ts fixture greenway-embrey
`);
  }
}
