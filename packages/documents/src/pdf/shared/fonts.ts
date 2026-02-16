// Server-side font initialization for pdfmake PDF generation
// Registers Roboto (body) + Times (titles) once at module level

import { join } from "node:path";
import pdfmake from "pdfmake";
import { FONT_BODY, FONT_TITLE } from "./brand";

export { FONT_BODY, FONT_TITLE } from "./brand";

// Roboto TTFs bundled with pdfmake — portable, no system dependency
const ROBOTO_DIR = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "node_modules",
  "pdfmake",
  "fonts",
  "Roboto"
);

/**
 * Register fonts with pdfmake. Call once before creating any PDFs.
 * - Roboto: embedded TTF from node_modules (body text)
 * - Times: built-in PDF standard fonts (titles) — works on all platforms
 */
export function initFonts(): void {
  pdfmake.setFonts({
    [FONT_BODY]: {
      normal: join(ROBOTO_DIR, "Roboto-Regular.ttf"),
      bold: join(ROBOTO_DIR, "Roboto-Medium.ttf"),
      italics: join(ROBOTO_DIR, "Roboto-Italic.ttf"),
      bolditalics: join(ROBOTO_DIR, "Roboto-MediumItalic.ttf"),
    },
    [FONT_TITLE]: {
      normal: "Times-Roman",
      bold: "Times-Bold",
      italics: "Times-Italic",
      bolditalics: "Times-BoldItalic",
    },
  });
}
