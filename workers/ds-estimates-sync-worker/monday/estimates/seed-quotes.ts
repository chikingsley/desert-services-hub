import { join } from "node:path";
import { db } from "../../../lib/db";

/**
 * Seeds the hub database with historical quotes from extraction_summary.json.
 * Run this after extract.ts has processed all estimate PDFs.
 */

interface LineItemExtraction {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

interface Extraction {
  fileName: string;
  estimateNumber: string | null;
  date: string | null;
  jobName: string | null;
  totalAmount: string | null;
  contractorName: string | null;
  lineItems: LineItemExtraction[];
  isClean: boolean;
}

function parseTotal(totalStr: string | null): number {
  if (!totalStr) return 0;
  return Number.parseFloat(totalStr.replace(/,/g, "")) || 0;
}

function normalizeUnit(unit: string): string {
  const normalized = unit.toUpperCase().trim();
  const unitMap: Record<string, string> = {
    EACH: "EA",
    "LINEAR FEET": "LF",
    "LIN FT": "LF",
    "SQUARE FEET": "SF",
    "SQ FT": "SF",
    "CUBIC YARDS": "CY",
    "CU YD": "CY",
    HOUR: "HR",
    HOURS: "HR",
    "LUMP SUM": "LS",
  };
  return unitMap[normalized] ?? normalized;
}

async function seedQuotesFromExtractions() {
  const estimatesDir = join(import.meta.dir, "..", "estimates");
  const summaryPath = join(estimatesDir, "extraction_summary.json");

  const file = Bun.file(summaryPath);
  if (!(await file.exists())) {
    console.error(
      `❌ extraction_summary.json not found at ${summaryPath}\nRun extract.ts first.`
    );
    process.exit(1);
  }

  const extractions = (await file.json()) as Extraction[];
  console.log(`📥 Loaded ${extractions.length} extractions from summary.`);

  // Filter to only clean extractions with line items
  const validExtractions = extractions.filter(
    (e) => e.isClean && e.lineItems.length > 0 && e.estimateNumber
  );
  console.log(
    `✅ ${validExtractions.length} valid extractions with line items.`
  );

  // Get existing base numbers to avoid duplicates
  const existingQuotes = db.prepare("SELECT base_number FROM quotes").all() as {
    base_number: string;
  }[];
  const existingBaseNumbers = new Set(existingQuotes.map((q) => q.base_number));
  console.log(`📊 Found ${existingBaseNumbers.size} existing quotes in DB.`);

  let inserted = 0;
  let skipped = 0;

  for (const est of validExtractions) {
    const baseNumber = est.estimateNumber ?? "";

    // Skip if already exists
    if (existingBaseNumbers.has(baseNumber)) {
      skipped++;
      continue;
    }

    const quoteId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const total = parseTotal(est.totalAmount);

    // Insert quote
    db.prepare(
      `INSERT INTO quotes (id, base_number, job_name, client_name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'historical', datetime('now'), datetime('now'))`
    ).run(
      quoteId,
      baseNumber,
      est.jobName ?? "Unknown Job",
      est.contractorName
    );

    // Insert version
    db.prepare(
      `INSERT INTO quote_versions (id, quote_id, version_number, total, is_current, created_at)
       VALUES (?, ?, 1, ?, 1, datetime('now'))`
    ).run(versionId, quoteId, total);

    // Insert line items
    for (const [i, item] of est.lineItems.entries()) {
      const lineItemId = crypto.randomUUID();
      const unit = normalizeUnit(item.unit);
      const unitPrice = item.unitPrice || 0;
      const unitCost = unitPrice * 0.7; // Assume 30% margin

      db.prepare(
        `INSERT INTO quote_line_items (id, version_id, description, quantity, unit, unit_cost, unit_price, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      ).run(
        lineItemId,
        versionId,
        item.description,
        item.quantity,
        unit,
        unitCost,
        unitPrice,
        i
      );
    }

    inserted++;
    existingBaseNumbers.add(baseNumber);

    if (inserted % 50 === 0) {
      console.log(`  📝 Inserted ${inserted} quotes...`);
    }
  }

  console.log("\n--- Seeding Complete ---");
  console.log(`Inserted: ${inserted} quotes`);
  console.log(`Skipped (duplicates): ${skipped}`);

  // Print verification stats
  const quoteCount = (
    db.prepare("SELECT COUNT(*) as count FROM quotes").get() as {
      count: number;
    }
  ).count;
  const lineItemCount = (
    db.prepare("SELECT COUNT(*) as count FROM quote_line_items").get() as {
      count: number;
    }
  ).count;
  const historicalCount = (
    db
      .prepare(
        "SELECT COUNT(*) as count FROM quotes WHERE status = 'historical'"
      )
      .get() as { count: number }
  ).count;

  console.log("\n--- Database Stats ---");
  console.log(`Total quotes: ${quoteCount}`);
  console.log(`Historical quotes: ${historicalCount}`);
  console.log(`Total line items: ${lineItemCount}`);
}

seedQuotesFromExtractions().catch(console.error);
