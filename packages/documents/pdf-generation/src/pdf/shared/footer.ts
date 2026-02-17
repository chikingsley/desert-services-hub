// Standard Desert Services PDF footer builder
// Company info left, optional center text, page numbers right

import type { Content } from "pdfmake/interfaces";
import { COLORS, COMPANY } from "./brand";

export interface FooterOptions {
  /** Left-side text. Default: "Desert Services LLC | (480) 513-8986 | desertservices.net" */
  leftText?: string;
  /** Center text (e.g., "Desert Services 2026"). Default: none */
  centerText?: string;
  /** Show page numbers on right. Default: true */
  showPageNumbers?: boolean;
  /** Font size. Default: 8 */
  fontSize?: number;
  /** Text color. Default: COLORS.mutedForeground */
  color?: string;
  /** Left/right margin (should match page margins). Default: 50 */
  horizontalMargin?: number;
}

const DEFAULT_LEFT_TEXT = `${COMPANY.phone}  \u00B7  ${COMPANY.website}`;

/**
 * Build a standard footer callback for pdfmake documents.
 * Returns a function compatible with TDocumentDefinitions.footer.
 *
 * Layout: left (company info) | center (optional) | right (page X of Y)
 *
 * The estimate PDF has a specialized multi-section footer
 * (disclaimer, total, signature, contact bar) and builds its own.
 */
export function buildFooter(
  options?: FooterOptions
): (currentPage: number, pageCount: number) => Content {
  const {
    leftText = DEFAULT_LEFT_TEXT,
    centerText,
    showPageNumbers = true,
    fontSize = 8,
    color = COLORS.mutedForeground,
    horizontalMargin = 50,
  } = options ?? {};

  return (currentPage: number, pageCount: number): Content => {
    const columns: Content[] = [
      {
        text: leftText,
        fontSize,
        color,
        alignment: "left" as const,
      },
    ];

    if (centerText) {
      columns.push({
        text: centerText,
        fontSize,
        color,
        alignment: "center" as const,
      });
    }

    if (showPageNumbers) {
      columns.push({
        text: `Page ${currentPage} of ${pageCount}`,
        fontSize,
        color,
        alignment: "right" as const,
      });
    }

    return {
      margin: [horizontalMargin, 0, horizontalMargin, 0],
      columns,
    };
  };
}
