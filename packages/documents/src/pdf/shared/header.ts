// Standard Desert Services PDF header builder
// Logo left, title right — shared across all company documents

import type { Content } from "pdfmake/interfaces";
import { COLORS } from "./brand";
import { FONT_TITLE } from "./fonts";
import { noPaddingLayout } from "./layouts";

export interface HeaderOptions {
  /** Document title (e.g., "Services Estimate", "MyDEQ NOI Simple Guide") */
  title: string;
  /** Logo as base64 data URI */
  logoBase64: string;
  /** Logo fit dimensions [width, height]. Default: [220, 54] */
  logoFit?: [number, number];
  /** Optional subtitle below title (renders italic, gray) */
  subtitle?: string;
  /** Optional date line below subtitle (renders small, gray) */
  date?: string;
  /** Title font size. Default: 18 */
  titleFontSize?: number;
  /** Title color. Default: COLORS.foreground */
  titleColor?: string;
  /** Bottom margin below header block. Default: 18 */
  marginBottom?: number;
}

/**
 * Build a content-level header block (logo left, title right).
 * For use in the document content array (NOI guides, general docs).
 *
 * The estimate PDF uses a pdfmake header callback with fixed positioning,
 * so it imports brand/font constants directly rather than using this builder.
 */
export function buildHeader(options: HeaderOptions): Content {
  const {
    title,
    logoBase64,
    logoFit = [220, 54],
    subtitle,
    date,
    titleFontSize = 18,
    titleColor = COLORS.foreground,
    marginBottom = 18,
  } = options;

  const rightStack: Content[] = [
    {
      text: title,
      font: FONT_TITLE,
      fontSize: titleFontSize,
      bold: true,
      color: titleColor,
      alignment: "right" as const,
    },
  ];

  if (subtitle) {
    rightStack.push({
      text: subtitle,
      fontSize: 10,
      italics: true,
      color: COLORS.mutedForeground,
      alignment: "right" as const,
      margin: [0, 2, 0, 3],
    });
  }

  if (date) {
    rightStack.push({
      text: date,
      fontSize: 8,
      color: COLORS.mutedForeground,
      alignment: "right" as const,
    });
  }

  return {
    margin: [0, 0, 0, marginBottom],
    table: {
      widths: ["auto", "*"],
      body: [
        [
          { image: logoBase64, fit: logoFit, margin: [0, 0, 0, 0] },
          {
            stack: rightStack,
            alignment: "right" as const,
          },
        ],
      ],
    },
    layout: noPaddingLayout,
  };
}
