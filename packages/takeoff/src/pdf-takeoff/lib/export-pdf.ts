import { PDFDocument, type PDFFont, StandardFonts } from "pdf-lib";
import type { ScaledPosition, ShapeData } from "../types";
import {
  renderAreaHighlight,
  renderFreetextHighlight,
  renderImageHighlight,
  renderShapeHighlight,
  renderTextHighlight,
} from "./export-pdf-renderers";

// Regex patterns at module level for performance
const NEWLINE_REGEX = /\n/;
const WHITESPACE_REGEX = /\s+/;

/**
 * Options for the PDF export function.
 *
 * @category Type
 */
export interface ExportPdfOptions {
  /** Default color for area highlights. Default: "rgba(255, 226, 143, 0.5)" */
  areaHighlightColor?: string;
  /** Default background for freetext. Default: "#ffffc8" */
  defaultFreetextBgColor?: string;
  /** Default text color for freetext. Default: "#333333" */
  defaultFreetextColor?: string;
  /** Default font size for freetext. Default: 14 */
  defaultFreetextFontSize?: number;
  /** Progress callback for large PDFs */
  onProgress?: (current: number, total: number) => void;
  /** Default color for text highlights. Default: "rgba(255, 226, 143, 0.5)" */
  textHighlightColor?: string;
}

/**
 * A highlight that can be exported to PDF.
 *
 * @category Type
 */
export interface ExportableHighlight {
  /** Background color for freetext highlights */
  backgroundColor?: string;
  /** Text color for freetext highlights */
  color?: string;
  content?: {
    text?: string;
    image?: string; // Base64 data URL
    shape?: ShapeData; // Shape data for shape highlights
  };
  /** Font family for freetext highlights (not used in export, Helvetica is always used) */
  fontFamily?: string;
  /** Font size for freetext highlights */
  fontSize?: string;
  /** Per-highlight color override (for text/area highlights) */
  highlightColor?: string;
  /** Style mode for text highlights: "highlight" (default), "underline", or "strikethrough" */
  highlightStyle?: "highlight" | "underline" | "strikethrough";
  id: string;
  position: ScaledPosition;
  /** Shape type for shape highlights */
  shapeType?: "rectangle" | "circle" | "arrow";
  /** Stroke color for shape highlights */
  strokeColor?: string;
  /** Stroke width for shape highlights */
  strokeWidth?: number;
  type?: "text" | "area" | "freetext" | "image" | "drawing" | "shape";
}

/**
 * Break a word that exceeds maxWidth into character-by-character chunks.
 * Returns { chunks: completed line chunks, trailing: partial last chunk to continue building }.
 */
function breakLongWord(
  word: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): { chunks: string[]; trailing: string } {
  const chunks: string[] = [];
  let remaining = word;

  while (remaining.length > 0) {
    let charCount = 1;
    while (
      charCount < remaining.length &&
      font.widthOfTextAtSize(remaining.substring(0, charCount + 1), fontSize) <=
        maxWidth
    ) {
      charCount++;
    }
    const chunk = remaining.substring(0, charCount);
    remaining = remaining.substring(charCount);

    if (remaining.length > 0) {
      chunks.push(chunk);
    } else {
      return { chunks, trailing: chunk };
    }
  }
  return { chunks, trailing: "" };
}

/**
 * Wrap a single paragraph's words into lines that fit within maxWidth.
 */
function wrapParagraph(
  paragraph: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  const words = paragraph.split(WHITESPACE_REGEX);
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (font.widthOfTextAtSize(testLine, fontSize) <= maxWidth) {
      currentLine = testLine;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = "";
    }

    if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
      const { chunks, trailing } = breakLongWord(
        word,
        font,
        fontSize,
        maxWidth
      );
      lines.push(...chunks);
      currentLine = trailing;
    } else {
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Wrap text into multiple lines that fit within maxWidth.
 * Long words are broken character by character (like CSS word-wrap: break-word).
 */
export function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  if (!text || maxWidth <= 0) {
    return [];
  }

  const lines: string[] = [];
  for (const paragraph of text.split(NEWLINE_REGEX)) {
    if (paragraph.trim()) {
      lines.push(...wrapParagraph(paragraph, font, fontSize, maxWidth));
    } else {
      lines.push("");
    }
  }
  return lines;
}

/**
 * Group highlights by page number.
 */
function groupByPage(
  highlights: ExportableHighlight[]
): Map<number, ExportableHighlight[]> {
  const map = new Map<number, ExportableHighlight[]>();
  for (const h of highlights) {
    const pageNum = h.position.boundingRect.pageNumber;
    if (!map.has(pageNum)) {
      map.set(pageNum, []);
    }
    map.get(pageNum)?.push(h);
  }
  return map;
}

/**
 * Export a PDF with annotations embedded.
 *
 * @param pdfSource - The source PDF as a URL string, Uint8Array, or ArrayBuffer
 * @param highlights - Array of highlights to embed in the PDF
 * @param options - Export options for customizing colors and behavior
 * @returns Promise<Uint8Array> - The modified PDF as bytes
 *
 * @example
 * ```typescript
 * const pdfBytes = await exportPdf(pdfUrl, highlights, {
 *   textHighlightColor: "rgba(255, 255, 0, 0.4)",
 *   onProgress: (current, total) => console.log(`${current}/${total} pages`)
 * });
 *
 * // Download the file
 * const blob = new Blob([pdfBytes], { type: "application/pdf" });
 * const url = URL.createObjectURL(blob);
 * const a = document.createElement("a");
 * a.href = url;
 * a.download = "annotated.pdf";
 * a.click();
 * URL.revokeObjectURL(url);
 * ```
 *
 * @category Function
 */
export async function exportPdf(
  pdfSource: string | Uint8Array | ArrayBuffer,
  highlights: ExportableHighlight[],
  options: ExportPdfOptions = {}
): Promise<Uint8Array> {
  let pdfBytes: ArrayBuffer;
  if (typeof pdfSource === "string") {
    const response = await fetch(pdfSource);
    pdfBytes = await response.arrayBuffer();
  } else {
    pdfBytes =
      pdfSource instanceof Uint8Array
        ? (pdfSource.buffer.slice(
            pdfSource.byteOffset,
            pdfSource.byteOffset + pdfSource.byteLength
          ) as ArrayBuffer)
        : pdfSource;
  }

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const byPage = groupByPage(highlights);
  const totalPages = byPage.size;
  let currentPage = 0;

  for (const [pageNum, pageHighlights] of byPage) {
    const page = pages[pageNum - 1];
    if (!page) {
      continue;
    }

    for (const highlight of pageHighlights) {
      switch (highlight.type) {
        case "text":
          renderTextHighlight(page, highlight, options);
          break;
        case "area":
          renderAreaHighlight(page, highlight, options);
          break;
        case "freetext":
          renderFreetextHighlight(page, highlight, options, font, wrapText);
          break;
        case "image":
          await renderImageHighlight(pdfDoc, page, highlight);
          break;
        case "drawing":
          await renderImageHighlight(pdfDoc, page, highlight);
          break;
        case "shape":
          renderShapeHighlight(page, highlight);
          break;
        default:
          renderAreaHighlight(page, highlight, options);
      }
    }

    currentPage++;
    options.onProgress?.(currentPage, totalPages);
  }

  return pdfDoc.save();
}
