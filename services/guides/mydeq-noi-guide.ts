/**
 * myDEQ NOI Registration Guide - Branded PDF Generator
 *
 * Creates a professional branded guide for contractors explaining
 * how to register for a myDEQ account and apply for an NOI (Notice of Intent).
 */

import pdfmake from "pdfmake";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { join, resolve } from "node:path";

// Initialize pdfmake with font paths (server-side)
const fonts = {
  Roboto: {
    normal: join(
      process.cwd(),
      "node_modules/pdfmake/fonts/Roboto/Roboto-Regular.ttf"
    ),
    bold: join(
      process.cwd(),
      "node_modules/pdfmake/fonts/Roboto/Roboto-Medium.ttf"
    ),
    italics: join(
      process.cwd(),
      "node_modules/pdfmake/fonts/Roboto/Roboto-Italic.ttf"
    ),
    bolditalics: join(
      process.cwd(),
      "node_modules/pdfmake/fonts/Roboto/Roboto-MediumItalic.ttf"
    ),
  },
  TimesNewRoman: {
    normal: "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
    bold: "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
    italics: "/System/Library/Fonts/Supplemental/Times New Roman Italic.ttf",
    bolditalics: "/System/Library/Fonts/Supplemental/Times New Roman Bold Italic.ttf",
  },
};

pdfmake.setFonts(fonts);

// Desert Services brand colors
const BRAND = {
  primary: "#8B5A2B", // Desert brown (from logo gradient)
  secondary: "#C9A667", // Light gold
  dark: "#333333",
  gray: "#666666",
  lightGray: "#f5f5f5",
  accent: "#1a5f7a", // Teal for links/CTAs
};

// Load logo as base64
async function loadLogoBase64(): Promise<string> {
  const logoPath = join(process.cwd(), "public", "logo.png");
  const bytes = await Bun.file(logoPath).bytes();
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:image/png;base64,${base64}`;
}

// Build the document definition
function buildGuideDocDefinition(logoBase64: string): TDocumentDefinitions {
  return {
    pageSize: "LETTER",
    pageMargins: [50, 50, 50, 60],

    footer: (currentPage, pageCount): Content => ({
      columns: [
        {
          text: "Desert Services LLC | 480-513-8986 | desertservices.net",
          fontSize: 8,
          color: BRAND.gray,
          margin: [50, 0, 0, 0],
        },
        {
          text: `Page ${currentPage} of ${pageCount}`,
          fontSize: 8,
          color: BRAND.gray,
          alignment: "right",
          margin: [0, 0, 50, 0],
        },
      ],
    }),

    content: [
      // Header with logo
      {
        columns: [
          {
            image: logoBase64,
            fit: [220, 55],
            width: "auto",
          },
          {
            stack: [
              {
                text: "NOI Registration Guide",
                font: "TimesNewRoman",
                fontSize: 18,
                bold: true,
                color: BRAND.dark,
                alignment: "right",
              },
              {
                text: "myDEQ Account Setup & Application",
                font: "TimesNewRoman",
                fontSize: 10,
                italics: true,
                color: BRAND.gray,
                alignment: "right",
              },
            ],
            width: "*",
          },
        ],
        margin: [0, 0, 0, 20],
      },

      // Intro paragraph
      {
        text: "This guide will walk you through the process of setting up a myDEQ account and submitting a Notice of Intent (NOI) for stormwater discharge authorization under Arizona's Construction General Permit.",
        fontSize: 10,
        lineHeight: 1.4,
        margin: [0, 0, 0, 20],
      },

      // Section 1: Account Setup
      buildSection("1. Setting Up Your myDEQ Account", [
        {
          text: "Who needs to register?",
          style: "subheading",
        },
        {
          text: "A person listed on your Arizona Corporation Commission file (the Responsible Corporate Officer, or RCO) must set up the myDEQ account. This person has the legal authority to bind the organization.",
          margin: [0, 0, 0, 12],
        },
        {
          text: "Registration Steps:",
          style: "subheading",
        },
        buildNumberedList([
          "Go to azdeq.gov/mydeq",
          "Click \"Request Account\"",
          "Verify your identity online (or by mail if needed)",
          "Choose a password and security questions",
          "Authorize additional users if needed (see User Roles below)",
        ]),
        // User Roles quick reference
        {
          table: {
            widths: ["*"],
            body: [
              [
                {
                  stack: [
                    {
                      text: "User Roles at a Glance",
                      fontSize: 10,
                      bold: true,
                      margin: [0, 0, 0, 6],
                    },
                    {
                      columns: [
                        {
                          width: "50%",
                          stack: [
                            {
                              text: [
                                { text: "RCO ", bold: true, fontSize: 8 },
                                { text: "(Responsible Corporate Officer)", fontSize: 7, italics: true },
                              ],
                            },
                            { text: "Main account holder. Has legal authority to bind the organization.", fontSize: 8, margin: [0, 2, 0, 6] },
                            {
                              text: [
                                { text: "DRO ", bold: true, fontSize: 8 },
                                { text: "(Delegated Responsible Officer)", fontSize: 7, italics: true },
                              ],
                            },
                            { text: "Acts on RCO's behalf. Requires notarized Signature Agreement.", fontSize: 8, margin: [0, 2, 0, 0] },
                          ],
                        },
                        {
                          width: "50%",
                          stack: [
                            { text: "Submitter", bold: true, fontSize: 8 },
                            { text: "Submits compliance reports. Requires notarized Signature Agreement.", fontSize: 8, margin: [0, 2, 0, 6] },
                            { text: "Data Entry", bold: true, fontSize: 8 },
                            { text: "Prepares data for others to submit. Cannot submit directly to ADEQ.", fontSize: 8, margin: [0, 2, 0, 0] },
                          ],
                        },
                      ],
                      columnGap: 15,
                    },
                  ],
                  fillColor: BRAND.lightGray,
                  margin: [10, 8, 10, 8],
                },
              ],
            ],
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => "#ccc",
            vLineColor: () => "#ccc",
          },
          margin: [0, 8, 0, 12],
        },
        {
          text: [
            { text: "Official How-To Video: ", bold: true },
            {
              text: "youtu.be/HRNeNMGPvvQ",
              link: "https://www.youtube.com/watch?v=HRNeNMGPvvQ",
              color: BRAND.accent,
              decoration: "underline",
            },
          ],
          margin: [0, 0, 0, 0],
        },
      ]),

      // Section 2: Applying for the NOI
      buildSection("2. Applying for the NOI", [
        {
          text: "Once your account is set up, follow these best practices when applying:",
          margin: [0, 0, 0, 12],
        },
        buildBulletList([
          {
            text: [
              { text: "Select the correct permit type: ", bold: true },
              "Choose \"General Construction Permit (NOI/NDC)\"",
            ],
          },
          {
            text: [
              { text: "Water discharge question: ", bold: true },
              "When asked if water will run off the site into US tributary waters, select ",
              { text: "YES", bold: true },
              ". Selecting \"No\" or \"Unknown\" generates an NDC certificate, which must be canceled before you can reapply for the NOI.",
            ],
          },
          {
            text: [
              { text: "Discharge location: ", bold: true },
              "Use the overlay map to place your cursor on the lowest point of the job site where water runoff could occur. The system will generate the latitude/longitude coordinates.",
            ],
          },
          {
            text: [
              { text: "MS4 selection: ", bold: true },
              "Select the city where the job site is located.",
            ],
          },
          {
            text: [
              { text: "Receiving water body: ", bold: true },
              "Enter the name of the nearest body of water. If unknown, use the dropdown menu to select \"Unknown\" or \"Unnamed.\"",
            ],
          },
          {
            text: [
              { text: "SWPPP review: ", bold: true },
              "You will NOT need to have the SWPPP reviewed through myDEQ.",
            ],
          },
          {
            text: [
              { text: "Site contact information: ", bold: true },
              "Provide the name, phone number, and email for the superintendent or person responsible for the site on a daily basis.",
            ],
          },
        ]),
      ]),

      // Section 3: Need Help?
      buildSection("3. Need Help?", [
        {
          columns: [
            // Left: myDEQ Technical Support
            {
              width: "48%",
              table: {
                widths: ["*"],
                body: [
                  [
                    {
                      stack: [
                        {
                          text: "myDEQ Technical Support",
                          fontSize: 10,
                          bold: true,
                          margin: [0, 0, 0, 6],
                        },
                        { text: [{ text: "Phone: ", bold: true, fontSize: 9 }, { text: "844-827-4768", fontSize: 9 }], margin: [0, 0, 0, 3] },
                        { text: [{ text: "Email: ", bold: true, fontSize: 9 }, { text: "myDEQ.support@azdeq.gov", fontSize: 9, color: BRAND.accent }], margin: [0, 0, 0, 3] },
                        { text: [{ text: "Web: ", bold: true, fontSize: 9 }, { text: "azdeq.gov/mydeq", fontSize: 9, color: BRAND.accent }] },
                      ],
                      fillColor: BRAND.lightGray,
                      margin: [10, 10, 10, 10],
                    },
                  ],
                ],
              },
              layout: {
                hLineWidth: () => 1,
                vLineWidth: () => 1,
                hLineColor: () => "#ddd",
                vLineColor: () => "#ddd",
              },
            },
            // Right: Desert Services
            {
              width: "48%",
              table: {
                widths: ["*"],
                body: [
                  [
                    {
                      stack: [
                        {
                          text: "Desert Services",
                          fontSize: 10,
                          bold: true,
                          color: BRAND.primary,
                          margin: [0, 0, 0, 6],
                        },
                        { text: [{ text: "Office: ", bold: true, fontSize: 9 }, { text: "480-513-8986", fontSize: 9 }], margin: [0, 0, 0, 3] },
                        { text: [{ text: "Contact: ", bold: true, fontSize: 9 }, { text: "Jayson Roti", fontSize: 9 }], margin: [0, 0, 0, 3] },
                        { text: [{ text: "Cell: ", bold: true, fontSize: 9 }, { text: "602-722-0218", fontSize: 9 }] },
                      ],
                      fillColor: BRAND.lightGray,
                      margin: [10, 10, 10, 10],
                    },
                  ],
                ],
              },
              layout: {
                hLineWidth: () => 2,
                vLineWidth: () => 2,
                hLineColor: () => BRAND.primary,
                vLineColor: () => BRAND.primary,
              },
            },
          ],
          columnGap: 15,
        },
      ]),

      // Source attribution
      {
        text: [
          "User role definitions from ADEQ Publication TM-18-28. Visit ",
          {
            text: "azdeq.gov/mydeq",
            color: BRAND.accent,
            decoration: "underline",
          },
          " for more information.",
        ],
        fontSize: 8,
        color: BRAND.gray,
        margin: [0, 15, 0, 0],
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
        color: BRAND.primary,
        margin: [0, 0, 0, 10],
      },
      subheading: {
        fontSize: 11,
        bold: true,
        color: BRAND.dark,
        margin: [0, 0, 0, 6],
      },
    },
  };
}

// Helper: Build a section with title and content
function buildSection(title: string, content: Content[]): Content {
  return {
    stack: [
      { text: title, style: "sectionTitle" },
      ...content,
    ],
    margin: [0, 0, 0, 20],
  };
}

// Helper: Build numbered list
function buildNumberedList(items: string[]): Content {
  return {
    ol: items.map((item) => ({
      text: item,
      margin: [0, 0, 0, 4] as [number, number, number, number],
    })),
    margin: [0, 0, 0, 10] as [number, number, number, number],
  };
}

// Helper: Build bullet list
function buildBulletList(items: Content[]): Content {
  return {
    ul: items.map((item) => ({
      ...item,
      margin: [0, 0, 0, 8] as [number, number, number, number],
    })),
    margin: [0, 0, 0, 10] as [number, number, number, number],
  };
}

// Helper: Build role info box
function buildRoleBox(
  title: string,
  description: string,
  responsibilities: string[]
): Content {
  return {
    table: {
      widths: ["*"],
      body: [
        [
          {
            stack: [
              {
                text: title,
                fontSize: 11,
                bold: true,
                color: BRAND.primary,
                margin: [0, 0, 0, 4],
              },
              {
                text: description,
                fontSize: 9,
                italics: true,
                color: BRAND.gray,
                margin: [0, 0, 0, 8],
              },
              {
                ul: responsibilities.map((r) => ({
                  text: r,
                  fontSize: 9,
                  margin: [0, 0, 0, 2] as [number, number, number, number],
                })),
              },
            ],
            margin: [12, 10, 12, 10],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 1,
      vLineWidth: () => 1,
      hLineColor: () => "#ddd",
      vLineColor: () => "#ddd",
    },
    margin: [0, 0, 0, 12] as [number, number, number, number],
  };
}

// Generate the PDF
export async function generateMyDEQGuide(
  outputPath?: string
): Promise<Uint8Array> {
  const logoBase64 = await loadLogoBase64();
  const docDefinition = buildGuideDocDefinition(logoBase64);

  const buffer = await pdfmake.createPdf(docDefinition).getBuffer();

  if (outputPath) {
    await Bun.write(outputPath, buffer);
    console.log(`PDF saved to: ${outputPath}`);
  }

  return buffer;
}

// CLI: Run directly to generate PDF
if (import.meta.main) {
  const outputPath =
    process.argv[2] ||
    resolve(import.meta.dirname, "../../files-for-work-all/myDEQ-NOI-Guide-Desert-Services.pdf");

  generateMyDEQGuide(outputPath)
    .then(() => {
      console.log("Done!");
    })
    .catch((err) => {
      console.error("Error generating PDF:", err);
      process.exit(1);
    });
}
