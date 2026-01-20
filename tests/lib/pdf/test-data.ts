// Shared test data for PDF generation tests
// Uses max catalog items to test multipage layouts

import type { EditorQuote, EditorSection } from "@/lib/types";
import { createLineItems } from "@/services/quoting/catalog";

// Create line items using actual catalog codes (max coverage)
const catalogLineItems = createLineItems([
  // SWPPP Plans
  { code: "SWPPP-001", qty: 1 },
  { code: "SWPPP-002", qty: 1 },
  { code: "SWPPP-003", qty: 1 },
  { code: "SWPPP-004", qty: 1 },
  { code: "SWPPP-005", qty: 1 },
  { code: "SWPPP-006", qty: 1 },
  // Compliance Management
  { code: "CM-001", qty: 1 },
  { code: "CM-001B", qty: 1 },
  { code: "CM-002", qty: 1 },
  { code: "CM-003", qty: 5024 },
  { code: "CM-004", qty: 8000 },
  { code: "CM-005", qty: 1 },
  { code: "CM-006", qty: 1 },
  { code: "CM-012", qty: 1 },
  { code: "CM-013", qty: 2 },
  { code: "CM-014", qty: 3 },
  { code: "CM-015", qty: 1 },
  // Dust Control
  { code: "DUST-001", qty: 1 },
  { code: "DUST-002", qty: 1 },
  { code: "DUST-003", qty: 1 },
  { code: "DUST-004", qty: 1 },
  { code: "DUST-005", qty: 1 },
  { code: "DUST-006", qty: 1 },
  { code: "DUST-007", qty: 1 },
  { code: "DUST-008", qty: 1 },
  // Pima County Dust
  { code: "PIMA-DUST-001", qty: 1 },
  { code: "PIMA-DUST-002", qty: 1 },
  { code: "PIMA-DUST-003", qty: 1 },
  { code: "PIMA-DUST-004", qty: 1 },
  { code: "PIMA-TRENCH-001", qty: 1 },
  { code: "PIMA-TRENCH-002", qty: 1 },
  { code: "PIMA-TRENCH-003", qty: 1 },
  { code: "PIMA-TRENCH-004", qty: 1 },
  { code: "PIMA-ROAD-001", qty: 1 },
  { code: "PIMA-ROAD-002", qty: 1 },
  { code: "PIMA-ROAD-003", qty: 1 },
  { code: "PIMA-ROAD-004", qty: 1 },
  // Port-a-Tank (Water Tanks)
  { code: "PT-001", qty: 2 },
  { code: "PT-002", qty: 1 },
  { code: "PT-003", qty: 1 },
  { code: "PT-004", qty: 1 },
  { code: "PT-005", qty: 1 },
  { code: "PT-006", qty: 1 },
  { code: "PT-007", qty: 4 },
  { code: "PT-008", qty: 3 },
  { code: "PT-009", qty: 1 },
  { code: "PT-010", qty: 1 },
  { code: "PT-011", qty: 1 },
  { code: "PT-012", qty: 1 },
  // Tank Rentals
  { code: "TANK-001", qty: 1 },
  { code: "TANK-002", qty: 1 },
  { code: "TANK-003", qty: 1 },
  { code: "TANK-004", qty: 1 },
  { code: "TANK-005", qty: 1 },
  { code: "TANK-006", qty: 1 },
  { code: "TANK-007", qty: 1 },
  { code: "TANK-008", qty: 1 },
  { code: "TANK-009", qty: 1 },
  { code: "TANK-010", qty: 1 },
  // Roll-off
  { code: "RO-001", qty: 1 },
  { code: "RO-002", qty: 1 },
  { code: "RO-003", qty: 1 },
  { code: "RO-004", qty: 1 },
  { code: "RO-006", qty: 1 },
  { code: "RO-007", qty: 1 },
  { code: "RO-008", qty: 1 },
  { code: "RO-009", qty: 1 },
  // Water Truck & Street Sweeper
  { code: "WT-001", qty: 4 },
  { code: "WT-002", qty: 2 },
  { code: "SS-001", qty: 2 },
  // Pressure Washing
  { code: "PW-001", qty: 1 },
  { code: "PW-002", qty: 1 },
  { code: "PW-003", qty: 1 },
  { code: "PW-004", qty: 1 },
  { code: "PW-005", qty: 1 },
  // Traffic Control
  { code: "TF-001", qty: 2 },
  { code: "TF-002", qty: 1 },
  { code: "TF-003", qty: 4 },
  { code: "TF-004", qty: 1 },
  { code: "TF-005", qty: 1 },
  { code: "TF-006", qty: 1 },
  { code: "TF-007", qty: 1 },
  { code: "TF-008", qty: 1 },
  { code: "TF-009", qty: 1 },
  // Weed Control
  { code: "WE-001", qty: 1 },
  { code: "WE-002", qty: 1 },
  { code: "WE-003", qty: 1 },
  { code: "WE-004", qty: 1 },
  { code: "WE-005", qty: 1 },
  { code: "WE-006", qty: 1 },
  { code: "WE-007", qty: 1 },
  { code: "WE-008", qty: 1 },
  { code: "WE-009", qty: 1 },
  { code: "WE-010", qty: 1 },
  // Other
  { code: "SC-001", qty: 1 },
  { code: "ADMIN-001", qty: 1 },
  { code: "ADMIN-002", qty: 1 },
  { code: "ADMIN-003", qty: 1 },
  { code: "ADMIN-004", qty: 1 },
]);

// Sections for grouped view
const sections: EditorSection[] = [
  { id: "swppp", name: "SWPPP Plans", showSubtotal: true },
  { id: "cm", name: "Compliance Management", showSubtotal: true },
  { id: "dust", name: "Dust Control", showSubtotal: true },
  { id: "pima", name: "Pima County Permits", showSubtotal: true },
  { id: "pt", name: "Port-a-Tank", showSubtotal: true },
  { id: "tank", name: "Tank Rentals", showSubtotal: true },
  { id: "ro", name: "Roll-off Services", showSubtotal: true },
  { id: "wt", name: "Water Truck & Sweeper", showSubtotal: true },
  { id: "pw", name: "Pressure Washing", showSubtotal: true },
  { id: "tf", name: "Traffic Control", showSubtotal: true },
  { id: "we", name: "Weed Control", showSubtotal: true },
  { id: "other", name: "Other Services", showSubtotal: true },
];

// Convert catalog LineItem to EditorLineItem format and assign sections
interface EditorLineItem {
  id: string;
  item: string;
  description: string;
  qty: number;
  uom: string;
  cost: number;
  total: number;
  sectionId?: string;
}

// Pattern rules for section assignment - checked in order
const SECTION_PATTERNS: Array<{ patterns: string[]; section: string }> = [
  { patterns: ["swppp"], section: "swppp" },
  { patterns: ["pima"], section: "pima" },
  { patterns: ["port-a-tank", "delivery", "pickup"], section: "pt" },
  { patterns: ["roll-off", "dumpster"], section: "ro" },
  { patterns: ["water truck", "sweeper"], section: "wt" },
  { patterns: ["pressure", "wash"], section: "pw" },
  { patterns: ["traffic", "flagger", "barricade", "cone"], section: "tf" },
  { patterns: ["weed", "herbicide", "spray"], section: "we" },
  { patterns: ["dust"], section: "dust" },
  { patterns: ["permit", "sign", "noi", "not", "inspection"], section: "cm" },
];

function matchesPatterns(name: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (name.includes(pattern)) {
      return true;
    }
  }
  return false;
}

function assignSectionId(item: { item: string }): string {
  const name = item.item.toLowerCase();

  // Special case: tank rental needs both keywords
  if (name.includes("tank") && name.includes("rental")) {
    return "tank";
  }

  for (const rule of SECTION_PATTERNS) {
    if (matchesPatterns(name, rule.patterns)) {
      return rule.section;
    }
  }

  return "other";
}

// Convert to EditorLineItem format
const lineItems: EditorLineItem[] = catalogLineItems.map((item, index) => ({
  id: String(index + 1),
  item: item.item,
  description: item.description,
  qty: item.qty,
  uom: item.uom,
  cost: item.cost,
  total: item.total,
  sectionId: assignSectionId(item),
}));

// Calculate total
const total = lineItems.reduce((sum, item) => sum + item.total, 0);

// Full test quote with all catalog items and sections
export const maxCatalogQuote: EditorQuote = {
  estimateNumber: "E-2026-TEST",
  date: new Date().toISOString(),
  estimator: "John Smith",
  estimatorEmail: "john@desertservicesaz.com",
  billTo: {
    companyName: "Southwest Construction Partners LLC",
    address: "4521 E Camelback Road, Suite 200\nPhoenix, AZ 85018",
    email: "mrodriguez@swcpartners.com",
    phone: "(602) 555-1234",
  },
  jobInfo: {
    siteName: "Phoenix Mixed-Use Development Phase 2",
    address: "1200 N Central Avenue\nPhoenix, AZ 85004",
  },
  sections,
  lineItems,
  total,
};

// Simple quote without sections (flat line items)
export const simpleQuote: EditorQuote = {
  ...maxCatalogQuote,
  sections: [],
  lineItems: lineItems.map((item) => ({ ...item, sectionId: undefined })),
};
