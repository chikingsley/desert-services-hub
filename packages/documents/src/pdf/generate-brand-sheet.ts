#!/usr/bin/env bun

// Generate a brand style sheet PDF showcasing the Desert Services template system
// Usage: bun lib/pdf/generate-brand-sheet.ts [output-path]

import { resolve } from "node:path";
import pdfmake from "pdfmake";
import type { Content, TableCell } from "pdfmake/interfaces";
import { COLORS, COMPANY } from "./shared/brand";
import { FONT_TITLE, initFonts } from "./shared/fonts";
import { buildFooter } from "./shared/footer";
import { buildHeader } from "./shared/header";
import { borderedLayout, cardLayout, noBordersLayout } from "./shared/layouts";
import { loadLogo } from "./shared/logo";

initFonts();

function colorSwatch(label: string, hex: string, textColor = "#fff"): Content {
  return {
    table: {
      widths: ["*"],
      body: [
        [
          {
            stack: [
              { text: label, bold: true, fontSize: 11, color: textColor },
              {
                text: hex,
                fontSize: 9,
                color: textColor,
                margin: [0, 2, 0, 0],
              },
            ],
            fillColor: hex,
            margin: [10, 12, 10, 12],
          },
        ],
      ],
    },
    layout: noBordersLayout,
  };
}

function typeSample(
  label: string,
  fontName: string,
  size: number,
  bold = false
): Content {
  return {
    columns: [
      {
        text: label,
        fontSize: 8,
        color: COLORS.mutedForeground,
        width: 120,
        margin: [0, 3, 0, 0],
      },
      {
        text: "The quick brown fox jumps over the lazy dog",
        font: fontName,
        fontSize: size,
        bold,
        color: COLORS.foreground,
        width: "*",
      },
    ],
    margin: [0, 0, 0, 6],
  };
}

async function generate(outputPath: string): Promise<void> {
  const logoBase64 = await loadLogo();

  const colorEntries: Array<{
    label: string;
    hex: string;
    textColor?: string;
  }> = [
    { label: "Primary", hex: COLORS.primary },
    {
      label: "Secondary",
      hex: COLORS.secondary,
      textColor: COLORS.secondaryForeground,
    },
    { label: "Foreground", hex: COLORS.foreground },
    { label: "Muted FG", hex: COLORS.mutedForeground },
    {
      label: "Muted",
      hex: COLORS.muted,
      textColor: COLORS.mutedForeground,
    },
    { label: "Accent", hex: COLORS.accent },
    { label: "Destructive", hex: COLORS.destructive },
    {
      label: "Border",
      hex: COLORS.border,
      textColor: COLORS.foreground,
    },
  ];

  // Build color swatches in rows of 4
  const colorRows: Content[] = [];
  for (let i = 0; i < colorEntries.length; i += 4) {
    const row = colorEntries.slice(i, i + 4);
    const cells: TableCell[] = row.map((c) =>
      colorSwatch(c.label, c.hex, c.textColor)
    );
    while (cells.length < 4) {
      cells.push({ text: "" });
    }
    colorRows.push({
      columns: cells,
      columnGap: 8,
      margin: [0, 0, 0, 8],
    } as Content);
  }

  const docDefinition = {
    pageSize: "LETTER" as const,
    pageMargins: [50, 46, 50, 60] as [number, number, number, number],

    footer: buildFooter({
      centerText: `\u00A9 ${new Date().getFullYear()} ${COMPANY.name}`,
    }),

    content: [
      buildHeader({
        title: "Brand Style Sheet",
        logoBase64,
        subtitle: "Desert Services Document Template System",
        date: `Generated: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
      }),

      // Company Info
      {
        text: "Company Information",
        fontSize: 14,
        bold: true,
        color: COLORS.primary,
        margin: [0, 0, 0, 8],
      },
      {
        table: {
          widths: ["*"],
          body: [
            [
              {
                stack: [
                  {
                    columns: [
                      {
                        text: [{ text: "Company: ", bold: true }, COMPANY.name],
                        width: "50%",
                      },
                      {
                        text: [{ text: "Phone: ", bold: true }, COMPANY.phone],
                        width: "50%",
                      },
                    ],
                    margin: [0, 0, 0, 4],
                  },
                  {
                    columns: [
                      {
                        text: [
                          { text: "Website: ", bold: true },
                          COMPANY.website,
                        ],
                        width: "50%",
                      },
                      {
                        text: [{ text: "Fax: ", bold: true }, COMPANY.fax],
                        width: "50%",
                      },
                    ],
                    margin: [0, 0, 0, 4],
                  },
                  {
                    columns: [
                      {
                        text: [
                          { text: "Address: ", bold: true },
                          COMPANY.poBox,
                        ],
                        width: "50%",
                      },
                      {
                        text: [
                          { text: "ROC: ", bold: true },
                          `#${COMPANY.roc}`,
                        ],
                        width: "50%",
                      },
                    ],
                  },
                ],
                fillColor: COLORS.muted,
                margin: [12, 10, 12, 10],
              },
            ],
          ],
        },
        layout: cardLayout,
        margin: [0, 0, 0, 20],
      },

      // Color Palette
      {
        text: "Color Tokens (shadcn convention)",
        fontSize: 14,
        bold: true,
        color: COLORS.primary,
        margin: [0, 0, 0, 10],
      },
      ...colorRows,
      { text: "", margin: [0, 0, 0, 12] },

      // Typography
      {
        text: "Typography",
        fontSize: 14,
        bold: true,
        color: COLORS.primary,
        margin: [0, 0, 0, 10],
      },
      typeSample(`${FONT_TITLE} 20pt Bold`, FONT_TITLE, 20, true),
      typeSample(`${FONT_TITLE} 18pt Bold`, FONT_TITLE, 18, true),
      typeSample("Roboto 14pt Bold", "Roboto", 14, true),
      typeSample("Roboto 10pt Regular", "Roboto", 10),
      typeSample("Roboto 10pt Bold", "Roboto", 10, true),
      typeSample("Roboto 9pt (tables)", "Roboto", 9),
      typeSample("Roboto 8pt (footnotes)", "Roboto", 8),
      { text: "", margin: [0, 0, 0, 12] },

      // Layout Elements
      {
        text: "Layout Elements",
        fontSize: 14,
        bold: true,
        color: COLORS.primary,
        margin: [0, 0, 0, 10],
      },

      // Standard header demo
      {
        text: "Standard Header",
        fontSize: 10,
        bold: true,
        color: COLORS.foreground,
        margin: [0, 0, 0, 6],
      },
      {
        text: "Logo left, Times title right-aligned, optional subtitle and date. Used across all company documents.",
        fontSize: 9,
        color: COLORS.mutedForeground,
        margin: [0, 0, 0, 10],
      },

      // Card layout demo
      {
        text: "Card Layout (callout boxes)",
        fontSize: 10,
        bold: true,
        color: COLORS.foreground,
        margin: [0, 0, 0, 6],
      },
      {
        columns: [
          {
            width: "49%",
            table: {
              widths: ["*"],
              body: [
                [
                  {
                    stack: [
                      {
                        text: "Standard Card",
                        bold: true,
                        color: COLORS.primary,
                        margin: [0, 0, 0, 4],
                      },
                      {
                        text: "Light gray background with 1pt #ddd border. Used for info boxes, callouts, and grouped content.",
                        fontSize: 9,
                      },
                    ],
                    fillColor: COLORS.muted,
                    margin: [10, 10, 10, 10],
                  },
                ],
              ],
            },
            layout: cardLayout,
          },
          {
            width: "49%",
            table: {
              widths: ["*"],
              body: [
                [
                  {
                    stack: [
                      {
                        text: "Branded Card",
                        bold: true,
                        color: COLORS.primary,
                        margin: [0, 0, 0, 4],
                      },
                      {
                        text: "Primary color border (2pt) for emphasis. Company-branded sections and CTAs.",
                        fontSize: 9,
                      },
                    ],
                    fillColor: COLORS.muted,
                    margin: [10, 10, 10, 10],
                  },
                ],
              ],
            },
            layout: {
              hLineWidth: () => 2,
              vLineWidth: () => 2,
              hLineColor: () => COLORS.primary,
              vLineColor: () => COLORS.primary,
            },
          },
        ],
        columnGap: 10,
        margin: [0, 0, 0, 14],
      },

      // Table demo
      {
        text: "Data Table",
        fontSize: 10,
        bold: true,
        color: COLORS.foreground,
        margin: [0, 0, 0, 6],
      },
      {
        table: {
          headerRows: 1,
          widths: [120, "*", "auto"],
          body: [
            [
              { text: "Element", bold: true, color: COLORS.foreground },
              { text: "Description", bold: true, color: COLORS.foreground },
              { text: "Value", bold: true, color: COLORS.foreground },
            ],
            ["Page size", "Standard US Letter", "8.5 x 11 in"],
            ["Body font", "Roboto (embedded TTF)", "9-10pt"],
            ["Title font", "Times (built-in PDF)", "18-20pt"],
            ["Page margins", "40-50pt sides", "Variable"],
            ["Border weight", "Standard table borders", "0.5pt"],
          ],
        },
        layout: {
          fillColor: (rowIndex: number) => {
            if (rowIndex === 0) {
              return "#ece7dd";
            }
            return rowIndex % 2 === 0 ? COLORS.muted : null;
          },
          hLineColor: () => COLORS.border,
          vLineColor: () => COLORS.border,
        },
        margin: [0, 0, 0, 14],
      },

      // Footer demo
      {
        text: "Standard Footer",
        fontSize: 10,
        bold: true,
        color: COLORS.foreground,
        margin: [0, 0, 0, 6],
      },
      {
        text: "Company info left | optional center text | page numbers right. Estimate PDFs extend this with signature block and contact bar.",
        fontSize: 9,
        color: COLORS.mutedForeground,
        margin: [0, 0, 0, 14],
      },

      // Modules
      {
        text: "Template Modules",
        fontSize: 14,
        bold: true,
        color: COLORS.primary,
        margin: [0, 0, 0, 10],
      },
      {
        table: {
          widths: [100, "*"],
          body: [
            [
              { text: "Module", bold: true, fillColor: "#ece7dd" },
              { text: "Purpose", bold: true, fillColor: "#ece7dd" },
            ],
            [
              { text: "brand.ts", bold: true },
              "Colors palette + company info constants",
            ],
            [
              { text: "fonts.ts", bold: true },
              "Roboto + Times font registration (portable, cross-platform)",
            ],
            [
              { text: "logo.ts", bold: true },
              "Logo loader (apps/web/frontend/public/logo.png as base64)",
            ],
            [
              { text: "layouts.ts", bold: true },
              "Reusable table layouts (bordered, card, no-borders, no-padding)",
            ],
            [
              { text: "header.ts", bold: true },
              "Standard logo-left / title-right header builder",
            ],
            [
              { text: "footer.ts", bold: true },
              "Standard company footer with page numbers",
            ],
          ],
        },
        layout: {
          ...borderedLayout,
          fillColor: (rowIndex: number) =>
            rowIndex > 0 && rowIndex % 2 === 0 ? COLORS.muted : null,
        },
      },
    ],

    defaultStyle: {
      fontSize: 10,
      lineHeight: 1.3,
    },
  };

  const buffer = await pdfmake
    .createPdf(docDefinition as Parameters<typeof pdfmake.createPdf>[0])
    .getBuffer();
  await Bun.write(outputPath, buffer);
  console.log(`Brand sheet saved to: ${outputPath}`);
}

const outputPath =
  process.argv[2] || resolve(import.meta.dirname, "brand-sheet.pdf");

generate(outputPath).catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
