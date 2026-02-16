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
 *   bun packages/contracts/scripts/extract-estimate.ts <pdf-text-file>
 *
 * The PDF must first be converted to text. The Read tool in Cursor extracts PDF text directly.
 */

export interface EstimateLineItem {
  item: string;
  description: string;
  qty: number;
  unit: string | null;
  unitPrice: number;
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

const ESTIMATE_NUMBER_REGEX = /Estimate #\s*[\n\r]*(\d+)(-R\d+)?/;
const DATE_REGEX = /Date\s*[\n\r]*(\d{1,2}\/\d{1,2}\/\d{4})/;
const GC_REGEX = /To:\s*[\n\r]*([\s\S]*?)(?=Job Name)/;
const JOB_NAME_REGEX = /Job Name\s*[\n\r]*([^\n\r]+)/;
const ESTIMATOR_REGEX = /Estimator\s*[\n\r]*([^\n\r]+)/;
const JOB_ADDRESS_REGEX =
  /SWPPP ESTIMATE FOR:\s*[\n\r]*[^\n\r]+[\n\r]+([^\n\r]+)[\n\r]+([^\n\r]+)/;
const DATE_CONTEXT_REGEX = /\d{1,2}\/\d{1,2}\/\d{4}\s*$/;
const PRICE_PATTERN = /(\d[\d,]*)\s+(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})(T)?/g;
const PRICE_TRIPLET_REGEX = /\d[\d,]*\s+\d[\d,]*\.\d{2}\s+\d[\d,]*\.\d{2}/;
const DESC_ITEM_REGEX =
  /([A-Z][A-Za-z\s]+(?:Protection|Entrance|Sock|Narrative|Sign|Kit|Inspection|Filing|Charge|Certification|Rental|Grate))/;
const RENTAL_TAX_REGEX = /Rental Tax\s+(\d[\d,]*\.\d{2})\s+(\d[\d,]*\.\d{2})/;

interface ItemCategory {
  section: EstimateLineItem["section"];
  unit: string | null;
}

interface ParsedPriceTriplet {
  qty: number;
  unitPrice: number;
  total: number;
  taxable: boolean;
  matchIndex: number;
}

interface ResolvedItemDetails {
  itemName: string;
  description: string;
  category: ItemCategory;
}

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
    extractedAt: new Date().toISOString(),
    header,
    lineItems,
    sourceFile,
    subtotal,
    tax,
    total,
  };
}

function extractHeader(text: string): EstimateHeader {
  const estimateMatch = text.match(ESTIMATE_NUMBER_REGEX);
  const estimateNumber = estimateMatch?.[1] ?? "";
  const revision = estimateMatch?.[2] ?? null;

  const dateMatch = text.match(DATE_REGEX);
  const date = dateMatch?.[1] ?? "";

  const gcMatch = text.match(GC_REGEX);
  let gcName = "";
  let gcAddress = "";
  if (gcMatch?.[1]) {
    const gcLines = gcMatch[1]
      .trim()
      .split("\n")
      .filter((line) => line.trim());
    gcName = gcLines[0] ?? "";
    gcAddress = gcLines.slice(1).join(", ");
  }

  const jobNameMatch = text.match(JOB_NAME_REGEX);
  const jobName = jobNameMatch?.[1]?.trim() ?? "";

  const estimatorMatch = text.match(ESTIMATOR_REGEX);
  const estimator = estimatorMatch?.[1]?.trim() ?? "";

  const addressMatch = text.match(JOB_ADDRESS_REGEX);
  let jobAddress = "";
  if (addressMatch?.[1] && addressMatch[2]) {
    jobAddress = `${addressMatch[1].trim()}, ${addressMatch[2].trim()}`;
  }

  return {
    date,
    estimateNumber,
    estimator,
    gcAddress,
    gcName,
    jobAddress,
    jobName,
    revision,
  };
}

const ITEM_RULES: Record<
  string,
  { section: EstimateLineItem["section"]; unit?: string }
> = {
  backflow: { section: "required", unit: "ea" },
  "ccip/ocip": { section: "required", unit: "ea" },
  "compost filter sock": { section: "phase1", unit: "LF" },
  "concrete rolloff": { section: "phase1", unit: "ea" },
  "curb inlet": { section: "phase1", unit: "ea" },
  "drop inlet": { section: "phase1", unit: "ea" },
  "dust control permit": { section: "required", unit: "ea" },
  "dust permit": { section: "required", unit: "ea" },
  "filter sock": { section: "phase1", unit: "LF" },
  "fire access": { section: "required", unit: "ea" },
  gcpay: { section: "required", unit: "ea" },
  "inlet protection": { section: "phase1", unit: "ea" },
  inspection: { section: "required", unit: "ea" },
  "insurance portal": { section: "required", unit: "ea" },
  mobilization: { section: "required", unit: "ea" },
  "permit filing": { section: "required", unit: "ea" },
  procore: { section: "required", unit: "ea" },
  "rock entrance": { section: "phase1", unit: "ea" },
  "rumble grate": { section: "phase1", unit: "mo" },
  "spill kit": { section: "required", unit: "ea" },
  "swppp narrative": { section: "required", unit: "ea" },
  "swppp sign": { section: "required", unit: "ea" },
  textura: { section: "required", unit: "ea" },
};

function categorizeItem(description: string): ItemCategory {
  const lowerDesc = description.toLowerCase();

  for (const [pattern, config] of Object.entries(ITEM_RULES)) {
    if (lowerDesc.includes(pattern)) {
      return { section: config.section, unit: config.unit || null };
    }
  }

  return { section: "misc", unit: null };
}

function parseNumber(raw: string): number {
  return Number.parseFloat(raw.replaceAll(/,/g, ""));
}

function parsePriceTripletMatch(
  match: RegExpMatchArray
): ParsedPriceTriplet | null {
  const qtyStr = match[1];
  const unitPriceStr = match[2];
  const totalStr = match[3];
  if (!(qtyStr && unitPriceStr && totalStr)) {
    return null;
  }

  return {
    qty: parseNumber(qtyStr),
    unitPrice: parseNumber(unitPriceStr),
    total: parseNumber(totalStr),
    taxable: match[4] === "T",
    matchIndex: match.index ?? 0,
  };
}

function getContextBefore(
  text: string,
  matchIndex: number,
  length: number
): string {
  return text.slice(Math.max(0, matchIndex - length), matchIndex);
}

function shouldSkipPriceTriplet(
  triplet: ParsedPriceTriplet,
  contextBefore: string
): boolean {
  if (DATE_CONTEXT_REGEX.test(contextBefore)) {
    return true;
  }

  const expectedTotal = triplet.qty * triplet.unitPrice;
  if (Math.abs(expectedTotal - triplet.total) > 1 && triplet.qty !== 0) {
    return true;
  }

  if (triplet.qty === 0 && triplet.total === 0) {
    return true;
  }

  return contextBefore.toLowerCase().includes("rental tax");
}

function sectionIsAdditionalServices(
  text: string,
  matchIndex: number
): boolean {
  return text.slice(0, matchIndex).includes("ADDITIONAL SERVICES");
}

function toItemName(pattern: string): string {
  return pattern
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function resolveItemDetailsFromContext(
  lookbackText: string
): ResolvedItemDetails {
  let itemName = "Misc";
  let category = categorizeItem(lookbackText);

  const lowerLookback = lookbackText.toLowerCase();
  for (const pattern of Object.keys(ITEM_RULES)) {
    const patternIndex = lowerLookback.lastIndexOf(pattern);
    if (patternIndex === -1) {
      continue;
    }

    const textAfterPattern = lookbackText.slice(patternIndex);
    if (PRICE_TRIPLET_REGEX.test(textAfterPattern)) {
      continue;
    }

    itemName = toItemName(pattern);
    const rule = ITEM_RULES[pattern];
    if (rule) {
      category = { section: rule.section, unit: rule.unit ?? null };
    }
    break;
  }

  const descMatch = lookbackText.match(DESC_ITEM_REGEX);
  const description = descMatch?.[1]?.trim() ?? itemName;

  return { category, description, itemName };
}

function extractLineItems(text: string): EstimateLineItem[] {
  const items: EstimateLineItem[] = [];
  let inAdditionalServices = false;

  for (const match of text.matchAll(PRICE_PATTERN)) {
    const triplet = parsePriceTripletMatch(match);
    if (!triplet) {
      continue;
    }

    const contextBefore = getContextBefore(text, triplet.matchIndex, 50);
    if (shouldSkipPriceTriplet(triplet, contextBefore)) {
      continue;
    }

    inAdditionalServices ||= sectionIsAdditionalServices(
      text,
      triplet.matchIndex
    );

    const lookbackText = getContextBefore(text, triplet.matchIndex, 200);
    const item = resolveItemDetailsFromContext(lookbackText);

    items.push({
      description: item.description,
      item: item.itemName,
      qty: triplet.qty,
      section: inAdditionalServices
        ? "additional_services"
        : item.category.section,
      taxable: triplet.taxable,
      total: triplet.total,
      unit: item.category.unit,
      unitPrice: triplet.unitPrice,
    });
  }

  return items;
}

function extractTax(
  text: string,
  lineItems: EstimateLineItem[]
): EstimateTax | null {
  const taxMatch = text.match(RENTAL_TAX_REGEX);

  const taxAmountStr = taxMatch?.[2];
  if (taxAmountStr) {
    const taxAmount = Number.parseFloat(taxAmountStr.replaceAll(/,/g, ""));
    const taxableSubtotal = lineItems
      .filter((item) => item.taxable)
      .reduce((sum, item) => sum + item.total, 0);

    const taxRate = taxableSubtotal > 0 ? taxAmount / taxableSubtotal : 0;

    return {
      taxAmount,
      taxRate: Math.round(taxRate * 10_000) / 10_000,
      taxableSubtotal,
    };
  }

  return null;
}

function extractTotal(text: string): number {
  const matches = text.match(/\$(\d[\d,]*\.\d{2})/g);
  const lastMatch = matches?.at(-1);
  if (lastMatch) {
    return Number.parseFloat(lastMatch.replaceAll(/[$,]/g, ""));
  }
  return 0;
}

export { extractHeader, extractLineItems, extractTax, extractTotal };
