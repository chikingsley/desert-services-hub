import { spawn } from "node:child_process";
import { createLineItems } from "./services/quoting/catalog";
import { savePDF } from "./services/quoting/pdf";
import type { Quote, QuoteSection } from "./services/quoting/types";

// Create a lot of line items using actual catalog codes to span multiple pages
const lineItems = createLineItems([
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
const sections: QuoteSection[] = [
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

// Assign section IDs to line items based on item name patterns
for (const item of lineItems) {
  const name = item.item.toLowerCase();

  if (name.includes("swppp")) {
    item.sectionId = "swppp";
  } else if (
    name.includes("permit") ||
    name.includes("sign") ||
    name.includes("noi") ||
    name.includes("not") ||
    name.includes("inspection")
  ) {
    item.sectionId = "cm";
  } else if (name.includes("pima")) {
    item.sectionId = "pima";
  } else if (
    name.includes("port-a-tank") ||
    name.includes("delivery") ||
    name.includes("pickup")
  ) {
    item.sectionId = "pt";
  } else if (name.includes("tank") && name.includes("rental")) {
    item.sectionId = "tank";
  } else if (name.includes("roll-off") || name.includes("dumpster")) {
    item.sectionId = "ro";
  } else if (name.includes("water truck") || name.includes("sweeper")) {
    item.sectionId = "wt";
  } else if (name.includes("pressure") || name.includes("wash")) {
    item.sectionId = "pw";
  } else if (
    name.includes("traffic") ||
    name.includes("flagger") ||
    name.includes("barricade") ||
    name.includes("cone")
  ) {
    item.sectionId = "tf";
  } else if (
    name.includes("weed") ||
    name.includes("herbicide") ||
    name.includes("spray")
  ) {
    item.sectionId = "we";
  } else if (name.includes("dust")) {
    item.sectionId = "dust";
  } else {
    item.sectionId = "other";
  }
}

// Calculate total
const total = lineItems.reduce((sum, item) => sum + item.total, 0);

const quote: Quote = {
  estimateNumber: "E-2026-0001",
  date: "January 14, 2026",
  estimator: "John Smith",
  estimatorEmail: "john@desertservicesaz.com",
  billTo: {
    companyName: "Southwest Construction Partners LLC",
    address: "4521 E Camelback Road, Suite 200",
    address2: "Phoenix, AZ 85018",
  },
  attn: {
    name: "Michael Rodriguez",
    title: "Project Manager",
    email: "mrodriguez@swcpartners.com",
    phone: "(602) 555-1234",
  },
  project: {
    name: "Phoenix Mixed-Use Development Phase 2",
    name2: "Central Avenue Tower Project",
  },
  siteAddress: {
    line1: "1200 N Central Avenue",
    line2: "Phoenix, AZ 85004",
  },
  lineItems,
  sections,
  total,
};

async function main() {
  console.log(`Total line items: ${lineItems.length}`);
  console.log(`Total value: $${total.toLocaleString()}`);

  // Generate simple style (flat line items, no sections)
  console.log("\nGenerating simple style PDF...");
  const simplePath = await savePDF(quote, "test-multipage-simple.pdf", {
    style: "simple",
  });
  console.log(`Saved: ${simplePath}`);

  // Generate sectioned style (grouped with subtotals)
  console.log("\nGenerating sectioned style PDF...");
  const sectionedPath = await savePDF(quote, "test-multipage-sectioned.pdf", {
    style: "sectioned",
  });
  console.log(`Saved: ${sectionedPath}`);

  console.log("\nDone!");

  spawn("open", [simplePath]);
}

main();
