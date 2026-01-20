import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import logoUrl from "./desert-services-horizontal-color-logo.png";
import type { LineItem, Quote, QuoteSection } from "./types";

// Initialize pdfmake with fonts
// Handle different pdfFonts structures (some versions use .vfs, some use .pdfMake.vfs, some have fonts directly)
const vfs =
  (pdfFonts as unknown as { pdfMake?: { vfs?: unknown } }).pdfMake?.vfs ??
  (pdfFonts as unknown as { vfs?: unknown }).vfs ??
  pdfFonts;
pdfMake.vfs = vfs as typeof pdfMake.vfs;

// Convert image to base64 for pdfMake
async function getLogoBase64(): Promise<string> {
  const response = await fetch(logoUrl);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Utility functions
const formatCurrency = (value: number) => `$${value.toFixed(2)}`;

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
};

const toTitleCase = (str: string) =>
  str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

// Strip number prefix from section names (e.g., "1. Traffic Control" -> "Traffic Control")
const stripSectionNumber = (str: string) => str.replace(/^\d+\.\s*/, "");

type GroupedItems = { section: QuoteSection | null; items: LineItem[] };

function groupItemsBySection(
  items: LineItem[],
  sections: QuoteSection[]
): GroupedItems[] {
  const groups: GroupedItems[] = [];
  const unsectioned = items.filter((item) => !item.sectionId);
  if (unsectioned.length > 0) {
    groups.push({ section: null, items: unsectioned });
  }
  for (const section of sections) {
    const sectionItems = items.filter((item) => item.sectionId === section.id);
    if (sectionItems.length > 0) {
      groups.push({ section, items: sectionItems });
    }
  }
  return groups;
}

// Shared table layout with borders
const borderedTableLayout = {
  hLineWidth: () => 1,
  vLineWidth: () => 1,
  hLineColor: () => "#000",
  vLineColor: () => "#000",
};

// DEBUG: Shows all borders in magenta for layout debugging
const DEBUG_MODE = false;
const debugLayout = {
  hLineWidth: () => 1,
  vLineWidth: () => 1,
  hLineColor: () => "#ff00ff",
  vLineColor: () => "#ff00ff",
};

// No borders layout for structural/wrapper tables
const noBordersLayout = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
};

// Use normal borders for actual tables, debug layout only for structure visualization
const getLayout = () => borderedTableLayout;
const getDebugLayout = () => (DEBUG_MODE ? debugLayout : noBordersLayout);

function buildDocDefinition(
  quote: Quote,
  logoBase64: string
): TDocumentDefinitions {
  const groupedItems = groupItemsBySection(quote.lineItems, quote.sections);

  // Build line items table body with row numbers
  let rowNumber = 0;
  const tableBody: TableCell[][] = [
    // Header row - repeats on every page due to headerRows: 1
    [
      { text: "#", style: "tableHeader", alignment: "center" },
      { text: "Item", style: "tableHeader" },
      { text: "Description", style: "tableHeader" },
      { text: "Qty", style: "tableHeader", alignment: "center" },
      { text: "U/M", style: "tableHeader", alignment: "center" },
      { text: "Cost", style: "tableHeader", alignment: "left" },
      { text: "Total", style: "tableHeader", alignment: "right" },
    ],
  ];

  for (const group of groupedItems) {
    if (group.section !== null) {
      tableBody.push([
        {
          text: stripSectionNumber(group.section.name),
          colSpan: 7,
          style: "sectionHeader",
        },
        {},
        {},
        {},
        {},
        {},
        {},
      ]);
    }

    for (const item of group.items) {
      rowNumber++;
      const isStruck = item.isStruck === true;
      const cellStyle = isStruck ? "struckCell" : "tableCell";
      tableBody.push([
        {
          text: String(rowNumber),
          style: cellStyle,
          alignment: "center",
        },
        {
          text: item.item,
          style: cellStyle,
          decoration: isStruck ? "lineThrough" : undefined,
        },
        {
          text: item.description,
          style: cellStyle,
          decoration: isStruck ? "lineThrough" : undefined,
        },
        {
          text: String(item.qty),
          style: cellStyle,
          alignment: "center",
          decoration: isStruck ? "lineThrough" : undefined,
        },
        {
          text: item.uom,
          style: cellStyle,
          alignment: "center",
          decoration: isStruck ? "lineThrough" : undefined,
        },
        {
          text: formatCurrency(item.cost),
          style: cellStyle,
          alignment: "left",
          decoration: isStruck ? "lineThrough" : undefined,
        },
        {
          text: formatCurrency(item.total),
          style: cellStyle,
          alignment: "right",
          decoration: isStruck ? "lineThrough" : undefined,
        },
      ]);
    }

    if (group.section?.showSubtotal === true) {
      // Only count non-struck items in subtotal
      const subtotal = group.items
        .filter((item) => !item.isStruck)
        .reduce((sum, item) => sum + item.total, 0);
      tableBody.push([
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
      ]);
    }
  }

  return {
    pageSize: "LETTER",
    pageMargins: [40, 175, 40, 195], // Header with info boxes, footer with pricing/signature

    // Header repeats on every page - includes logo, estimator table, Bill To, Job Info
    header: (): Content => ({
      margin: [40, 15, 40, 0],
      stack: [
        // Row 1: Logo + Title + Estimator table (wrapped in debug table)
        {
          table: {
            widths: [240, "*", "auto"],
            body: [
              [
                {
                  image: logoBase64,
                  fit: [240, 60],
                },
                {
                  text: "",
                },
                {
                  stack: [
                    {
                      text: "Services Estimate",
                      style: "title",
                      alignment: "right",
                    },
                    {
                      margin: [0, 5, 0, 0],
                      table: {
                        widths: [75, 75, 75],
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
                      layout: getLayout(),
                    },
                  ],
                },
              ],
            ],
          },
          layout: getDebugLayout(),
        },
        // Row 2: Bill To + Job Information (wrapped in debug table)
        {
          margin: [0, 10, 0, 0],
          table: {
            widths: ["*", "*"],
            body: [
              [
                // Bill To box
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
                          stack: [
                            {
                              text: quote.billTo.companyName,
                              fontSize: 9,
                              lineHeight: 1.3,
                            },
                            {
                              text: quote.billTo.address,
                              fontSize: 9,
                              lineHeight: 1.3,
                            },
                          ],
                          margin: [4, 4, 4, 4],
                        },
                      ],
                    ],
                  },
                  layout: getLayout(),
                  margin: [0, 0, 2, 0],
                },
                // Job Information box
                {
                  table: {
                    widths: ["*"],
                    body: [
                      [
                        {
                          text: "Job Information:",
                          bold: true,
                          fontSize: 9,
                          fillColor: "#f0f0f0",
                          margin: [4, 4, 4, 4],
                        },
                      ],
                      [
                        {
                          stack: [
                            {
                              text: toTitleCase(quote.jobInfo.siteName),
                              fontSize: 9,
                              lineHeight: 1.3,
                            },
                            {
                              text: quote.jobInfo.address,
                              fontSize: 9,
                              lineHeight: 1.3,
                            },
                          ],
                          margin: [4, 4, 4, 4],
                        },
                      ],
                    ],
                  },
                  layout: getLayout(),
                  margin: [2, 0, 0, 0],
                },
              ],
            ],
          },
          layout: getDebugLayout(),
        },
      ],
    }),

    // Footer repeats on every page - includes pricing box, signature, company info
    footer: (currentPage, pageCount): Content => ({
      margin: [40, 0, 40, 10],
      stack: [
        // Pricing box (wrapped in debug table)
        {
          table: {
            widths: ["*"],
            body: [
              [
                {
                  table: {
                    widths: ["65%", "35%"],
                    body: [
                      [
                        // Left side - disclaimer text (spans full height via rowSpan)
                        {
                          stack: [
                            {
                              text: "Pricing based on specified quantities, and this is an ESTIMATE ONLY. Actual quantities will be billed.",
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
                          margin: [4, 4, 4, 4],
                          rowSpan: 2,
                        },
                        // Right top - Total (amount only shown on last page)
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
                              color:
                                currentPage === pageCount ? "#000" : "#666",
                            },
                          ],
                          margin: [4, 4, 4, 4],
                        },
                      ],
                      [
                        // Empty cell (rowSpan from above)
                        {},
                        // Right bottom - Addenda text
                        {
                          text: "ALL ADDENDA HAVE BEEN RECEIVED AND ACKNOWLEDGED",
                          fontSize: 7,
                          bold: true,
                          alignment: "center",
                          margin: [4, 4, 4, 4],
                        },
                      ],
                    ],
                  },
                  layout: getLayout(),
                },
              ],
            ],
          },
          layout: getDebugLayout(),
        },
        // Signature section (wrapped in debug table)
        {
          table: {
            widths: ["*"],
            body: [
              [
                {
                  text: "By signing this estimate I am authorizing Desert Services LLC to proceed with the work indicated above.",
                  fontSize: 9,
                  margin: [0, 2, 0, 2],
                },
              ],
              [
                {
                  columns: [
                    {
                      text: "Print Name: _______________________________",
                      fontSize: 9,
                    },
                    {
                      text: "Signature: _______________________________",
                      fontSize: 9,
                    },
                  ],
                },
              ],
            ],
          },
          layout: getDebugLayout(),
          margin: [0, 6, 0, 6],
        },
        // Company footer (wrapped in debug table)
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
                      text: "Phone: 480-513-8986",
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
          layout: getDebugLayout(),
        },
        // Page number
        {
          text: `Page ${currentPage} of ${pageCount}`,
          alignment: "center",
          fontSize: 9,
          color: "#666",
          margin: [0, 4, 0, 0],
        },
      ],
    }),

    content: [
      // Line items table only - headerRows: 1 makes header repeat on every page
      {
        table: {
          headerRows: 1,
          dontBreakRows: true, // Prevents rows from splitting across pages
          widths: ["5%", "22%", "30%", "6%", "12%", "12%", "13%"],
          body: tableBody,
        },
        layout: {
          ...getLayout(),
          fillColor: (rowIndex: number) => {
            if (rowIndex === 0) {
              return "#f0f0f0";
            }
            return null;
          },
        },
      },
    ],

    styles: {
      title: {
        fontSize: 20,
        bold: true,
      },
      tableHeader: {
        fontSize: 9,
        bold: true,
        margin: [2, 2, 2, 2],
      },
      tableCell: {
        fontSize: 9,
        margin: [2, 2, 2, 2],
      },
      struckCell: {
        fontSize: 9,
        margin: [2, 2, 2, 2],
        color: "#888888",
      },
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

export async function generateEstimatePDF(quote: Quote): Promise<void> {
  const logoBase64 = await getLogoBase64();
  const docDefinition = buildDocDefinition(quote, logoBase64);
  pdfMake.createPdf(docDefinition).open();
}

export async function generateEstimatePDFBlob(quote: Quote): Promise<Blob> {
  const logoBase64 = await getLogoBase64();
  const docDefinition = buildDocDefinition(quote, logoBase64);

  return new Promise((resolve) => {
    pdfMake.createPdf(docDefinition).getBlob((blob) => {
      resolve(blob);
    });
  });
}
