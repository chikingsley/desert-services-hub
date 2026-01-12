// Client-side PDF generation for Desert Services estimates
// Uses pdfmake browser build for live preview in iframe

import { createPdf, vfs } from "pdfmake/build/pdfmake";
import { vfs as pdfFonts } from "pdfmake/build/vfs_fonts";
import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import type { PDFLineItem, PDFQuote, PDFQuoteSection } from "./types";

// Initialize pdfmake with virtual file system fonts
// Copy font data from vfs_fonts into pdfmake's vfs
for (const [key, value] of Object.entries(pdfFonts)) {
  vfs[key] = value;
}

// Cache logo base64 to avoid repeated fetches
let logoCache: string | null = null;

async function getLogoBase64(): Promise<string> {
  if (logoCache) {
    return logoCache;
  }

  const response = await fetch("/logo.png");
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      logoCache = reader.result as string;
      resolve(logoCache);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
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

const STRIP_SECTION_NUMBER_REGEX = /^\d+\.\s*/;

function stripSectionNumber(str: string): string {
  return str.replace(STRIP_SECTION_NUMBER_REGEX, "");
}

// Table layouts
const borderedLayout = {
  hLineWidth: () => 1,
  vLineWidth: () => 1,
  hLineColor: () => "#000",
  vLineColor: () => "#000",
};
const noBordersLayout = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
};

interface GroupedItems {
  section: PDFQuoteSection | null;
  items: PDFLineItem[];
}

function groupItemsBySection(
  items: PDFLineItem[],
  sections: PDFQuoteSection[]
): GroupedItems[] {
  const groups: GroupedItems[] = [];

  // Collect unsectioned items first
  const unsectioned: PDFLineItem[] = [];
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
    const sectionItems: PDFLineItem[] = [];
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
function calculateGroupSubtotal(items: PDFLineItem[]): number {
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
    { text: "Cost", style: "tableHeader", alignment: "left" },
    { text: "Total", style: "tableHeader", alignment: "right" },
  ];
}

// Build section header row
function buildSectionRow(sectionName: string): TableCell[] {
  return [
    {
      text: stripSectionNumber(sectionName),
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
function buildItemRow(rowNumber: number, item: PDFLineItem): TableCell[] {
  return [
    { text: String(rowNumber), style: "tableCell", alignment: "center" },
    { text: item.item, style: "tableCell" },
    { text: item.description, style: "tableCell" },
    { text: String(item.qty), style: "tableCell", alignment: "center" },
    { text: item.uom, style: "tableCell", alignment: "center" },
    { text: formatCurrency(item.cost), style: "tableCell", alignment: "left" },
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

// Build the complete table body from grouped items
function buildTableBody(groupedItems: GroupedItems[]): TableCell[][] {
  const tableBody: TableCell[][] = [buildTableHeader()];
  let rowNumber = 0;

  for (const group of groupedItems) {
    if (group.section !== null) {
      tableBody.push(buildSectionRow(group.section.name));
    }

    for (const item of group.items) {
      rowNumber += 1;
      tableBody.push(buildItemRow(rowNumber, item));
    }

    if (group.section?.showSubtotal) {
      const subtotal = calculateGroupSubtotal(group.items);
      tableBody.push(buildSubtotalRow(subtotal));
    }
  }

  return tableBody;
}

function buildDocDefinition(
  quote: PDFQuote,
  logoBase64: string
): TDocumentDefinitions {
  const groupedItems = groupItemsBySection(quote.lineItems, quote.sections);
  const tableBody = buildTableBody(groupedItems);

  return {
    pageSize: "LETTER",
    pageMargins: [40, 195, 40, 195],
    defaultStyle: {
      font: "Roboto",
    },

    header: (): Content => ({
      margin: [40, 50, 40, 0],
      stack: [
        {
          table: {
            widths: [240, "*", "auto"],
            body: [
              [
                { image: logoBase64, fit: [240, 60] },
                { text: "" },
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
                      layout: borderedLayout,
                    },
                  ],
                },
              ],
            ],
          },
          layout: noBordersLayout,
        },
        // 2-box layout: Bill To + Job Info with gap
        {
          margin: [0, 5, 0, 0],
          table: {
            widths: ["*", 15, "*"],
            body: [
              [
                {
                  text: "Bill To:",
                  bold: true,
                  fontSize: 9,
                  fillColor: "#f0f0f0",
                  margin: [4, 4, 4, 4],
                  border: [true, true, true, true],
                },
                { text: "", border: [false, false, false, false] },
                {
                  text: "Job Info:",
                  bold: true,
                  fontSize: 9,
                  fillColor: "#f0f0f0",
                  margin: [4, 4, 4, 4],
                  border: [true, true, true, true],
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
                  border: [true, true, true, true],
                },
                { text: "", border: [false, false, false, false] },
                {
                  text: [
                    { text: `${quote.project.name}\n`, bold: true },
                    {
                      text: `${quote.siteAddress.line1}\n${quote.siteAddress.line2 ?? ""}`,
                    },
                  ],
                  fontSize: 9,
                  margin: [4, 4, 4, 4],
                  border: [true, true, true, true],
                },
              ],
            ],
          },
          layout: borderedLayout,
        },
      ],
    }),

    footer: (currentPage, pageCount): Content => ({
      margin: [40, 0, 40, 10],
      stack: [
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
                          margin: [4, 4, 4, 4],
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
                              color:
                                currentPage === pageCount ? "#000" : "#666",
                            },
                          ],
                          margin: [4, 4, 4, 4],
                        },
                      ],
                      [
                        {},
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
                  layout: borderedLayout,
                },
              ],
            ],
          },
          layout: noBordersLayout,
        },
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

    content: [
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: [18, "auto", "*", "auto", "auto", "auto", "auto"],
          body: tableBody,
        },
        layout: {
          ...borderedLayout,
          fillColor: (rowIndex: number) => (rowIndex === 0 ? "#f0f0f0" : null),
        },
      },
    ],

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

/**
 * Generate PDF as Blob (for client-side preview in iframe)
 */
export async function generatePDFBlob(quote: PDFQuote): Promise<Blob> {
  const logoBase64 = await getLogoBase64();
  const docDefinition = buildDocDefinition(quote, logoBase64);

  return new Promise((resolve, reject) => {
    try {
      createPdf(docDefinition).getBlob((blob) => {
        resolve(blob);
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Open PDF in new tab
 */
export async function openPDF(quote: PDFQuote): Promise<void> {
  const logoBase64 = await getLogoBase64();
  const docDefinition = buildDocDefinition(quote, logoBase64);
  createPdf(docDefinition).open();
}
