// Estimate-specific PDF document definition builders
// Used by both server and client estimate PDF generators

import type {
  EditorEstimate,
  EditorLineItem,
  EditorSection,
} from "@lib/db/types";
import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import { findItem } from "@/lib/catalog";
import { COMPANY, FONT_TITLE } from "../shared/brand";
import {
  borderedLayout,
  noBordersLayout,
  noPaddingLayout,
} from "../shared/layouts";

// Formatting helpers
function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

// Split address into two lines: street on line 1, city/state/zip on line 2
// If already contains a newline, respect it. Otherwise split on first comma.
function formatAddress(address: string | undefined): string {
  if (!address) {
    return "";
  }
  if (address.includes("\n")) {
    return address;
  }
  const commaIdx = address.indexOf(",");
  if (commaIdx > 0) {
    return `${address.slice(0, commaIdx)}\n${address.slice(commaIdx + 1).trim()}`;
  }
  return address;
}

interface GroupedItems {
  section: EditorSection | null;
  items: EditorLineItem[];
}

// Column widths: #/Item fixed, Description fills remaining, numeric columns auto-shrink to content
// U/M set to 32pt min — fits "Month" on one line, so "LF/Month" wraps to 2 lines not 1-char orphans
const TABLE_WIDTHS = [18, 90, "*", "auto", 32, "auto", "auto"];

// ============================================
// Back Page Service Categories
// ============================================

interface BackPageServiceItem {
  label: string;
  catalogCode: string;
  pricePrefix?: string;
  priceSuffix?: string;
}

interface BackPageService {
  title: string;
  items: BackPageServiceItem[];
  note?: string;
}

const BACK_PAGE_SERVICES: BackPageService[] = [
  {
    title: "SWPPP / Stormwater",
    items: [
      {
        label: "SWPPP Plans & Narratives",
        catalogCode: "SWPPP-002",
        pricePrefix: "from",
      },
      {
        label: "14-Day Inspections",
        catalogCode: "SWPPP-005",
        pricePrefix: "from",
      },
      {
        label: "BMP Installation & Repair",
        catalogCode: "ADMIN-001",
        pricePrefix: "from",
      },
    ],
    note: "Full compliance services available",
  },
  {
    title: "Dust Permits",
    items: [
      {
        label: "Permit Filing (<1 acre)",
        catalogCode: "DUST-001",
        pricePrefix: "from",
      },
      {
        label: "Permit Filing (1-5 acres)",
        catalogCode: "DUST-002",
        pricePrefix: "from",
      },
      { label: "Dust Control Sign (5+ acres)", catalogCode: "DUST-008" },
    ],
    note: "Includes ADEQ filing fees",
  },
  {
    title: "Water Trucks",
    items: [
      {
        label: "Water Truck w/ Operator",
        catalogCode: "WT-001",
        priceSuffix: "/hr",
      },
      {
        label: "Soil Stabilization",
        catalogCode: "WT-002",
        pricePrefix: "from",
        priceSuffix: "/acre",
      },
    ],
    note: "2 hr minimum. +10% fuel surcharge",
  },
  {
    title: "Portable Toilets",
    items: [
      { label: "Standard (1x/wk)", catalogCode: "PT-003", priceSuffix: "/mo" },
      {
        label: "ADA Compliant (1x/wk)",
        catalogCode: "PT-009",
        priceSuffix: "/mo",
      },
      {
        label: "Handwash Station",
        catalogCode: "PT-006",
        pricePrefix: "from",
        priceSuffix: "/mo",
      },
    ],
    note: "+10% fuel surcharge",
  },
  {
    title: "Roll-Off Dumpsters",
    items: [
      {
        label: "10 yd (2 tons incl)",
        catalogCode: "RO-009",
        pricePrefix: "from",
      },
      {
        label: "20 yd (2 tons incl)",
        catalogCode: "RO-002",
        pricePrefix: "from",
      },
      {
        label: "30 yd (3 tons incl)",
        catalogCode: "RO-003",
        pricePrefix: "from",
      },
      {
        label: "40 yd (4 tons incl)",
        catalogCode: "RO-004",
        pricePrefix: "from",
      },
    ],
    note: "+10% fuel surcharge. Overage $65/ton",
  },
  {
    title: "Compliance Signs",
    items: [
      { label: "SWPPP Sign", catalogCode: "CM-013" },
      { label: "Fire Access Sign", catalogCode: "CM-014" },
      { label: "Dust Control Sign", catalogCode: "DUST-008" },
    ],
  },
  {
    title: "Street Sweeping",
    items: [
      {
        label: "Street Sweeper w/ Operator",
        catalogCode: "SS-001",
        priceSuffix: "/hr",
      },
    ],
    note: "2 hr minimum. +10% fuel surcharge",
  },
  {
    title: "Pressure Washing",
    items: [
      { label: "Regular Hours", catalogCode: "PW-001", priceSuffix: "/hr" },
      { label: "After Hours", catalogCode: "PW-002", priceSuffix: "/hr" },
      { label: "Auto Scrubber", catalogCode: "PW-003", priceSuffix: "/hr" },
    ],
    note: "2 hr minimum. +10% fuel surcharge",
  },
  {
    title: "Temporary Fencing",
    items: [
      { label: "Install/Remove", catalogCode: "TF-001", priceSuffix: "/LF" },
      { label: "Monthly Rental", catalogCode: "TF-002", priceSuffix: "/LF/mo" },
      { label: "Privacy Screen", catalogCode: "TF-003", priceSuffix: "/LF" },
    ],
    note: "Trip charge additional",
  },
  {
    title: "Tanks & Waste Service",
    items: [
      { label: "Full Tank System Install", catalogCode: "TANK-001" },
      {
        label: "Weekly Service (waste)",
        catalogCode: "TANK-003",
        priceSuffix: "/mo",
      },
      {
        label: "Weekly Service (full)",
        catalogCode: "TANK-005",
        priceSuffix: "/mo",
      },
    ],
  },
];

// Get price for a catalog item
function getCatalogPrice(code: string): number | null {
  const item = findItem(code);
  return item?.price ?? null;
}

// Format price for back page display
function formatBackPagePrice(
  catalogCode: string,
  pricePrefix?: string,
  priceSuffix?: string
): string {
  const price = getCatalogPrice(catalogCode);
  if (price === null) {
    return "";
  }

  const formattedPrice =
    price < 10
      ? `$${price.toFixed(2)}`
      : `$${Math.round(price).toLocaleString()}`;

  const prefix = pricePrefix ? `${pricePrefix} ` : "";
  const suffix = priceSuffix ?? "";

  return `${prefix}${formattedPrice}${suffix}`;
}

// Build a single service box for the back page
function buildServiceBox(service: BackPageService): Content {
  const itemRows: Content[] = service.items.map((item) => ({
    columns: [
      { text: item.label, fontSize: 8, width: "*" },
      {
        text: formatBackPagePrice(
          item.catalogCode,
          item.pricePrefix,
          item.priceSuffix
        ),
        fontSize: 8,
        alignment: "right" as const,
        width: "auto",
        bold: true,
      },
    ],
    margin: [0, 1, 0, 1] as [number, number, number, number],
  }));

  const stack: Content[] = [
    {
      text: service.title,
      fontSize: 10,
      bold: true,
      margin: [0, 0, 0, 4] as [number, number, number, number],
    },
    ...itemRows,
  ];

  if (service.note) {
    stack.push({
      text: service.note,
      fontSize: 7,
      italics: true,
      color: "#666",
      margin: [0, 4, 0, 0] as [number, number, number, number],
    });
  }

  return {
    stack,
    margin: [8, 8, 8, 8] as [number, number, number, number],
  };
}

// Build the back page content (standalone, no page break)
export function buildEstimateBackPageContent(logoBase64: string): Content[] {
  const rows: Content[] = [];

  for (let i = 0; i < BACK_PAGE_SERVICES.length; i += 2) {
    const leftService = BACK_PAGE_SERVICES[i];
    const rightService = BACK_PAGE_SERVICES[i + 1];

    if (!leftService) {
      continue;
    }

    const tableBody: TableCell[][] = [
      [
        buildServiceBox(leftService),
        rightService ? buildServiceBox(rightService) : { text: "" },
      ],
    ];

    rows.push({
      table: {
        widths: ["50%", "50%"],
        body: tableBody,
      },
      layout: borderedLayout,
      margin: [0, 0, 0, 0] as [number, number, number, number],
    });
  }

  return [
    // Header with logo and title
    {
      columns: [
        {
          image: logoBase64,
          fit: [200, 45],
          width: "auto",
        },
        {
          stack: [
            {
              text: "Desert Services",
              fontSize: 22,
              bold: true,
              alignment: "right",
            },
            {
              text: "Full-Service Construction Support",
              fontSize: 11,
              alignment: "right",
              color: "#666",
            },
          ],
          width: "*",
        },
      ],
      margin: [0, 0, 0, 15],
    } as Content,

    // Phone number banner
    {
      table: {
        widths: ["*"],
        body: [
          [
            {
              text: `Call for pricing: ${COMPANY.phone}`,
              fontSize: 14,
              bold: true,
              alignment: "center" as const,
              fillColor: "#000",
              color: "#fff",
              margin: [0, 8, 0, 8] as [number, number, number, number],
            },
          ],
        ],
      },
      layout: noBordersLayout,
      margin: [0, 0, 0, 15] as [number, number, number, number],
    },

    // Service boxes grid
    ...rows,

    // Footer disclaimers
    {
      stack: [
        {
          text: "2026 Pricing • Subject to change • +10% fuel surcharge applies to most services",
          fontSize: 8,
          alignment: "center" as const,
          margin: [0, 15, 0, 2] as [number, number, number, number],
        },
        {
          text: `Sales tax additional where applicable • ROC #${COMPANY.roc}`,
          fontSize: 8,
          alignment: "center" as const,
          color: "#666",
        },
      ],
    },
  ];
}

// ============================================
// Line Item Table Building
// ============================================

function groupItemsBySection(
  items: EditorLineItem[],
  sections: EditorSection[]
): GroupedItems[] {
  const groups: GroupedItems[] = [];

  // Collect unsectioned items first
  const unsectioned: EditorLineItem[] = [];
  for (const item of items) {
    if (item.sectionId === undefined) {
      unsectioned.push(item);
    }
  }

  if (unsectioned.length > 0) {
    groups.push({ section: null, items: unsectioned });
  }

  // Group items by section
  for (const section of sections) {
    const sectionItems: EditorLineItem[] = [];
    for (const item of items) {
      if (item.sectionId === section.id) {
        sectionItems.push(item);
      }
    }

    if (sectionItems.length > 0) {
      groups.push({ section, items: sectionItems });
    }
  }

  return groups;
}

// Calculate subtotal for a group of items
function calculateGroupSubtotal(items: EditorLineItem[]): number {
  let total = 0;
  for (const item of items) {
    total += item.total;
  }
  return total;
}

// Build the table header row
function buildTableHeader(): TableCell[] {
  return [
    { text: "#", style: "tableHeader", alignment: "center", noWrap: true },
    { text: "Item", style: "tableHeader", noWrap: true },
    { text: "Description", style: "tableHeader", noWrap: true },
    { text: "Qty", style: "tableHeader", alignment: "center", noWrap: true },
    { text: "U/M", style: "tableHeader", alignment: "center", noWrap: true },
    { text: "Cost", style: "tableHeader", alignment: "right", noWrap: true },
    { text: "Total", style: "tableHeader", alignment: "right", noWrap: true },
  ];
}

// Build section header row
function buildSectionRow(sectionName: string): TableCell[] {
  return [
    {
      text: sectionName,
      colSpan: 7,
      style: "sectionHeader",
    },
    {},
    {},
    {},
    {},
    {},
    {},
  ];
}

// Regex for parenthetical content at end of string
const PARENS_REGEX = /\s\(([^)]+)\)$/;

// Build line item row
function buildItemRow(rowNumber: number, item: EditorLineItem): TableCell[] {
  // Put parenthetical content on new line
  const itemText = item.item.replace(PARENS_REGEX, "\n($1)");

  return [
    { text: String(rowNumber), style: "tableCell", alignment: "center" },
    { text: itemText, style: "tableCell" },
    { text: item.description, style: "tableCell" },
    {
      text: String(item.qty),
      style: "tableCell",
      alignment: "center",
      noWrap: true,
    },
    { text: item.uom, style: "tableCell", alignment: "center" },
    {
      text: formatCurrency(item.cost),
      style: "tableCell",
      alignment: "right",
      noWrap: true,
    },
    {
      text: formatCurrency(item.total),
      style: "tableCell",
      alignment: "right",
      noWrap: true,
    },
  ];
}

// Build subtotal row
function buildSubtotalRow(subtotal: number): TableCell[] {
  return [
    { text: "", colSpan: 5 },
    {},
    {},
    {},
    {},
    { text: "Subtotal:", style: "subtotalCell", alignment: "right" },
    {
      text: formatCurrency(subtotal),
      style: "subtotalCell",
      alignment: "right",
    },
  ];
}

// Build content as separate section tables with gaps between them
function buildSectionTables(
  groupedItems: GroupedItems[],
  _unbreakable: boolean
): Content[] {
  const tables: Content[] = [];
  let rowNumber = 0;
  let isFirst = true;

  for (const group of groupedItems) {
    const sectionBody: TableCell[][] = [];
    const isFirstTable = isFirst;

    // Add table header row only for the first table
    if (isFirst) {
      sectionBody.push(buildTableHeader());
    }

    // Add section header row if this group has a section
    if (group.section !== null) {
      // Use title if set, otherwise fall back to name
      const displayName = group.section.title ?? group.section.name;
      sectionBody.push(buildSectionRow(displayName));
    }

    // Add item rows
    for (const item of group.items) {
      rowNumber += 1;
      sectionBody.push(buildItemRow(rowNumber, item));
    }

    // Add subtotal row if section has showSubtotal
    if (group.section?.showSubtotal) {
      const subtotal = calculateGroupSubtotal(group.items);
      sectionBody.push(buildSubtotalRow(subtotal));
    }

    // Create table for this section — always breakable, dontBreakRows handles row integrity
    const sectionTable: Content = {
      margin: isFirst
        ? undefined
        : ([0, 4, 0, 0] as [number, number, number, number]),
      table: {
        headerRows: isFirst ? 1 : 0,
        dontBreakRows: true,
        widths: TABLE_WIDTHS,
        body: sectionBody,
      },
      layout: {
        ...borderedLayout,
        fillColor: (rowIndex: number) =>
          isFirstTable && rowIndex === 0 ? "#f0f0f0" : null,
      },
    };

    tables.push(sectionTable);
    isFirst = false;
  }

  return tables;
}

// Build simple flat line item table (no sections, no subtotals)
function buildSimpleLineItems(lineItems: EditorLineItem[]): Content[] {
  const tableBody: TableCell[][] = [];

  // Header row
  tableBody.push(buildTableHeader());

  // Line item rows (flat, no sections)
  let rowNumber = 0;
  for (const item of lineItems) {
    rowNumber += 1;
    tableBody.push(buildItemRow(rowNumber, item));
  }

  const table: Content = {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: TABLE_WIDTHS,
      body: tableBody,
    },
    layout: {
      ...borderedLayout,
      fillColor: (rowIndex: number) => (rowIndex === 0 ? "#f0f0f0" : null),
    },
  };

  return [table];
}

// ============================================
// Document Definition
// ============================================

export interface EstimatePDFOptions {
  /** Include back page with catalog pricing */
  includeBackPage?: boolean;
  /** "simple" = flat line items, "sectioned" = grouped with headers (default) */
  style?: "simple" | "sectioned";
  /** Keep section tables together on same page (default: true) */
  unbreakableSections?: boolean;
}

export function buildEstimateDocDefinition(
  estimate: EditorEstimate,
  logoBase64: string,
  options?: EstimatePDFOptions
): TDocumentDefinitions {
  // Filter out struck items - they shouldn't appear on the PDF
  const visibleItems = estimate.lineItems;

  // Build content based on style option
  const style = options?.style ?? "sectioned";
  const unbreakable = options?.unbreakableSections ?? true;

  let contentTables: Content[];
  if (visibleItems.length === 0) {
    contentTables = [
      {
        text: "No line items",
        italics: true,
        color: "#999",
        alignment: "center" as const,
        margin: [0, 20, 0, 0] as [number, number, number, number],
      } as Content,
    ];
  } else if (style === "simple") {
    contentTables = buildSimpleLineItems(visibleItems);
  } else {
    contentTables = buildSectionTables(
      groupItemsBySection(visibleItems, estimate.sections),
      unbreakable
    );
  }

  return {
    pageSize: "LETTER",
    pageMargins: [40, 168, 40, 185],

    header: (): Content => ({
      margin: [40, 36, 40, 0],
      table: {
        widths: ["*", 20, "*"],
        body: [
          // Row 1: Logo | gap | Title + Estimator (no borders)
          [
            {
              image: logoBase64,
              fit: [240, 55],
              border: [false, false, false, false],
            },
            { text: "", border: [false, false, false, false] },
            {
              stack: [
                {
                  text: "Services Estimate",
                  style: "title",
                  alignment: "right",
                },
                {
                  margin: [0, 4, 0, 0],
                  table: {
                    widths: ["*", "*", "*"],
                    body: [
                      [
                        {
                          text: "Estimator",
                          bold: true,
                          fontSize: 9,
                          alignment: "center",
                        },
                        {
                          text: "Date",
                          bold: true,
                          fontSize: 9,
                          alignment: "center",
                        },
                        {
                          text: "Estimate #",
                          bold: true,
                          fontSize: 9,
                          alignment: "center",
                        },
                      ],
                      [
                        {
                          text: estimate.estimator,
                          fontSize: 9,
                          alignment: "center",
                        },
                        {
                          text: formatDate(estimate.date),
                          fontSize: 9,
                          alignment: "center",
                        },
                        {
                          text: estimate.estimateNumber,
                          fontSize: 9,
                          alignment: "center",
                        },
                      ],
                    ],
                  },
                  layout: borderedLayout,
                },
              ],
              border: [false, false, false, false],
            },
          ],
          // Row 2: Bill To | gap | Job Info (nested tables for gray headers)
          [
            {
              table: {
                widths: ["*"],
                body: [
                  [
                    {
                      text: "Bill To:",
                      bold: true,
                      fontSize: 9,
                      fillColor: "#f0f0f0",
                      margin: [3, 2, 3, 2],
                    },
                  ],
                  [
                    {
                      text: [
                        {
                          text: `${estimate.billTo.companyName}\n`,
                          bold: true,
                        },
                        { text: estimate.billTo.address ?? "" },
                      ],
                      fontSize: 9,
                      lineHeight: 1.15,
                      margin: [3, 2, 3, 2],
                    },
                  ],
                ],
              },
              layout: borderedLayout,
              border: [false, false, false, false],
              margin: [0, 6, 0, 0],
            },
            { text: "", border: [false, false, false, false] },
            {
              table: {
                widths: ["*"],
                body: [
                  [
                    {
                      text: "Job Info:",
                      bold: true,
                      fontSize: 9,
                      fillColor: "#f0f0f0",
                      margin: [3, 2, 3, 2],
                    },
                  ],
                  [
                    {
                      text: [
                        { text: `${estimate.jobInfo.siteName}\n`, bold: true },
                        { text: formatAddress(estimate.jobInfo.address) },
                      ],
                      fontSize: 9,
                      lineHeight: 1.15,
                      margin: [3, 2, 3, 2],
                    },
                  ],
                ],
              },
              layout: borderedLayout,
              border: [false, false, false, false],
              margin: [0, 6, 0, 0],
            },
          ],
        ],
      },
      layout: noPaddingLayout,
    }),

    footer: (currentPage, pageCount): Content => ({
      margin: [40, 8, 40, 8],
      stack: [
        {
          table: {
            widths: ["65%", "35%"],
            body: [
              [
                {
                  stack: [
                    {
                      text: [
                        "Pricing based on specified quantities, and this is an ESTIMATE ONLY. Actual quantities will be billed. ",
                        { text: "Valid for 180 days.", bold: true },
                      ],
                      fontSize: 8.5,
                      lineHeight: 1.15,
                    },
                    {
                      text: "Maintenance and removal is not included unless specifically listed as a line item.",
                      fontSize: 8.5,
                      lineHeight: 1.15,
                      margin: [0, 1, 0, 0],
                    },
                  ],
                  margin: [4, 4, 4, 4],
                  rowSpan: 2,
                },
                {
                  columns: [
                    { text: "Total:", bold: true, fontSize: 11 },
                    {
                      text:
                        currentPage === pageCount
                          ? formatCurrency(estimate.total)
                          : "See last page",
                      fontSize: 11,
                      alignment: "right",
                      italics: currentPage !== pageCount,
                      color: currentPage === pageCount ? "#000" : "#666",
                    },
                  ],
                  margin: [4, 4, 4, 4],
                },
              ],
              [
                {},
                {
                  text: "ALL ADDENDA HAVE BEEN RECEIVED AND ACKNOWLEDGED",
                  fontSize: 8,
                  bold: true,
                  alignment: "center",
                  margin: [4, 4, 4, 4],
                },
              ],
            ],
          },
          layout: borderedLayout,
        },
        {
          text: "By signing this estimate I am authorizing Desert Services LLC to proceed with the work indicated above.",
          fontSize: 9,
          alignment: "center",
          margin: [0, 8, 0, 6],
        },
        {
          columns: [
            {
              text: "Print Name: ____________________________________________",
              fontSize: 9,
            },
            {
              text: "Signature: ____________________________________________",
              fontSize: 9,
            },
          ],
          margin: [0, 0, 0, 6],
        },
        // Footer: PO Box on top, Phone/Fax below
        // Single table with thin gray separator lines
        {
          table: {
            widths: ["*", "*"],
            body: [
              [
                {
                  text: COMPANY.poBox,
                  alignment: "center",
                  fillColor: "#000",
                  color: "#fff",
                  fontSize: 9,
                  margin: [0, 4, 0, 4],
                  colSpan: 2,
                },
                {},
              ],
              [
                {
                  stack: [
                    {
                      text: `Fax: ${COMPANY.fax}`,
                      alignment: "center",
                      color: "#fff",
                      fontSize: 9,
                    },
                    {
                      text: `ROC #${COMPANY.roc}`,
                      alignment: "center",
                      color: "#fff",
                      fontSize: 9,
                    },
                  ],
                  fillColor: "#000",
                  margin: [0, 4, 0, 4],
                },
                {
                  stack: [
                    {
                      text: `Phone: ${COMPANY.phoneCompact}`,
                      alignment: "center",
                      color: "#fff",
                      fontSize: 9,
                    },
                    {
                      text: `Email: ${estimate.estimatorEmail}`,
                      alignment: "center",
                      color: "#fff",
                      fontSize: 9,
                    },
                  ],
                  fillColor: "#000",
                  margin: [0, 4, 0, 4],
                },
              ],
            ],
          },
          layout: {
            hLineWidth: (i: number, _node: { table: { body: unknown[] } }) =>
              i === 1 ? 0.5 : 0, // Only line between rows
            vLineWidth: (i: number) => (i === 1 ? 0.5 : 0), // Only line between columns
            hLineColor: () => "#888",
            vLineColor: () => "#888",
          },
        },
        {
          text: `Page ${currentPage} of ${pageCount}`,
          alignment: "center",
          fontSize: 9,
          color: "#666",
          margin: [0, 4, 0, 0],
        },
      ],
    }),

    content: contentTables,

    styles: {
      title: { fontSize: 20, bold: true, font: FONT_TITLE },
      tableHeader: { fontSize: 9, bold: true, margin: [2, 2, 2, 2] },
      tableCell: { fontSize: 9, margin: [2, 2, 2, 2] },
      sectionHeader: {
        fontSize: 9,
        bold: true,
        fillColor: "#e0e0e0",
        margin: [4, 3, 3, 3],
      },
      subtotalCell: {
        fontSize: 9,
        bold: true,
        fillColor: "#f5f5f5",
        margin: [2, 2, 2, 2],
      },
    },
  };
}

// Build back page document definition
export function buildEstimateBackPageDocDefinition(
  logoBase64: string
): TDocumentDefinitions {
  return {
    pageSize: "LETTER",
    pageMargins: [40, 40, 40, 40],
    content: buildEstimateBackPageContent(logoBase64),
  };
}
