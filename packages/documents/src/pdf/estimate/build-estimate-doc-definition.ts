// Estimate-specific PDF document definition builders
// Used by both server and client estimate PDF generators

import type { EditorEstimate } from "@lib/db/types";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { COMPANY, FONT_TITLE } from "../shared/brand";
import { borderedLayout, noPaddingLayout } from "../shared/layouts";
import { buildEstimateBackPageContent } from "./estimate-back-page";
import {
  buildEstimateLineItemTables,
  type EstimateLineItemTableOptions,
} from "./estimate-line-item-tables";

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

export interface EstimatePDFOptions {
  includeBackPage?: boolean;
  style?: "simple" | "sectioned";
  unbreakableSections?: boolean;
}

function buildLineItemContent(
  estimate: EditorEstimate,
  options: EstimatePDFOptions | undefined
): Content[] {
  const visibleItems = estimate.lineItems;
  if (visibleItems.length === 0) {
    return [
      {
        text: "No line items",
        italics: true,
        color: "#999",
        alignment: "center" as const,
        margin: [0, 20, 0, 0] as [number, number, number, number],
      } as Content,
    ];
  }

  const tableOptions: EstimateLineItemTableOptions = {
    style: options?.style ?? "sectioned",
    unbreakableSections: options?.unbreakableSections ?? true,
  };

  return buildEstimateLineItemTables(
    visibleItems,
    estimate.sections,
    tableOptions
  );
}

export function buildEstimateDocDefinition(
  estimate: EditorEstimate,
  logoBase64: string,
  options?: EstimatePDFOptions
): TDocumentDefinitions {
  const contentTables = buildLineItemContent(estimate, options);

  return {
    pageSize: "LETTER",
    pageMargins: [40, 168, 40, 185],

    header: (): Content => ({
      margin: [40, 36, 40, 0],
      table: {
        widths: ["*", 20, "*"],
        body: [
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
                        { text: formatAddress(estimate.billTo.address) },
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
                      text: `Phone: ${estimate.estimatorPhone || COMPANY.phoneCompact}`,
                      alignment: "center",
                      color: "#fff",
                      fontSize: 9,
                    },
                    {
                      text: `Email: ${estimate.estimatorEmail || COMPANY.email}`,
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
              i === 1 ? 0.5 : 0,
            vLineWidth: (i: number) => (i === 1 ? 0.5 : 0),
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

export function buildEstimateBackPageDocDefinition(
  logoBase64: string
): TDocumentDefinitions {
  return {
    pageSize: "LETTER",
    pageMargins: [40, 40, 40, 40],
    content: buildEstimateBackPageContent(logoBase64),
  };
}
