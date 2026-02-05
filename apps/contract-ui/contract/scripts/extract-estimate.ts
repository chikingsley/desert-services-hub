/**
 * Extract Desert Services estimate from PDF text to structured JSON
 *
 * Handles:
 * - Revision numbers (e.g., 12102503-R1)
 * - Taxable items (T suffix on totals)
 * - Rental Tax line
 * - Additional Services section (budgetary, not priced)
 *
 * Usage:
 *   bun apps/contract-ui/contract/scripts/extract-estimate.ts <pdf-text-file>
 *
 * The PDF must first be converted to text. The Read tool in Cursor extracts PDF text directly.
 */

export interface EstimateLineItem {
  item: string;
  description: string;
  qty: number;
  unit: string | null;
  unitCost: number;
  total: number;
  taxable: boolean;
  section: "required" | "phase1" | "phase2" | "additional_services" | "misc";
}

export interface EstimateHeader {
  estimateNumber: string;
  revision: string | null;
  date: string;
  gcName: string;
  gcAddress: string;
  jobName: string;
  jobAddress: string;
  estimator: string;
}

export interface EstimateTax {
  taxableSubtotal: number;
  taxAmount: number;
  taxRate: number;
}

export interface Estimate {
  header: EstimateHeader;
  lineItems: EstimateLineItem[];
  tax: EstimateTax | null;
  subtotal: number;
  total: number;
  extractedAt: string;
  sourceFile: string;
}

// Top-level regex patterns for extraction
const ESTIMATE_NUMBER_REGEX = /Estimate #\s*[\n\r]*(\d+)(-R\d+)?/;
const DATE_REGEX = /Date\s*[\n\r]*(\d{1,2}\/\d{1,2}\/\d{4})/;
const GC_REGEX = /To:\s*[\n\r]*([\s\S]*?)(?=Job Name)/;
const JOB_NAME_REGEX = /Job Name\s*[\n\r]*([^\n\r]+)/;
const ESTIMATOR_REGEX = /Estimator\s*[\n\r]*([^\n\r]+)/;
const JOB_ADDRESS_REGEX =
  /SWPPP ESTIMATE FOR:\s*[\n\r]*[^\n\r]+[\n\r]+([^\n\r]+)[\n\r]+([^\n\r]+)/;
const DATE_CONTEXT_REGEX = /\d{1,2}\/\d{1,2}\/\d{4}\s*$/;
const PRICE_TRIPLET_REGEX = /\d[\d,]*\s+\d[\d,]*\.\d{2}\s+\d[\d,]*\.\d{2}/;
const DESC_ITEM_REGEX =
  /([A-Z][A-Za-z\s]+(?:Protection|Entrance|Sock|Narrative|Sign|Kit|Inspection|Filing|Charge|Certification|Rental|Grate))/;
const RENTAL_TAX_REGEX = /Rental Tax\s+(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})/;

/**
 * Parse estimate text into structured format
 */
export function parseEstimateText(text: string, sourceFile: string): Estimate {
  const header = extractHeader(text);
  const lineItems = extractLineItems(text);
  const tax = extractTax(text, lineItems);
  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const total = extractTotal(text);

  return {
    header,
    lineItems,
    tax,
    subtotal,
    total,
    extractedAt: new Date().toISOString(),
    sourceFile,
  };
}

function extractHeader(text: string): EstimateHeader {
  // Extract estimate number (may include revision like -R1)
  const estimateMatch = text.match(ESTIMATE_NUMBER_REGEX);
  const estimateNumber = estimateMatch ? estimateMatch[1] : "";
  const revision = estimateMatch?.[2] || null;

  // Extract date
  const dateMatch = text.match(DATE_REGEX);
  const date = dateMatch ? dateMatch[1] : "";

  // Extract GC name and address
  const gcMatch = text.match(GC_REGEX);
  let gcName = "";
  let gcAddress = "";
  if (gcMatch) {
    const gcLines = gcMatch[1]
      .trim()
      .split("\n")
      .filter((l) => l.trim());
    gcName = gcLines[0] || "";
    gcAddress = gcLines.slice(1).join(", ");
  }

  // Extract job name
  const jobNameMatch = text.match(JOB_NAME_REGEX);
  const jobName = jobNameMatch ? jobNameMatch[1].trim() : "";

  // Extract estimator
  const estimatorMatch = text.match(ESTIMATOR_REGEX);
  const estimator = estimatorMatch ? estimatorMatch[1].trim() : "";

  // Extract job address
  const addressMatch = text.match(JOB_ADDRESS_REGEX);
  let jobAddress = "";
  if (addressMatch) {
    jobAddress = `${addressMatch[1].trim()}, ${addressMatch[2].trim()}`;
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

// Item categorization rules
const ITEM_RULES: Record<
  string,
  { section: EstimateLineItem["section"]; unit?: string }
> = {
  "swppp narrative": { section: "required", unit: "ea" },
  "compost filter sock": { section: "phase1", unit: "LF" },
  "filter sock": { section: "phase1", unit: "LF" },
  "rock entrance": { section: "phase1", unit: "ea" },
  "drop inlet": { section: "phase1", unit: "ea" },
  "curb inlet": { section: "phase1", unit: "ea" },
  "inlet protection": { section: "phase1", unit: "ea" },
  "concrete rolloff": { section: "phase1", unit: "ea" },
  "swppp sign": { section: "required", unit: "ea" },
  "spill kit": { section: "required", unit: "ea" },
  "fire access": { section: "required", unit: "ea" },
  textura: { section: "required", unit: "ea" },
  procore: { section: "required", unit: "ea" },
  gcpay: { section: "required", unit: "ea" },
  "ccip/ocip": { section: "required", unit: "ea" },
  "insurance portal": { section: "required", unit: "ea" },
  inspection: { section: "required", unit: "ea" },
  "permit filing": { section: "required", unit: "ea" },
  "dust control permit": { section: "required", unit: "ea" },
  "dust permit": { section: "required", unit: "ea" },
  mobilization: { section: "required", unit: "ea" },
  backflow: { section: "required", unit: "ea" },
  "rumble grate": { section: "phase1", unit: "mo" },
};

function categorizeItem(description: string): {
  section: EstimateLineItem["section"];
  unit: string | null;
} {
  const lowerDesc = description.toLowerCase();

  for (const [pattern, config] of Object.entries(ITEM_RULES)) {
    if (lowerDesc.includes(pattern)) {
      return { section: config.section, unit: config.unit || null };
    }
  }

  return { section: "misc", unit: null };
}

function extractLineItems(text: string): EstimateLineItem[] {
  const items: EstimateLineItem[] = [];

  // Check if text is space-separated (PDF extraction) or newline-separated
  const _isSpaceSeparated =
    !text.includes("\n") || text.split("\n").length < 10;

  let inAdditionalServices = false;

  // Pattern: qty unitCost total (with optional T for taxable)
  // This pattern finds price triplets anywhere in the text
  // Examples: "1 1,350.00 1,350.00" or "24 1,100.00 26,400.00T"
  const pricePattern =
    /(\d[\d,]*)\s+(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})(T)?/g;

  // Find all price matches
  for (const match of text.matchAll(pricePattern)) {
    const qty = Number.parseFloat(match[1].replace(/,/g, ""));
    const unitCost = Number.parseFloat(match[2].replace(/,/g, ""));
    const total = Number.parseFloat(match[3].replace(/,/g, ""));
    const taxable = match[4] === "T";

    // Skip if this looks like a date (month/day/year pattern nearby)
    const contextBefore = text.substring(
      Math.max(0, match.index - 50),
      match.index
    );
    if (contextBefore.match(DATE_CONTEXT_REGEX)) {
      continue;
    }

    // Skip if qty * unitCost doesn't roughly equal total (sanity check)
    const expectedTotal = qty * unitCost;
    if (Math.abs(expectedTotal - total) > 1 && qty !== 0) {
      continue;
    }

    // Skip items with 0 qty and 0 total (budgetary placeholders)
    if (qty === 0 && total === 0) {
      continue;
    }

    // Skip rental tax line
    if (contextBefore.toLowerCase().includes("rental tax")) {
      continue;
    }

    // Check if we're in additional services section
    const textBeforeMatch = text.substring(0, match.index);
    if (textBeforeMatch.includes("ADDITIONAL SERVICES")) {
      inAdditionalServices = true;
    }

    // Get context before the match to determine the item type
    // Look for known item patterns in the preceding text
    const lookbackText = text.substring(
      Math.max(0, match.index - 200),
      match.index
    );

    let itemName = "Misc";
    let category = categorizeItem(lookbackText);

    for (const pattern of Object.keys(ITEM_RULES)) {
      // Check if pattern appears in lookback and is the most recent one
      const patternIndex = lookbackText.toLowerCase().lastIndexOf(pattern);
      if (patternIndex !== -1) {
        // Make sure there isn't another price triplet between the pattern and our match
        const textAfterPattern = lookbackText.substring(patternIndex);
        if (!textAfterPattern.match(PRICE_TRIPLET_REGEX)) {
          itemName = pattern
            .split(" ")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
          category = ITEM_RULES[pattern];
          break;
        }
      }
    }

    // Extract a short description from context
    const descMatch = lookbackText.match(DESC_ITEM_REGEX);
    const description = descMatch ? descMatch[1].trim() : itemName;

    items.push({
      item: itemName,
      description,
      qty,
      unit: category?.unit || null,
      unitCost,
      total,
      taxable,
      section: inAdditionalServices
        ? "additional_services"
        : category?.section || "misc",
    });
  }

  return items;
}

function extractTax(
  text: string,
  lineItems: EstimateLineItem[]
): EstimateTax | null {
  // Look for Rental Tax line
  const taxMatch = text.match(RENTAL_TAX_REGEX);

  if (taxMatch) {
    const taxAmount = Number.parseFloat(taxMatch[2].replace(/,/g, ""));
    const taxableSubtotal = lineItems
      .filter((item) => item.taxable)
      .reduce((sum, item) => sum + item.total, 0);

    const taxRate = taxableSubtotal > 0 ? taxAmount / taxableSubtotal : 0;

    return {
      taxableSubtotal,
      taxAmount,
      taxRate: Math.round(taxRate * 10_000) / 10_000, // Round to 4 decimal places
    };
  }

  return null;
}

function extractTotal(text: string): number {
  // Look for the final total (usually last dollar amount before page marker)
  const matches = text.match(/\$(\d[\d,]*\.\d{2})/g);
  if (matches && matches.length > 0) {
    const lastMatch = matches.at(-1);
    return Number.parseFloat(lastMatch.replace(/[$,]/g, ""));
  }
  return 0;
}

// Export for testing
export { extractHeader, extractLineItems, extractTax, extractTotal };
