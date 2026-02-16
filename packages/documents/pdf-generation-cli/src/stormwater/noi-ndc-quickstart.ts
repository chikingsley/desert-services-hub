/**
 * Arizona Construction Stormwater Quickstart - Branded PDF Generator
 *
 * Produces a client-facing packet for deciding NOI vs NDC and
 * completing myDEQ submissions under the 2025 CGP.
 */

import { COLORS } from "@documents/pdf/shared/brand";
import { initFonts } from "@documents/pdf/shared/fonts";
import { buildFooter } from "@documents/pdf/shared/footer";
import { buildHeader } from "@documents/pdf/shared/header";
import { cardLayout } from "@documents/pdf/shared/layouts";
import { loadLogo } from "@documents/pdf/shared/logo";
import pdfmake from "pdfmake";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";

type Margin = [number, number, number, number];

initFonts();

const GUIDE = {
  title: "Arizona Construction Stormwater Quickstart",
  subtitle: "NOI vs NDC Decision & Filing Guide (2025 CGP)",
  reviewedOn: "February 5, 2026",
  permitWindow: "2025 CGP effective August 29, 2025 through August 28, 2030",
  disclaimer:
    "Operational guidance only. This packet is not legal advice and does not replace permit text.",
};

const SOURCE_LOG = [
  "ADEQ AZG2025-001 Construction General Permit (effective 2025-08-29)",
  "ADEQ AZG2025-001 CGP Fact Sheet (August 2025)",
  "ADEQ CGP FAQ (revised October 28, 2025)",
  "myDEQ User Roles & Responsibilities (TM-18-28)",
  "A.R.S. § 49-262 (civil penalties)",
  "Town of Fountain Hills NOI Q&A (legacy local handout)",
];

function buildGuideDocDefinition(logoBase64: string): TDocumentDefinitions {
  return {
    pageSize: "LETTER",
    pageMargins: [50, 46, 50, 62],

    footer: buildFooter(),

    content: [
      buildHeader({
        title: GUIDE.title,
        logoBase64,
        subtitle: GUIDE.subtitle,
        date: `Last reviewed: ${GUIDE.reviewedOn}`,
      }),

      {
        table: {
          widths: ["*"],
          body: [
            [
              {
                stack: [
                  {
                    text: "What this packet does",
                    bold: true,
                    color: COLORS.primary,
                    margin: [0, 0, 0, 4],
                  },
                  {
                    text: "Gives a fast decision path for NOI vs NDC, a pre-submit checklist, and high-risk mistakes that cause rework.",
                    fontSize: 9,
                  },
                  {
                    text: GUIDE.permitWindow,
                    fontSize: 9,
                    margin: [0, 6, 0, 0],
                    color: COLORS.foreground,
                  },
                ],
                fillColor: COLORS.muted,
                margin: [10, 8, 10, 8],
              },
            ],
          ],
        },
        layout: cardLayout,
        margin: [0, 0, 0, 16],
      },

      buildSection("1) Decide In 60 Seconds: NOI or NDC", [
        {
          columns: [
            {
              width: "49%",
              stack: [
                {
                  text: "File an NOI when:",
                  style: "cardTitle",
                  color: COLORS.primary,
                },
                buildBulletList([
                  "The site discharges or may discharge stormwater off-site.",
                  "Runoff reaches a Water of the U.S. directly or through an MS4/storm drain.",
                  "You are not fully sure that all stormwater stays on-site.",
                ]),
                {
                  text: "NOI has an application fee and annual fees until an approved NOT is filed.",
                  fontSize: 8,
                  color: COLORS.mutedForeground,
                },
              ],
              margin: [10, 10, 10, 10],
              fillColor: COLORS.muted,
            },
            {
              width: "49%",
              stack: [
                {
                  text: "Use NDC only when:",
                  style: "cardTitle",
                  color: COLORS.primary,
                },
                buildBulletList([
                  "There are no off-site stormwater discharges from construction activity.",
                  "You can document controls that keep stormwater on-site.",
                  "The certification is signed by an RCO or DRO in myDEQ.",
                ]),
                {
                  text: "NDC has no fee, but local jurisdictions can still require separate site controls.",
                  fontSize: 8,
                  color: COLORS.mutedForeground,
                },
              ],
              margin: [10, 10, 10, 10],
              fillColor: COLORS.muted,
            },
          ],
          columnGap: 10,
        },
      ]),

      buildSection("2) Eligibility Checks Before You File", [
        buildNumberedList([
          "Confirm disturbed area is 1+ acre, or part of a common plan that totals 1+ acre.",
          "Map every potential outfall, including sheet flow to curb/storm drain/MS4.",
          "If any discharge is possible, file NOI (NDC is only for true no-discharge scenarios).",
          "Confirm who will certify in myDEQ (RCO or DRO with proper authority).",
          "If a city or town has stricter conditions, follow those in addition to ADEQ requirements.",
        ]),
      ]),

      buildSection("3) Pre-Submit Data Checklist (Collect First)", [
        {
          table: {
            headerRows: 1,
            widths: [155, "*"],
            body: [
              [
                { text: "Data You Need", style: "tableHeader" },
                { text: "Why It Matters", style: "tableHeader" },
              ],
              [
                "Operator + signer info",
                "RCO/DRO authority and certification are required to submit.",
              ],
              [
                "Exact disturbed acreage",
                "Drives coverage eligibility and fee bracket logic.",
              ],
              [
                "Site location + map pin",
                "Supports outfall/MS4/waterbody determination in myDEQ.",
              ],
              [
                "Outfall list (or representative outfalls)",
                "Required for accurate discharge characterization.",
              ],
              [
                "Receiving waterbody / MS4 path",
                "Determines how discharges are tracked and reported.",
              ],
              [
                "SWPPP status",
                "NOI path requires SWPPP development and implementation.",
              ],
              [
                "Site superintendent contact",
                "Required day-to-day compliance contact details.",
              ],
            ],
          },
          layout: {
            fillColor: (rowIndex: number) => {
              if (rowIndex === 0) {
                return "#ece7dd";
              }
              return rowIndex % 2 === 0 ? "#faf9f7" : null;
            },
            hLineColor: () => COLORS.border,
            vLineColor: () => COLORS.border,
          },
        },
      ]),

      buildSection("4) NOI Filing Path (Operator Playbook)", [
        buildNumberedList([
          'In myDEQ, start a new application from "Get New" for construction stormwater coverage.',
          "Complete project/operator fields and verify acreage still under active construction.",
          "Map outfalls and identify receiving water or MS4 pathways accurately.",
          "Upload/prepare required supporting information and complete certification.",
          "Submit and pay fee; keep records of submittal and invoice status.",
          "Maintain permit obligations until final stabilization and approved NOT.",
        ]),
      ]),

      buildSection("5) NDC Filing Path (No-Discharge Sites)", [
        buildNumberedList([
          "Confirm site design/controls prevent off-site stormwater discharge.",
          "Document the controls used to retain/manage stormwater on-site.",
          "Submit NDC in myDEQ and certify via authorized RCO/DRO.",
          "Save certificate and keep controls maintained to preserve no-discharge status.",
          "If site conditions change and discharge becomes possible, move to NOI coverage immediately.",
        ]),
      ]),

      buildSection("6) Mistakes That Cause Rework", [
        buildBulletList([
          "Under-reporting disturbed acreage after phasing or scope changes.",
          "Assuming no discharge because retention exists, without validating overflow pathways.",
          "Choosing NDC when discharge can occur through a conveyance/MS4.",
          "Missing signer authority setup (RCO/DRO) before final certification.",
          "Failing to submit NOT when work is complete and stabilized.",
        ]),
      ]),

      buildSection("7) Compliance Risk Snapshot", [
        {
          text: [
            {
              text: "Civil penalty context: ",
              bold: true,
            },
            "A.R.S. § 49-262(C) states a civil penalty of up to ",
            { text: "$25,000 per day per violation", bold: true },
            " for applicable violations.",
          ],
          margin: [0, 0, 0, 6],
        },
        {
          text: [
            {
              text: "Legacy note: ",
              bold: true,
            },
            "Some older municipal handouts still reference $27,500/day. Use current statutory and ADEQ source documents for decisions.",
          ],
        },
      ]),

      buildSection("8) Support Contacts", [
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
                          text: "myDEQ Technical Support",
                          style: "cardTitle",
                          color: COLORS.foreground,
                          margin: [0, 0, 0, 6],
                        },
                        {
                          text: [
                            { text: "Phone: ", bold: true },
                            "844-827-4768",
                          ],
                          margin: [0, 0, 0, 3],
                        },
                        {
                          text: [
                            { text: "Email: ", bold: true },
                            "myDEQ.support@azdeq.gov",
                          ],
                          margin: [0, 0, 0, 3],
                        },
                        {
                          text: [
                            { text: "Web: ", bold: true },
                            {
                              text: "azdeq.gov/mydeq",
                              link: "https://azdeq.gov/mydeq",
                              color: COLORS.accent,
                              decoration: "underline",
                            },
                          ],
                        },
                      ],
                      margin: [10, 10, 10, 10],
                      fillColor: COLORS.muted,
                    },
                  ],
                ],
              },
              layout: {
                hLineWidth: () => 1,
                vLineWidth: () => 1,
                hLineColor: () => COLORS.border,
                vLineColor: () => COLORS.border,
              },
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
                          text: "Desert Services",
                          style: "cardTitle",
                          color: COLORS.primary,
                          margin: [0, 0, 0, 6],
                        },
                        {
                          text: [
                            { text: "Office: ", bold: true },
                            "480-513-8986",
                          ],
                          margin: [0, 0, 0, 3],
                        },
                        {
                          text: [
                            { text: "Contact: ", bold: true },
                            "Jayson Roti",
                          ],
                          margin: [0, 0, 0, 3],
                        },
                        {
                          text: [
                            { text: "Cell: ", bold: true },
                            "602-722-0218",
                          ],
                          margin: [0, 0, 0, 3],
                        },
                        {
                          text: [
                            { text: "Site: ", bold: true },
                            {
                              text: "desertservices.net",
                              link: "https://desertservices.net",
                              color: COLORS.accent,
                              decoration: "underline",
                            },
                          ],
                        },
                      ],
                      margin: [10, 10, 10, 10],
                      fillColor: COLORS.muted,
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
        },
      ]),

      {
        text: "Source log",
        style: "sectionTitle",
        margin: [0, 4, 0, 8],
      },
      buildBulletList(SOURCE_LOG),
      {
        text: GUIDE.disclaimer,
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
      sectionTitle: {
        fontSize: 14,
        bold: true,
        color: COLORS.primary,
      },
      cardTitle: {
        fontSize: 10,
        bold: true,
      },
      tableHeader: {
        bold: true,
        color: COLORS.foreground,
      },
    },
  };
}

function buildSection(title: string, blocks: Content[]): Content {
  return {
    stack: [
      { text: title, style: "sectionTitle", margin: [0, 0, 0, 8] },
      ...blocks,
    ],
    margin: [0, 0, 0, 16],
  };
}

function buildNumberedList(items: string[]): Content {
  return {
    ol: items.map((item) => ({
      text: item,
      margin: [0, 0, 0, 4] as Margin,
    })),
    margin: [0, 0, 0, 8] as Margin,
  };
}

function buildBulletList(items: Array<string | Content>): Content {
  return {
    ul: items.map((item) => {
      const normalized =
        typeof item === "string" ? ({ text: item } as Content) : item;
      return {
        ...(normalized as object),
        margin: [0, 0, 0, 5] as Margin,
      };
    }),
    margin: [0, 0, 0, 8] as Margin,
  } as Content;
}

export async function generatePdf(outputPdfPath: string): Promise<void> {
  const logoBase64 = await loadLogo();
  const docDefinition = buildGuideDocDefinition(logoBase64);
  const buffer = await pdfmake.createPdf(docDefinition).getBuffer();
  await Bun.write(outputPdfPath, buffer);
}
