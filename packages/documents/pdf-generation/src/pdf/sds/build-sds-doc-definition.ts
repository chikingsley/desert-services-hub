import type {
  Content,
  ContentTable,
  TableCell,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import { COLORS, COMPANY, FONT_BODY } from "../shared/brand";
import { borderedLayout } from "../shared/layouts";
import type { SdsListDocument } from "./types";

function wrapUrlForCell(url: string, maxLen = 52): string {
  // Use zero-width spaces to create wrap opportunities without rendering visible spaces.
  const ZWSP = "\u200B";
  const hinted = url.replace(/([/%?&=_-])/g, `$1${ZWSP}`);

  // Guard against very long unbroken tokens by injecting additional soft breaks.
  const parts = hinted.split(ZWSP);
  const out: string[] = [];
  for (const part of parts) {
    if (part.length <= maxLen) {
      out.push(part);
      continue;
    }
    for (let i = 0; i < part.length; i += maxLen) {
      out.push(part.slice(i, i + maxLen));
    }
  }
  return out.join(ZWSP);
}

export function buildSdsDocDefinition(
  doc: SdsListDocument,
  logoBase64: string
): TDocumentDefinitions {
  const PAGE_W = 612;
  const PAGE_H = 792;
  const BORDER_INSET = 36;
  const CONTENT_INSET_FROM_BORDER = 36;
  const CONTENT_MARGIN_X = BORDER_INSET + CONTENT_INSET_FROM_BORDER;
  const FOOTER_SEP_OFFSET_FROM_BORDER_BOTTOM = 42;
  const FOOTER_SEP_Y =
    PAGE_H - BORDER_INSET - FOOTER_SEP_OFFSET_FROM_BORDER_BOTTOM;
  const FOOTER_LINE_INSET_FROM_BORDER = 36;
  const PAGE_NUMBER_GAP_FROM_LINE = 14;
  const COVER_FOOTER_SEP_Y = 686;
  const COVER_BAND_TOP_GAP = 18;
  const COVER_COMPANY_ADDRESS_LINE_1 = "800 North Mary Street,";
  const COVER_COMPANY_ADDRESS_LINE_2 = "Tempe, Arizona, 85822";

  const sorted = [...doc.entries].sort((a, b) => a.page - b.page);
  const cellMargin: [number, number, number, number] = [6, 4, 6, 4];
  const headerCellMargin: [number, number, number, number] = [6, 6, 6, 6];
  const tableHeaderRow: TableCell[] = [
    {
      text: "Trade Name",
      bold: true,
      alignment: "left",
      margin: headerCellMargin,
    },
    {
      text: "Supplier",
      bold: true,
      alignment: "left",
      margin: headerCellMargin,
    },
    {
      text: "Page",
      bold: true,
      alignment: "left",
      margin: headerCellMargin,
    },
    {
      text: "Link",
      bold: true,
      alignment: "left",
      margin: headerCellMargin,
    },
  ];
  const tableRows: TableCell[][] = sorted.map((e) => [
    { text: e.tradeName, alignment: "left", margin: cellMargin },
    { text: e.supplier, alignment: "left", margin: cellMargin },
    { text: String(e.page), alignment: "left", margin: cellMargin },
    {
      text: e.url ? wrapUrlForCell(e.url) : "",
      link: e.url,
      color: "#1F5AA6",
      alignment: "left",
      noWrap: false,
      fontSize: 8.5,
      lineHeight: 1.05,
      margin: cellMargin,
    },
  ]);
  const tableBody: TableCell[][] = [tableHeaderRow, ...tableRows];
  const inventoryTable: ContentTable = {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: ["auto", "auto", "auto", "*"],
      body: tableBody,
    },
    layout: borderedLayout,
    fontSize: 9.5,
  };

  const content: Content[] = [
    {
      stack: [
        {
          image: logoBase64,
          fit: [380, 110],
          alignment: "center",
          margin: [0, 34, 0, 0],
        },
        {
          absolutePosition: { x: CONTENT_MARGIN_X, y: FOOTER_SEP_Y - 170 },
          columns: [
            {
              width: PAGE_W - CONTENT_MARGIN_X * 2,
              alignment: "right",
              stack: [
                {
                  text: doc.title,
                  bold: true,
                  fontSize: 14,
                  margin: [0, 0, 0, 4],
                },
                ...(doc.subtitle
                  ? ([
                      {
                        text: doc.subtitle,
                        fontSize: 12,
                        margin: [0, 0, 0, 2],
                      } as Content,
                    ] satisfies Content[])
                  : ([] satisfies Content[])),
                {
                  text: [
                    { text: "Updated: ", bold: true },
                    { text: doc.updated },
                  ],
                  fontSize: 12,
                  margin: [0, 0, 0, 0],
                },
              ],
            },
          ],
        },
      ],
      pageBreak: "after",
    },
    {
      text: "Chemical Inventory",
      bold: true,
      fontSize: 12,
      margin: [0, 0, 0, 8],
    },
    {
      text: "All entries reference the current Safety Data Sheet inventory for Desert Services.",
      margin: [0, 0, 0, 10],
      lineHeight: 1.15,
    },
    inventoryTable,
  ];

  return {
    pageSize: "LETTER",
    pageMargins: [CONTENT_MARGIN_X, 146, CONTENT_MARGIN_X, 90],
    defaultStyle: {
      fontSize: 9.5,
      color: COLORS.foreground,
      font: FONT_BODY,
    },
    content,
    background: (currentPage: number) => {
      const sepY = currentPage === 1 ? COVER_FOOTER_SEP_Y : FOOTER_SEP_Y;
      const baseCanvas: Content = {
        canvas: [
          {
            type: "rect",
            x: BORDER_INSET,
            y: BORDER_INSET,
            w: PAGE_W - BORDER_INSET * 2,
            h: PAGE_H - BORDER_INSET * 2,
            lineWidth: 1,
            lineColor: "#000000",
          },
          {
            type: "line",
            x1: BORDER_INSET + FOOTER_LINE_INSET_FROM_BORDER,
            y1: sepY,
            x2: PAGE_W - BORDER_INSET - FOOTER_LINE_INSET_FROM_BORDER,
            y2: sepY,
            lineWidth: 1,
            lineColor: "#D9D9D9",
          },
        ],
      };

      if (currentPage !== 1) {
        return baseCanvas;
      }

      const coverBandTopY = COVER_FOOTER_SEP_Y + COVER_BAND_TOP_GAP;
      const coverBandTable: Content = {
        absolutePosition: { x: CONTENT_MARGIN_X, y: coverBandTopY },
        table: {
          widths: [260, 38, 154],
          body: [
            [
              {
                stack: [
                  {
                    text: "Desert Services LLC",
                    bold: true,
                    fontSize: 10,
                    margin: [0, 0, 0, 2],
                  },
                  { text: COVER_COMPANY_ADDRESS_LINE_1, fontSize: 10 },
                  { text: COVER_COMPANY_ADDRESS_LINE_2, fontSize: 10 },
                ],
                border: [false, false, false, false],
              },
              { text: "", border: [false, false, false, false] },
              {
                stack: [
                  {
                    text: `Phone: ${COMPANY.phone}`,
                    alignment: "right",
                    fontSize: 10,
                  },
                  {
                    text: `ROC: ${COMPANY.roc}`,
                    alignment: "right",
                    fontSize: 10,
                  },
                  {
                    text: `www.${COMPANY.website}`,
                    alignment: "right",
                    fontSize: 10,
                  },
                ],
                border: [false, false, false, false],
              },
            ],
          ],
        },
        layout: "noBorders",
      };
      return [baseCanvas, coverBandTable];
    },
    header: (currentPage: number) => {
      if (currentPage === 1) {
        return { text: "" };
      }
      return {
        columns: [{ image: logoBase64, fit: [210, 60] }],
        margin: [
          CONTENT_MARGIN_X,
          BORDER_INSET + CONTENT_INSET_FROM_BORDER,
          CONTENT_MARGIN_X,
          0,
        ],
      };
    },
    footer: (currentPage: number) => {
      if (currentPage === 1) {
        return { text: "" };
      }
      const n = currentPage - 1;
      return {
        columns: [
          { text: "" },
          {
            text: [
              { text: `${n} | `, color: "#8A8A8A" },
              { text: "P a g e", color: "#C7C7C7" },
            ],
            alignment: "right" as const,
            fontSize: 11,
          },
        ],
        margin: [
          CONTENT_MARGIN_X,
          PAGE_NUMBER_GAP_FROM_LINE,
          CONTENT_MARGIN_X,
          BORDER_INSET - 6,
        ],
      };
    },
  };
}
