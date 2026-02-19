import type {
  Content,
  ContentTable,
  TableCell,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import { COLORS, COMPANY, FONT_BODY } from "../shared/brand";
import { borderedLayout } from "../shared/layouts";
import type { InternalContactSheetDocument } from "./types";

export function buildInternalContactSheetDocDefinition(
  doc: InternalContactSheetDocument,
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

  const cellMargin: [number, number, number, number] = [6, 6, 6, 6];
  const headerRow: TableCell[] = [
    { text: "Role", bold: true, margin: cellMargin },
    { text: "Contact", bold: true, margin: cellMargin },
    { text: "Phone", bold: true, margin: cellMargin },
    { text: "Notes", bold: true, margin: cellMargin },
  ];

  const rows: TableCell[][] = doc.contacts.map((c) => [
    { text: c.role, margin: cellMargin },
    {
      stack: [
        { text: c.name, margin: [0, 0, 0, 2] },
        ...(c.email
          ? ([
              {
                text: c.email,
                fontSize: 9,
                color: COLORS.mutedForeground,
              } as Content,
            ] satisfies Content[])
          : ([] satisfies Content[])),
      ],
      margin: cellMargin,
    },
    { text: c.phone ?? "", margin: cellMargin },
    { text: c.notes ?? "", margin: cellMargin },
  ]);

  const table: ContentTable = {
    table: {
      headerRows: 1,
      widths: [120, 170, 110, "*"],
      body: [headerRow, ...rows],
    },
    layout: borderedLayout,
    fontSize: 10,
  };

  const content: Content[] = [
    {
      image: logoBase64,
      fit: [300, 90],
      alignment: "left",
      margin: [0, 0, 0, 12],
    },
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
            fontSize: 10,
            color: COLORS.mutedForeground,
            margin: [0, 0, 0, 2],
          } as Content,
        ] satisfies Content[])
      : ([] satisfies Content[])),
    {
      text: [{ text: "Updated: ", bold: true }, { text: doc.updated }],
      margin: [0, 0, 0, 10],
      fontSize: 10,
    },
    table,
  ];

  return {
    pageSize: "LETTER",
    pageMargins: [CONTENT_MARGIN_X, 72, CONTENT_MARGIN_X, 90],
    defaultStyle: {
      fontSize: 9.5,
      color: COLORS.foreground,
      font: FONT_BODY,
    },
    content,
    background: {
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
          y1: FOOTER_SEP_Y,
          x2: PAGE_W - BORDER_INSET - FOOTER_LINE_INSET_FROM_BORDER,
          y2: FOOTER_SEP_Y,
          lineWidth: 1,
          lineColor: "#D9D9D9",
        },
      ],
    },
    footer: {
      columns: [
        {
          text: `${COMPANY.name} | ${COMPANY.phoneCompact}`,
          alignment: "left",
          fontSize: 9,
          color: COLORS.mutedForeground,
          margin: [CONTENT_MARGIN_X, 0, 0, 0],
        },
        {
          text: `www.${COMPANY.website}`,
          alignment: "right",
          fontSize: 9,
          color: COLORS.mutedForeground,
          margin: [0, 0, CONTENT_MARGIN_X, 0],
        },
      ],
    },
  };
}
