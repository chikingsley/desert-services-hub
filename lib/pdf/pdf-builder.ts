// Shared PDF building logic for Desert Services estimates
// Used by both server (generate-pdf.ts) and client (generate-client.ts)

import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import type { EditorLineItem, EditorQuote, EditorSection } from "@/lib/types";

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
  section: EditorSection | null;
  items: EditorLineItem[];
}

function groupItemsBySection(
  items: EditorLineItem[],
  sections: EditorSection[]
): GroupedItems[] {
  const groups: GroupedItems[] = [];

  // Unsectioned items first
  const unsectioned = items.filter((item) => !item.sectionId);
  if (unsectioned.length > 0) {
    groups.push({ section: null, items: unsectioned });
  }

  // Group by section
  for (const section of sections) {
    const sectionItems = items.filter((item) => item.sectionId === section.id);
    if (sectionItems.length > 0) {
      groups.push({ section, items: sectionItems });
    }
  }

  return groups;
}

function buildTableHeader(): TableCell[] {
  return [
    { text: "#", style: "tableHeader", alignment: "center" },
    { text: "Item", style: "tableHeader" },
    { text: "Description", style: "tableHeader" },
    { text: "Qty", style: "tableHeader", alignment: "center" },
    { text: "U/M", style: "tableHeader", alignment: "center", noWrap: true },
    { text: "Cost", style: "tableHeader", alignment: "left" },
    { text: "Total", style: "tableHeader", alignment: "left" },
  ];
}

function buildSectionRow(section: EditorSection): TableCell[] {
  // Use title if set, otherwise fall back to name
  const displayName = section.title ?? section.name;
  return [
    {
      text: stripSectionNumber(displayName),
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

function buildSubtotalRow(subtotal: number): TableCell[] {
  return [
    { text: "", colSpan: 5, style: "tableCell" },
    {},
    {},
    {},
    {},
    { text: "Subtotal:", style: "subtotalCell", alignment: "right" as const },
    {
      text: formatCurrency(subtotal),
      style: "subtotalCell",
      alignment: "right" as const,
    },
  ];
}

function calculateGroupSubtotal(items: EditorLineItem[]): number {
  let total = 0;
  for (const item of items) {
    if (!item.isStruck) {
      total += item.total;
    }
  }
  return total;
}

function buildItemRow(rowNumber: number, item: EditorLineItem): TableCell[] {
  return [
    { text: String(rowNumber), style: "tableCell", alignment: "center" },
    { text: item.item, style: "tableCell" },
    { text: item.description, style: "tableCell" },
    { text: String(item.qty), style: "tableCell", alignment: "center" },
    { text: item.uom, style: "tableCell", alignment: "center", noWrap: true },
    { text: formatCurrency(item.cost), style: "tableCell", alignment: "left" },
    {
      text: formatCurrency(item.total),
      style: "tableCell",
      alignment: "left",
    },
  ];
}

function buildTableBody(groupedItems: GroupedItems[]): TableCell[][] {
  const tableBody: TableCell[][] = [buildTableHeader()];
  let rowNumber = 0;

  for (const group of groupedItems) {
    if (group.section !== null) {
      tableBody.push(buildSectionRow(group.section));
    }

    for (const item of group.items) {
      rowNumber += 1;
      tableBody.push(buildItemRow(rowNumber, item));
    }

    // Add subtotal if section has showSubtotal enabled
    if (group.section?.showSubtotal) {
      const subtotal = calculateGroupSubtotal(group.items);
      tableBody.push(buildSubtotalRow(subtotal));
    }
  }

  return tableBody;
}

// Build flat table without sections (simple style)
function buildSimpleTableBody(items: EditorLineItem[]): TableCell[][] {
  const tableBody: TableCell[][] = [buildTableHeader()];
  let rowNumber = 0;

  for (const item of items) {
    rowNumber += 1;
    tableBody.push(buildItemRow(rowNumber, item));
  }

  return tableBody;
}

export interface GeneratePDFOptions {
  /** "simple" = flat line items, "sectioned" = grouped with headers (default) */
  style?: "simple" | "sectioned";
}

export function buildDocDefinition(
  quote: EditorQuote,
  logoBase64: string,
  options?: GeneratePDFOptions
): TDocumentDefinitions {
  // Filter out struck items - they shouldn't appear on the PDF
  const visibleItems = quote.lineItems.filter((item) => !item.isStruck);

  // Build table based on style option
  const style = options?.style ?? "sectioned";
  const tableBody =
    style === "simple"
      ? buildSimpleTableBody(visibleItems)
      : buildTableBody(groupItemsBySection(visibleItems, quote.sections));

  return {
    pageSize: "LETTER",
    pageMargins: [40, 195, 40, 195],
    defaultStyle: {
      font: "Times",
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
                              text: quote.estimator || "Desert Services",
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
        // Bill To + Job Info boxes
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
                  text: "Job Information:",
                  bold: true,
                  fontSize: 9,
                  fillColor: "#f0f0f0",
                  margin: [4, 4, 4, 4],
                  border: [true, true, true, true],
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
                  border: [true, true, true, true],
                },
                { text: "", border: [false, false, false, false] },
                {
                  stack: [
                    {
                      text: quote.jobInfo.siteName,
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
                      text: `Email: ${quote.estimatorEmail || "info@desertservices.net"}`,
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
          widths: ["auto", "*", "*", "auto", "auto", "auto", "auto"],
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
