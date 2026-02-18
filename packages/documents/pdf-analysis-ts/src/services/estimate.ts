import type { ExtractionResult, Table } from "@kreuzberg/node";

import {
  decodeCidGlyphs,
  normalizeCell,
  parseMoney,
  parseQty,
} from "@pdf-analysis/common";
import { extractPdfTables } from "@pdf-analysis/services/kreuzberg";
import type {
  Estimate,
  EstimateHeader,
  EstimateLineItem,
  EstimateSection,
} from "@pdf-analysis/types";

const EMBEDDED_MONEY_RE = /([\d,]+\.\d{2})/;

function parseMoneyRelaxed(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const normalized = decodeCidGlyphs(value);
  const match = normalized.match(EMBEDDED_MONEY_RE);
  if (!match?.[1]) {
    return null;
  }
  return Number.parseFloat(match[1].replaceAll(",", ""));
}

function isTaxable(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = decodeCidGlyphs(value).trim();
  return normalized.endsWith("T") && parseMoney(normalized) !== null;
}

function findMainTable(tables: Table[]): string[][] | null {
  for (const table of tables) {
    for (const row of table.cells) {
      const cells = row.map((cell) => normalizeCell(cell));
      if (
        cells.includes("Item") &&
        cells.includes("Description") &&
        cells.includes("Total")
      ) {
        return table.cells;
      }
    }
  }
  return null;
}

function detectColumns(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const [idx, raw] of headerRow.entries()) {
    const cell = normalizeCell(raw);
    if (["Item", "Description", "Qty", "U/M", "Cost", "Total"].includes(cell)) {
      map[cell] = idx;
    }
  }
  return map;
}

function splitRevision(value: string): {
  estimateNumber: string;
  revision: string | null;
} {
  if (!value.includes("-R")) {
    return { estimateNumber: value, revision: null };
  }
  const [base, rev] = value.split("-R", 2);
  return { estimateNumber: base, revision: rev ? `R${rev}` : null };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: table layouts are variant-heavy and order-dependent
function extractHeader(firstPageTables: Table[]): EstimateHeader {
  let estimateNumber = "";
  let revision: string | null = null;
  let date = "";
  let gcName = "";
  let gcAddress = "";
  let jobName = "";
  let jobAddress = "";
  let estimator = "";

  for (const table of firstPageTables) {
    const rows = table.cells;
    if (rows.length < 2) {
      continue;
    }

    const headerRow = rows[0]?.map((c) => normalizeCell(c)) ?? [];
    const firstData = rows[1] ?? [];

    const dateIdx = headerRow.indexOf("Date");
    if (dateIdx >= 0 && !date) {
      date = normalizeCell(firstData[dateIdx]);
    }

    const estimateIdx = headerRow.findIndex((v) =>
      ["Estimate #", "Estimate#", "Estimate Number"].includes(v)
    );
    if (estimateIdx >= 0 && !estimateNumber) {
      const parsed = splitRevision(normalizeCell(firstData[estimateIdx]));
      estimateNumber = parsed.estimateNumber;
      revision = parsed.revision;
    }

    const estimatorIdx = headerRow.findIndex((v) =>
      ["Estimator", "Sales Rep", "Sales Representative"].includes(v)
    );
    if (estimatorIdx >= 0 && !estimator) {
      for (const candidateRow of rows.slice(1, 4)) {
        const candidate = normalizeCell(candidateRow[estimatorIdx]);
        if (
          candidate &&
          !["Estimator", "Sales Rep", "Sales Representative"].includes(
            candidate
          )
        ) {
          estimator = candidate;
          break;
        }
      }
    }

    if (normalizeCell(rows[0]?.[0]) === "To:" && rows[1]?.[0]) {
      const lines = normalizeCell(rows[1][0])
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines[0]) {
        gcName = lines[0];
      }
      gcAddress = lines.slice(1).join(", ");
    }

    const jobIdx = headerRow.indexOf("Job Name");
    if (jobIdx >= 0 && rows[1]?.[jobIdx]) {
      jobName = normalizeCell(rows[1][jobIdx]);
      for (const row of rows) {
        const descriptionCell = normalizeCell(row[1]);
        if (!descriptionCell.toUpperCase().includes("ESTIMATE FOR:")) {
          continue;
        }
        const lines = descriptionCell
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        if (lines.length >= 3) {
          jobAddress = lines.slice(2).join(", ");
        }
      }
    }
  }

  return {
    estimateNumber,
    revision,
    date,
    gcName,
    gcAddress,
    jobName,
    jobAddress,
    estimator,
  };
}

function extractGrandTotal(result: ExtractionResult): number {
  for (const table of [...(result.tables ?? [])].reverse()) {
    for (const row of table.cells) {
      for (const cell of row) {
        const normalized = normalizeCell(cell);
        if (!(normalized.startsWith("Total") || normalized.startsWith("$"))) {
          continue;
        }
        const match = normalized.match(EMBEDDED_MONEY_RE);
        if (match?.[1]) {
          return Number.parseFloat(match[1].replaceAll(",", ""));
        }
      }
    }
  }
  return 0;
}

function deriveQtyFromTotal(
  total: number | null,
  unitPrice: number | null
): number | null {
  if (total === null || unitPrice === null || unitPrice === 0) {
    return null;
  }
  const raw = total / unitPrice;
  const roundedWhole = Math.round(raw);
  if (Math.abs(raw - roundedWhole) < 0.000_001) {
    return roundedWhole;
  }
  return Number.parseFloat(raw.toFixed(4));
}

function detectSection(value: string): EstimateSection | null {
  const upper = value.toUpperCase();
  if (upper.includes("PHASE 1")) {
    return "phase1";
  }
  if (upper.includes("PHASE 2")) {
    return "phase2";
  }
  if (upper.includes("ADDITIONAL SERVICES")) {
    return "additional_services";
  }
  return null;
}

interface PageTableGroup {
  pageNumber: number;
  tables: Table[];
}

function groupTablesByPage(result: ExtractionResult): PageTableGroup[] {
  const map = new Map<number, Table[]>();
  for (const table of result.tables ?? []) {
    const pn = table.pageNumber || 1;
    const current = map.get(pn) ?? [];
    current.push(table);
    map.set(pn, current);
  }

  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([pageNumber, tables]) => ({ pageNumber, tables }));
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: parser must preserve ordered row heuristics across template variants
export async function extractEstimate(pdfPath: string): Promise<Estimate> {
  const extraction = await extractPdfTables(pdfPath);
  const byPage = groupTablesByPage(extraction);
  const pageCount = Number(
    (extraction.metadata as { page_count?: number })?.page_count ||
      byPage.length
  );

  const header = extractHeader(
    byPage.find((g) => g.pageNumber === 1)?.tables ?? []
  );

  const allRows: string[][] = [];
  let colMap: Record<string, number> = {};

  for (const page of byPage) {
    const table = findMainTable(page.tables);
    if (!table) {
      continue;
    }

    for (const row of table) {
      const normalized = row.map((c) => normalizeCell(c));
      if (
        normalized.includes("Item") &&
        normalized.includes("Description") &&
        normalized.includes("Total")
      ) {
        if (Object.keys(colMap).length === 0) {
          colMap = detectColumns(row);
        }
        continue;
      }

      if (normalized.includes("Job Name")) {
        continue;
      }

      if (Object.keys(colMap).length === 0) {
        continue;
      }

      if (
        normalized.join(" ").includes("Pricing based on specified quantities")
      ) {
        continue;
      }

      allRows.push(row);
    }
  }

  const itemIdx = colMap.Item ?? 0;
  const descIdx = colMap.Description ?? 1;
  const qtyIdx = colMap.Qty ?? 3;
  const costIdx = colMap.Cost ?? Math.max((colMap.Total ?? 1) - 1, 0);
  const totalIdx = colMap.Total ?? Math.max(costIdx + 1, 1);

  const lineItems: EstimateLineItem[] = [];
  const warnings: string[] = [];
  let section: EstimateSection = "required";

  for (const row of allRows) {
    const itemCell = normalizeCell(row[itemIdx]);
    const descCell = normalizeCell(row[descIdx]);
    const qtyCell = normalizeCell(row[qtyIdx]);
    const costCell = normalizeCell(row[costIdx]);
    const totalCell = normalizeCell(row[totalIdx]);

    const rowText = `${itemCell} ${descCell}`.trim();
    if (!(rowText || qtyCell || totalCell)) {
      continue;
    }

    const detected = detectSection(rowText);
    if (detected) {
      if (detected === "additional_services") {
        section = "misc";
      } else {
        section = detected;
      }
      continue;
    }

    if (
      rowText.toUpperCase().includes("RENTAL TAX") ||
      rowText.toUpperCase().includes("ESTIMATE FOR:")
    ) {
      continue;
    }

    let qty = parseQty(qtyCell);
    let unitPrice = parseMoney(costCell);
    let total = parseMoney(totalCell);

    if (qty === null) {
      qty = deriveQtyFromTotal(total, unitPrice);
    }
    if (unitPrice === null && qty !== null && qty !== 0 && total !== null) {
      unitPrice = Number.parseFloat((total / qty).toFixed(2));
    }

    if (total === null) {
      total = parseMoneyRelaxed(totalCell);
    }
    if (unitPrice === null) {
      unitPrice = parseMoneyRelaxed(costCell);
    }

    if (total === null || qty === null || unitPrice === null) {
      continue;
    }

    lineItems.push({
      item: itemCell || "Misc",
      description: descCell.split("\n")[0] || "",
      qty,
      unit: null,
      unitPrice,
      total,
      taxable: isTaxable(totalCell),
      section,
    });
  }

  const grandTotal = extractGrandTotal(extraction);
  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  if (grandTotal > 0 && Math.abs(grandTotal - subtotal) > 0.01) {
    warnings.push(
      `Grand total mismatch: grand_total=${grandTotal.toFixed(2)}, subtotal=${subtotal.toFixed(2)}`
    );
  }

  return {
    header,
    lineItems,
    grandTotal,
    pageCount,
    sourceFile: pdfPath,
    parseWarnings: warnings,
  };
}
