// PDF generation for Desert Services estimates
// Uses pdfmake for server-side PDF generation

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import { findItem } from "./catalog";
import type { LineItem, Quote, QuoteSection } from "./types";

// Initialize pdfmake fonts
const vfs =
  (pdfFonts as unknown as { pdfMake?: { vfs?: unknown } }).pdfMake?.vfs ??
  (pdfFonts as unknown as { vfs?: unknown }).vfs ??
  pdfFonts;
pdfMake.vfs = vfs as typeof pdfMake.vfs;

// Get logo as base64
const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = join(__dirname, "logo.png");

async function getLogoBase64(): Promise<string> {
  const file = Bun.file(LOGO_PATH);
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  return `data:image/png;base64,${base64}`;
}

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

// Table layouts
// Use 0.5pt borders so adjacent tables (0.5 + 0.5 = 1pt) look normal
const borderedLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => "#000",
  vLineColor: () => "#000",
};
const noBordersLayout = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
};

const noPaddingLayout = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => 0,
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0,
};

type GroupedItems = { section: QuoteSection | null; items: LineItem[] };

// Fixed widths for consistent column alignment across section tables
const TABLE_WIDTHS = ["auto", 95, "*", 35, 45, 50, 60];

// Back page service categories with catalog code mappings
type BackPageService = {
  title: string;
  items: Array<{
    label: string;
    catalogCode: string;
    pricePrefix?: string; // "from" or "starting at"
    priceSuffix?: string; // "/hr", "/mo", etc.
  }>;
  note?: string;
};

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

// Get price for a catalog item (returns null if not found)
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
function buildBackPageContent(logoBase64: string): Content[] {
  // Create pairs of service boxes for 2-column layout
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
              text: "Call for pricing: 480-513-8986",
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
          text: "Sales tax additional where applicable • ROC #198030",
          fontSize: 8,
          alignment: "center" as const,
          color: "#666",
        },
      ],
    },
  ];
}

function groupItemsBySection(
  items: LineItem[],
  sections: QuoteSection[]
): GroupedItems[] {
  const groups: GroupedItems[] = [];

  // Collect unsectioned items first
  const unsectioned: LineItem[] = [];
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
    const sectionItems: LineItem[] = [];
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
function calculateGroupSubtotal(items: LineItem[]): number {
  let total = 0;
  for (const item of items) {
    total += item.total;
  }
  return total;
}

// Build the table header row
function buildTableHeader(): TableCell[] {
  return [
    { text: "#", style: "tableHeader", alignment: "center" },
    { text: "Item", style: "tableHeader" },
    { text: "Description", style: "tableHeader" },
    { text: "Qty", style: "tableHeader", alignment: "center" },
    { text: "U/M", style: "tableHeader", alignment: "center" },
    { text: "Cost", style: "tableHeader", alignment: "right" },
    { text: "Total", style: "tableHeader", alignment: "right" },
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

// Build line item row
// Regex for parenthetical content at end of string
const PARENS_REGEX = /\s\(([^)]+)\)$/;

function buildItemRow(rowNumber: number, item: LineItem): TableCell[] {
  // Put parenthetical content on new line
  const itemText = item.item.replace(PARENS_REGEX, "\n($1)");

  return [
    { text: String(rowNumber), style: "tableCell", alignment: "center" },
    { text: itemText, style: "tableCell" },
    { text: item.description, style: "tableCell" },
    { text: String(item.qty), style: "tableCell", alignment: "center" },
    { text: item.uom, style: "tableCell", alignment: "center" },
    { text: formatCurrency(item.cost), style: "tableCell", alignment: "right" },
    {
      text: formatCurrency(item.total),
      style: "tableCell",
      alignment: "right",
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

// Build content as array of unbreakable section tables
// This prevents orphaned section headers at page bottoms
function buildSectionTables(groupedItems: GroupedItems[]): Content[] {
  const tables: Content[] = [];
  let rowNumber = 0;
  let isFirst = true;

  for (const group of groupedItems) {
    const sectionBody: TableCell[][] = [];
    const isFirstTable = isFirst; // Capture value for closure

    // Add table header row only for the first table
    if (isFirst) {
      sectionBody.push(buildTableHeader());
    }

    // Add section header row if this group has a section
    if (group.section !== null) {
      sectionBody.push(buildSectionRow(group.section.name));
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

    // Create table for this section
    const sectionTable: Content = {
      unbreakable: true,
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
function buildSimpleLineItems(lineItems: LineItem[]): Content[] {
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

export type GeneratePDFOptions = {
  includeBackPage?: boolean;
  style?: "simple" | "sectioned"; // simple = flat line items, sectioned = grouped with subtotals (default)
};

function buildDocDefinition(
  quote: Quote,
  logoBase64: string,
  options?: GeneratePDFOptions
): TDocumentDefinitions {
  // Build content based on style option
  const style = options?.style ?? "sectioned";
  const contentTables =
    style === "simple"
      ? buildSimpleLineItems(quote.lineItems)
      : buildSectionTables(
          groupItemsBySection(quote.lineItems, quote.sections)
        );

  return {
    pageSize: "LETTER",
    pageMargins: [40, 175, 40, 195], // Header with 2-box layout

    header: (): Content => ({
      margin: [40, 30, 40, 0],
      table: {
        widths: ["*", 30, "*"],
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
                  margin: [0, 5, 0, 7],
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
                          text: quote.estimator,
                          fontSize: 9,
                          alignment: "center",
                        },
                        {
                          text: formatDate(quote.date),
                          fontSize: 9,
                          alignment: "center",
                        },
                        {
                          text: quote.estimateNumber,
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
                      margin: [4, 4, 4, 4],
                    },
                  ],
                  [
                    {
                      text: [
                        { text: `${quote.billTo.companyName}\n`, bold: true },
                        {
                          text: `${quote.billTo.address ?? ""}\n${quote.billTo.address2 ?? ""}`,
                        },
                      ],
                      fontSize: 9,
                      margin: [4, 4, 4, 4],
                    },
                  ],
                ],
              },
              layout: borderedLayout,
              border: [false, false, false, false],
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
                      margin: [4, 4, 4, 4],
                    },
                  ],
                  [
                    {
                      text: [
                        { text: `${quote.project.name}\n`, bold: true },
                        {
                          text: `${quote.siteAddress.line1}\n${quote.siteAddress.line2 ?? ""}`,
                        },
                      ],
                      fontSize: 9,
                      margin: [4, 4, 4, 4],
                    },
                  ],
                ],
              },
              layout: borderedLayout,
              border: [false, false, false, false],
            },
          ],
        ],
      },
      layout: noPaddingLayout,
    }),

    footer: (currentPage, pageCount): Content => ({
      margin: [40, 0, 40, 10],
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
                      fontSize: 9,
                      lineHeight: 1.2,
                    },
                    {
                      text: "Maintenance and removal is not included unless specifically listed as a line item.",
                      fontSize: 9,
                      lineHeight: 1.2,
                      margin: [0, 2, 0, 0],
                    },
                  ],
                  margin: [4, 8, 4, 4],
                  rowSpan: 2,
                },
                {
                  columns: [
                    { text: "Total:", bold: true, fontSize: 11 },
                    {
                      text:
                        currentPage === pageCount
                          ? formatCurrency(quote.total)
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
                  fontSize: 9,
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
          table: {
            widths: ["*"],
            body: [
              [
                {
                  text: "By signing this estimate I am authorizing Desert Services LLC to proceed with the work indicated above.",
                  fontSize: 10,
                  margin: [0, 2, 0, 2],
                },
              ],
              [
                {
                  columns: [
                    {
                      text: "Print Name: _______________________________",
                      fontSize: 10,
                    },
                    {
                      text: "Signature: _______________________________",
                      fontSize: 10,
                    },
                  ],
                },
              ],
            ],
          },
          layout: noBordersLayout,
          margin: [0, 6, 0, 6],
        },
        {
          table: {
            widths: ["*", "*"],
            body: [
              [
                {
                  text: "PO Box: 14695, Scottsdale, AZ 85267",
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
                      text: "Fax: 480-657-2057",
                      alignment: "center",
                      color: "#fff",
                      fontSize: 9,
                    },
                    {
                      text: "ROC #198030",
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
                      text: `Phone: ${quote.estimatorPhone ?? "480-513-8986"}`,
                      alignment: "center",
                      color: "#fff",
                      fontSize: 9,
                    },
                    {
                      text: `Email: ${quote.estimatorEmail}`,
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
          layout: noBordersLayout,
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
      title: { fontSize: 20, bold: true },
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

// Generate standalone back page PDF
export async function generateBackPagePDF(): Promise<Buffer> {
  const logoBase64 = await getLogoBase64();

  const docDefinition: TDocumentDefinitions = {
    pageSize: "LETTER",
    pageMargins: [40, 40, 40, 40], // Simple margins, full page canvas
    content: buildBackPageContent(logoBase64),
  };

  return new Promise((resolve, _reject) => {
    const pdfDoc = pdfMake.createPdf(docDefinition);
    pdfDoc.getBuffer((buffer: Buffer) => {
      resolve(buffer);
    });
  });
}

// Concatenate multiple PDFs into one
async function concatenatePDFs(pdfBuffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();

  for (const buffer of pdfBuffers) {
    const doc = await PDFDocument.load(buffer);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }

  return Buffer.from(await merged.save());
}

// Generate estimate PDF (without back page)
async function generateEstimatePDF(
  quote: Quote,
  options?: GeneratePDFOptions
): Promise<Buffer> {
  const logoBase64 = await getLogoBase64();
  const docDefinition = buildDocDefinition(quote, logoBase64, options);

  return new Promise((resolve, _reject) => {
    const pdfDoc = pdfMake.createPdf(docDefinition);
    pdfDoc.getBuffer((buffer: Buffer) => {
      resolve(buffer);
    });
  });
}

// Generate PDF as Buffer (for saving/sending)
export async function generatePDF(
  quote: Quote,
  options?: GeneratePDFOptions
): Promise<Buffer> {
  const estimatePDF = await generateEstimatePDF(quote, options);

  if (options?.includeBackPage) {
    const backPagePDF = await generateBackPagePDF();
    return concatenatePDFs([estimatePDF, backPagePDF]);
  }

  return estimatePDF;
}

// Convert string to URL-safe slug
const NON_ALPHANUMERIC_REGEX = /[^a-z0-9]+/g;
const MULTIPLE_DASHES_REGEX = /-+/g;
const LEADING_TRAILING_DASH_REGEX = /^-|-$/g;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_REGEX, "-")
    .replace(MULTIPLE_DASHES_REGEX, "-")
    .replace(LEADING_TRAILING_DASH_REGEX, "");
}

// Generate PDF filename
export function getPDFFilename(quote: Quote): string {
  const companySlug = slugify(quote.billTo.companyName);
  return `Estimate-${quote.estimateNumber}-${companySlug}.pdf`;
}

// Save PDF to file
export async function savePDF(
  quote: Quote,
  outputPath?: string,
  options?: GeneratePDFOptions
): Promise<string> {
  const buffer = await generatePDF(quote, options);
  const filename = outputPath ?? getPDFFilename(quote);
  await Bun.write(filename, buffer);
  return filename;
}
