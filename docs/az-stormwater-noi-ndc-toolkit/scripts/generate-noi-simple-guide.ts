/**
 * MyDEQ NOI Simple Guide - Branded PDF Generator
 *
 * One-page, action-first instructions for supers and PMs filing an NOI.
 */

import { resolve } from "node:path";
import pdfmake from "pdfmake";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { COLORS } from "@/lib/pdf/shared/brand";
import { initFonts } from "@/lib/pdf/shared/fonts";
import { buildFooter } from "@/lib/pdf/shared/footer";
import { buildHeader } from "@/lib/pdf/shared/header";
import { cardLayout } from "@/lib/pdf/shared/layouts";
import { loadLogo } from "@/lib/pdf/shared/logo";

initFonts();

function buildDocDefinition(logoBase64: string): TDocumentDefinitions {
  return {
    pageSize: "LETTER",
    pageMargins: [50, 46, 50, 60],

    footer: buildFooter(),

    content: [
      buildHeader({
        title: "MyDEQ NOI Simple Guide",
        logoBase64,
        titleFontSize: 19,
        subtitle: "Fast step-by-step for supers and PMs (NOI path)",
        date: "Last reviewed: February 5, 2026",
        marginBottom: 14,
      }),

      {
        table: {
          widths: ["*"],
          body: [
            [
              {
                stack: [
                  {
                    text: "Use this when you need to file a Construction General Permit NOI in myDEQ.",
                    margin: [0, 0, 0, 5],
                  },
                  {
                    ul: [
                      {
                        text: "NOI path = stormwater may leave site (or could leave site) to WOTUS/MS4.",
                        margin: [0, 0, 0, 3],
                      },
                      {
                        text: "NDC path = no-discharge certificate (stormwater stays on-site).",
                        margin: [0, 0, 0, 0],
                      },
                    ],
                  },
                ],
                margin: [10, 9, 10, 9],
                fillColor: COLORS.muted,
              },
            ],
          ],
        },
        layout: cardLayout,
        margin: [0, 0, 0, 14],
      },

      stepBlock("Step 1: Account setup", [
        "A person listed on your Arizona Corporation Commission file must create or use the myDEQ account (RCO role).",
        "Go to azdeq.gov/mydeq and click Request Account if you do not already have access.",
      ]),

      stepBlock("Step 2: Start the correct application", [
        "In myDEQ, choose General Construction Permit (NOI/NDC).",
        "This handout is for the NOI path.",
      ]),

      stepBlock("Step 3: Answer key NOI questions", [
        "When asked discharge/runoff questions: if stormwater may leave site, answer for NOI (typically YES).",
        "Selecting NO/Unknown can route the filing into NDC (No Discharge Certificate) instead of NOI.",
        "Use the map to place a point at the lowest site runoff location and capture coordinates.",
        "For MS4, select the city where the project is located.",
        "For receiving water, enter the nearest waterbody name. If unknown, choose Unknown/Unnamed.",
        "SWPPP review in myDEQ is not required for this NOI filing flow.",
        "Provide superintendent/site contact name, phone, and email.",
      ]),

      stepBlock("Step 4: Submit and save records", [
        "Certify and submit in myDEQ.",
        "Save confirmation details and payment records for the project file.",
      ]),

      {
        table: {
          widths: ["*"],
          body: [
            [
              {
                stack: [
                  {
                    text: "Important",
                    bold: true,
                    color: COLORS.primary,
                    margin: [0, 0, 0, 4],
                  },
                  {
                    text: "NOI and NDC are different outcomes in the same workflow. If you accidentally create NDC when you need NOI coverage, fix/cancel and refile on the NOI path.",
                    fontSize: 9,
                  },
                ],
                margin: [10, 8, 10, 8],
                fillColor: COLORS.muted,
              },
            ],
          ],
        },
        layout: cardLayout,
        margin: [0, 2, 0, 12],
      },

      {
        columns: [
          {
            width: "50%",
            text: [{ text: "myDEQ support: ", bold: true }, "844-827-4768"],
            fontSize: 9,
          },
          {
            width: "50%",
            text: [
              { text: "Desert Services: ", bold: true },
              "Jayson Roti | 602-722-0218",
            ],
            fontSize: 9,
            alignment: "right",
          },
        ],
      },

      {
        text: "Source basis: ADEQ CGP FAQ (revised 2025-10-28), myDEQ role guidance (TM-18-28), and internal Desert Services filing SOP.",
        fontSize: 8,
        color: COLORS.mutedForeground,
        margin: [0, 8, 0, 0],
      },
    ],

    defaultStyle: {
      fontSize: 10,
      lineHeight: 1.3,
    },

    styles: {
      stepTitle: {
        fontSize: 12,
        bold: true,
        color: COLORS.primary,
        margin: [0, 0, 0, 4],
      },
    },
  };
}

function stepBlock(title: string, lines: string[]): Content {
  return {
    stack: [
      { text: title, style: "stepTitle" },
      {
        ul: lines.map((line) => ({
          text: line,
          margin: [0, 0, 0, 4] as [number, number, number, number],
        })),
      },
    ],
    margin: [0, 0, 0, 10],
  };
}

export async function generateNoiSimpleGuide(
  outputPath?: string
): Promise<Uint8Array> {
  const logoBase64 = await loadLogo();
  const docDefinition = buildDocDefinition(logoBase64);
  const buffer = await pdfmake.createPdf(docDefinition).getBuffer();

  if (outputPath) {
    await Bun.write(outputPath, buffer);
    console.log(`PDF saved to: ${outputPath}`);
  }

  return buffer;
}

if (import.meta.main) {
  const outputPath =
    process.argv[2] ||
    resolve(import.meta.dirname, "../outputs/noi-simple-guide-v1.pdf");

  generateNoiSimpleGuide(outputPath)
    .then(() => {
      console.log("Done!");
    })
    .catch((err) => {
      console.error("Error generating PDF:", err);
      process.exit(1);
    });
}
