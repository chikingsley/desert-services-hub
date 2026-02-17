import { type PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";
import type { Scaled } from "../types";
import type { ExportableHighlight, ExportPdfOptions } from "./export-pdf";

// Regex patterns at module level for performance
const RGBA_REGEX = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/;

/**
 * Parse a color string to RGB values (0-1 range).
 */
export function parseColor(color: string): {
  r: number;
  g: number;
  b: number;
  a: number;
} {
  const rgbaMatch = color.match(RGBA_REGEX);
  if (rgbaMatch) {
    return {
      r: Number.parseInt(rgbaMatch[1], 10) / 255,
      g: Number.parseInt(rgbaMatch[2], 10) / 255,
      b: Number.parseInt(rgbaMatch[3], 10) / 255,
      a: rgbaMatch[4] ? Number.parseFloat(rgbaMatch[4]) : 1,
    };
  }

  const hex = color.replace("#", "");
  if (hex.length === 3) {
    return {
      r: Number.parseInt(hex[0] + hex[0], 16) / 255,
      g: Number.parseInt(hex[1] + hex[1], 16) / 255,
      b: Number.parseInt(hex[2] + hex[2], 16) / 255,
      a: 1,
    };
  }
  if (hex.length === 6) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16) / 255,
      g: Number.parseInt(hex.slice(2, 4), 16) / 255,
      b: Number.parseInt(hex.slice(4, 6), 16) / 255,
      a: 1,
    };
  }

  return { r: 1, g: 0.89, b: 0.56, a: 0.5 };
}

/**
 * Convert ScaledPosition coordinates to PDF points.
 * PDF coordinate system has origin at bottom-left.
 */
export function scaledToPdfPoints(
  scaled: Scaled,
  page: PDFPage
): { x: number; y: number; width: number; height: number } {
  const pdfWidth = page.getWidth();
  const pdfHeight = page.getHeight();

  const xRatio = pdfWidth / scaled.width;
  const yRatio = pdfHeight / scaled.height;

  const x = scaled.x1 * xRatio;
  const width = (scaled.x2 - scaled.x1) * xRatio;
  const height = (scaled.y2 - scaled.y1) * yRatio;
  const y = pdfHeight - scaled.y1 * yRatio - height;

  return { x, y, width, height };
}

/**
 * Convert base64 data URL to bytes.
 */
function dataUrlToBytes(dataUrl: string): {
  bytes: Uint8Array;
  type: "png" | "jpg";
} {
  const base64 = dataUrl.split(",")[1];
  const byteString = atob(base64);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    bytes[i] = byteString.charCodeAt(i);
  }
  const type = dataUrl.includes("image/png") ? "png" : "jpg";
  return { bytes, type };
}

/**
 * Transform visual coordinates to raw MediaBox coordinates.
 * pdf-lib's drawImage uses raw MediaBox space, but our coordinates are in visual space.
 */
function transformToRawCoordinates(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number; width: number; height: number } {
  const rotation = page.getRotation().angle;
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();

  if (rotation === 90) {
    return {
      x: y,
      y: pageWidth - x - width,
      width: height,
      height: width,
    };
  }
  if (rotation === 180) {
    return {
      x: pageWidth - x - width,
      y: pageHeight - y - height,
      width,
      height,
    };
  }
  if (rotation === 270) {
    return {
      x: pageHeight - y - height,
      y: x,
      width: height,
      height: width,
    };
  }

  return { x, y, width, height };
}

/**
 * Render a text highlight (multiple rectangles for multi-line selections).
 * Supports highlight (background), underline, and strikethrough styles.
 */
export function renderTextHighlight(
  page: PDFPage,
  highlight: ExportableHighlight,
  options: ExportPdfOptions
): void {
  const colorStr =
    highlight.highlightColor ||
    options.textHighlightColor ||
    "rgba(255, 226, 143, 0.5)";
  const color = parseColor(colorStr);
  const highlightStyle = highlight.highlightStyle || "highlight";

  const rects =
    highlight.position.rects.length > 0
      ? highlight.position.rects
      : [highlight.position.boundingRect];

  for (const rect of rects) {
    const { x, y, width, height } = scaledToPdfPoints(rect, page);

    if (highlightStyle === "highlight") {
      page.drawRectangle({
        x,
        y,
        width,
        height,
        color: rgb(color.r, color.g, color.b),
        opacity: color.a,
      });
    } else if (highlightStyle === "underline") {
      const lineThickness = Math.max(1, height * 0.1);
      page.drawRectangle({
        x,
        y,
        width,
        height: lineThickness,
        color: rgb(color.r, color.g, color.b),
        opacity: color.a,
      });
    } else if (highlightStyle === "strikethrough") {
      const lineThickness = Math.max(1, height * 0.1);
      const lineY = y + height / 2 - lineThickness / 2;
      page.drawRectangle({
        x,
        y: lineY,
        width,
        height: lineThickness,
        color: rgb(color.r, color.g, color.b),
        opacity: color.a,
      });
    }
  }
}

/**
 * Render an area highlight (single rectangle).
 */
export function renderAreaHighlight(
  page: PDFPage,
  highlight: ExportableHighlight,
  options: ExportPdfOptions
): void {
  const colorStr =
    highlight.highlightColor ||
    options.areaHighlightColor ||
    "rgba(255, 226, 143, 0.5)";
  const color = parseColor(colorStr);
  const { x, y, width, height } = scaledToPdfPoints(
    highlight.position.boundingRect,
    page
  );

  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: rgb(color.r, color.g, color.b),
    opacity: color.a,
  });
}

/**
 * Render a freetext highlight (background rectangle + text).
 * Text is wrapped to fit within the box.
 */
export function renderFreetextHighlight(
  page: PDFPage,
  highlight: ExportableHighlight,
  options: ExportPdfOptions,
  font: PDFFont,
  wrapText: (
    text: string,
    font: PDFFont,
    fontSize: number,
    maxWidth: number
  ) => string[]
): void {
  const text = highlight.content?.text || "";
  const textColor = parseColor(
    highlight.color || options.defaultFreetextColor || "#333333"
  );

  const { x, y, width, height } = scaledToPdfPoints(
    highlight.position.boundingRect,
    page
  );

  const pdfHeight = page.getHeight();
  const yRatio = pdfHeight / highlight.position.boundingRect.height;
  const storedFontSize =
    Number.parseInt(highlight.fontSize || "", 10) ||
    options.defaultFreetextFontSize ||
    14;
  const fontSize = storedFontSize * yRatio;

  console.log("Freetext export:", {
    storedFontSize,
    yRatio,
    fontSize,
    boxDimensions: { x, y, width, height },
    text: text.substring(0, 50),
  });

  const bgColorValue =
    highlight.backgroundColor || options.defaultFreetextBgColor || "#ffffc8";
  if (bgColorValue !== "transparent") {
    const bgColor = parseColor(bgColorValue);
    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: rgb(bgColor.r, bgColor.g, bgColor.b),
      opacity: bgColor.a,
    });
  }

  const padding = 4 * yRatio;
  const maxWidth = width - padding * 2;
  const lineHeight = fontSize * 1.3;

  if (maxWidth > 0 && text) {
    const lines = wrapText(text, font, fontSize, maxWidth);
    let currentY = y + height - fontSize - padding;

    for (const line of lines) {
      if (currentY < y + padding) {
        break;
      }
      if (line.trim()) {
        page.drawText(line, {
          x: x + padding,
          y: currentY,
          size: fontSize,
          font,
          color: rgb(textColor.r, textColor.g, textColor.b),
        });
      }
      currentY -= lineHeight;
    }
  }
}

/**
 * Render an image highlight (embedded image).
 * Handles page rotation by transforming visual coordinates to raw MediaBox space.
 */
export async function renderImageHighlight(
  pdfDoc: PDFDocument,
  page: PDFPage,
  highlight: ExportableHighlight
): Promise<void> {
  const imageDataUrl = highlight.content?.image;
  if (!imageDataUrl) {
    return;
  }

  try {
    const { bytes, type } = dataUrlToBytes(imageDataUrl);
    const image =
      type === "png"
        ? await pdfDoc.embedPng(bytes)
        : await pdfDoc.embedJpg(bytes);

    const visualCoords = scaledToPdfPoints(
      highlight.position.boundingRect,
      page
    );
    const rawCoords = transformToRawCoordinates(
      page,
      visualCoords.x,
      visualCoords.y,
      visualCoords.width,
      visualCoords.height
    );

    console.log("Image export:", {
      rotation: page.getRotation().angle,
      visualCoords,
      rawCoords,
    });

    page.drawImage(image, {
      x: rawCoords.x,
      y: rawCoords.y,
      width: rawCoords.width,
      height: rawCoords.height,
    });
  } catch (error) {
    console.error("Failed to embed image:", error);
  }
}

/**
 * Render a shape highlight (rectangle, circle, or arrow).
 */
export function renderShapeHighlight(
  page: PDFPage,
  highlight: ExportableHighlight
): void {
  const shapeType =
    highlight.content?.shape?.shapeType || highlight.shapeType || "rectangle";
  const strokeColorStr =
    highlight.content?.shape?.strokeColor || highlight.strokeColor || "#000000";
  const strokeWidth =
    highlight.content?.shape?.strokeWidth || highlight.strokeWidth || 2;

  const color = parseColor(strokeColorStr);
  const { x, y, width, height } = scaledToPdfPoints(
    highlight.position.boundingRect,
    page
  );

  switch (shapeType) {
    case "rectangle":
      page.drawRectangle({
        x,
        y,
        width,
        height,
        borderColor: rgb(color.r, color.g, color.b),
        borderWidth: strokeWidth,
        opacity: color.a,
      });
      break;

    case "circle":
      page.drawEllipse({
        x: x + width / 2,
        y: y + height / 2,
        xScale: width / 2,
        yScale: height / 2,
        borderColor: rgb(color.r, color.g, color.b),
        borderWidth: strokeWidth,
        opacity: color.a,
      });
      break;

    case "arrow": {
      const startPt = highlight.content?.shape?.startPoint;
      const endPt = highlight.content?.shape?.endPoint;

      const startX = startPt ? x + startPt.x * width : x;
      const startY = startPt ? y + (1 - startPt.y) * height : y + height / 2;
      const endX = endPt ? x + endPt.x * width : x + width;
      const endY = endPt ? y + (1 - endPt.y) * height : y + height / 2;

      page.drawLine({
        start: { x: startX, y: startY },
        end: { x: endX, y: endY },
        color: rgb(color.r, color.g, color.b),
        thickness: strokeWidth,
        opacity: color.a,
      });

      const angle = Math.atan2(endY - startY, endX - startX);
      const arrowSize = Math.min(15, width * 0.2, height * 0.4);
      const arrowAngle = Math.PI / 6;

      page.drawLine({
        start: {
          x: endX - arrowSize * Math.cos(angle - arrowAngle),
          y: endY - arrowSize * Math.sin(angle - arrowAngle),
        },
        end: { x: endX, y: endY },
        color: rgb(color.r, color.g, color.b),
        thickness: strokeWidth,
        opacity: color.a,
      });
      page.drawLine({
        start: {
          x: endX - arrowSize * Math.cos(angle + arrowAngle),
          y: endY - arrowSize * Math.sin(angle + arrowAngle),
        },
        end: { x: endX, y: endY },
        color: rgb(color.r, color.g, color.b),
        thickness: strokeWidth,
        opacity: color.a,
      });
      break;
    }

    default: {
      const _exhaustiveCheck: never = shapeType as never;
      console.warn(`Unknown shape type: ${_exhaustiveCheck}`);
    }
  }
}
