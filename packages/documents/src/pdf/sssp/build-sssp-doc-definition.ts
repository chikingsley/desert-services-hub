import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { COLORS, COMPANY, FONT_BODY } from "../shared/brand";
import { buildSsspPrimaryBodyContent } from "./sssp-body-primary";
import { buildSsspSecondaryBodyContent } from "./sssp-body-secondary";
import {
  normalizeExplicitSections,
  resolveSectionVisibility,
  type SsspBodyContext,
  scopeBlobForHeuristics,
  scopeItemsOrFallback,
} from "./sssp-content-helpers";
import type { SsspDocument } from "./types";

const YYYY_MM_DD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function formatCoverDateUpper(dateStr: string | undefined): string {
  const raw = (dateStr ?? "").trim();
  if (!raw) {
    return "";
  }

  const match = raw.match(YYYY_MM_DD_RE);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(raw);
  if (!Number.isFinite(date.getTime())) {
    return raw.toUpperCase();
  }

  const month = MONTHS[date.getMonth()] ?? "";
  return `${month} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatCoverAddress(address: string): string {
  const normalized = address.trim();
  if (!normalized) {
    return "";
  }
  return normalized
    .replace(/\s*;\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSsspDocDefinition(
  doc: SsspDocument,
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
  const COVER_FOOTER_SEP_Y = 686;
  const FOOTER_LINE_INSET_FROM_BORDER = 36;
  const PAGE_NUMBER_GAP_FROM_LINE = 14;
  const LIST_INDENT = 14;
  const COVER_COMPANY_ADDRESS_LINE_1 = "800 North Mary Street,";
  const COVER_COMPANY_ADDRESS_LINE_2 = "Tempe, Arizona, 85822";

  const gcName = (doc.gcName ?? "").trim() || "the General Contractor";
  const partnerName = gcName;
  const projectName = (doc.projectName ?? "").trim();
  const jobNumber = (doc.jobNumber ?? "").trim();

  const coverDate = formatCoverDateUpper(doc.date);
  const coverAddress = formatCoverAddress(doc.projectAddress);

  const scopeItems = scopeItemsOrFallback(doc);
  const scopeBlob = scopeBlobForHeuristics(scopeItems);
  const explicitSections = normalizeExplicitSections(doc.sections);

  const includesWaterTruck = explicitSections
    ? explicitSections.has("water-truck")
    : resolveSectionVisibility(
        doc.includeWaterTruckSection,
        scopeBlob.includes("water truck")
      );
  const includesStreetSweeping = explicitSections
    ? explicitSections.has("street-sweeping")
    : resolveSectionVisibility(
        doc.includeStreetSweepingSection,
        scopeBlob.includes("street sweeping") ||
          (scopeBlob.includes("sweep") && !scopeBlob.includes("swept"))
      );
  const includesPortableSanitation = explicitSections
    ? explicitSections.has("portable-sanitation")
    : resolveSectionVisibility(
        doc.includePortableSanitationSection,
        scopeBlob.includes("portable") ||
          scopeBlob.includes("sanitation") ||
          scopeBlob.includes("toilet")
      );

  const bodyContext: SsspBodyContext = {
    doc,
    gcName,
    includesPortableSanitation,
    includesStreetSweeping,
    includesWaterTruck,
    listIndent: LIST_INDENT,
    partnerName,
    scopeItems,
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
          absolutePosition: { x: CONTENT_MARGIN_X, y: FOOTER_SEP_Y - 72 - 96 },
          columns: [
            {
              width: PAGE_W - CONTENT_MARGIN_X * 2,
              alignment: "right",
              stack: [
                {
                  text: "Site Specific Safety Plan",
                  bold: true,
                  fontSize: 14,
                  margin: [0, 0, 0, 4],
                },
                {
                  text: [
                    { text: "Project: ", bold: true },
                    { text: projectName },
                  ],
                  fontSize: 12,
                  margin: [0, 0, 0, 2],
                },
                {
                  text: [
                    { text: "Contractor: ", bold: true },
                    { text: (doc.gcName ?? "").trim() },
                  ],
                  fontSize: 12,
                  margin: [0, 0, 0, 2],
                },
                ...(coverDate
                  ? [
                      {
                        text: [
                          { text: "Date: ", bold: true },
                          { text: coverDate },
                        ],
                        fontSize: 12,
                        margin: [0, 0, 0, 2],
                      } as Content,
                    ]
                  : []),
                {
                  text: [
                    { text: "Address: ", bold: true },
                    { text: coverAddress },
                  ],
                  fontSize: 12,
                  margin: [0, 0, 0, 2],
                },
                ...(jobNumber
                  ? [
                      {
                        text: [
                          { text: "Job Number: ", bold: true },
                          { text: jobNumber },
                        ],
                        fontSize: 12,
                        margin: [0, 0, 0, 0],
                      } as Content,
                    ]
                  : []),
              ],
            },
          ],
        },
      ],
      pageBreak: "after",
    },
    ...buildSsspPrimaryBodyContent(bodyContext),
    ...buildSsspSecondaryBodyContent(bodyContext),
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
      const separatorY = currentPage === 1 ? COVER_FOOTER_SEP_Y : FOOTER_SEP_Y;
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
            y1: separatorY,
            x2: PAGE_W - BORDER_INSET - FOOTER_LINE_INSET_FROM_BORDER,
            y2: separatorY,
            lineWidth: 1,
            lineColor: "#D9D9D9",
          },
        ],
      };

      if (currentPage !== 1) {
        return baseCanvas;
      }

      const coverBandTopGap = 18;
      const coverBandTopY = COVER_FOOTER_SEP_Y + coverBandTopGap;
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
        columns: [
          {
            image: logoBase64,
            fit: [210, 60],
          },
        ],
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
      const number = currentPage - 1;
      return {
        columns: [
          { text: "" },
          {
            text: [
              { text: `${number} | `, color: "#8A8A8A" },
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
