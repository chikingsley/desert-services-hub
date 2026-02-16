import type { Content, ContentTable } from "pdfmake/interfaces";
import { COLORS } from "../shared/brand";
import { borderedLayout } from "../shared/layouts";
import type { SsspDocument, SsspScopeItem, SsspSection } from "./types";

const MULTILINE_SPLIT_RE = /\r?\n/;

export interface SsspBodyContext {
  doc: SsspDocument;
  gcName: string;
  partnerName: string;
  scopeItems: SsspScopeItem[];
  includesWaterTruck: boolean;
  includesStreetSweeping: boolean;
  includesPortableSanitation: boolean;
  listIndent: number;
}

export function pageTitle(text: string): Content {
  return {
    text,
    bold: true,
    fontSize: 12,
    margin: [0, 0, 0, 8],
  };
}

export function label(text: string, marginBottom = 4): Content {
  return {
    text,
    bold: true,
    margin: [0, 0, 0, marginBottom],
  };
}

export function paragraph(text: string, marginBottom = 10): Content {
  return {
    text,
    margin: [0, 0, 0, marginBottom],
    lineHeight: 1.15,
  };
}

export function scopeItemsOrFallback(doc: SsspDocument): SsspScopeItem[] {
  if (doc.scopeItems && doc.scopeItems.length > 0) {
    return doc.scopeItems;
  }
  const scope = (doc.scopeOfWork ?? "").trim();
  if (!scope) {
    return [];
  }
  return [{ title: "Scope of Work:", details: [scope] }];
}

export function scopeBlobForHeuristics(scopeItems: SsspScopeItem[]): string {
  return scopeItems
    .map((s) => [s.title, ...(s.details ?? [])].join(" "))
    .join(" ")
    .toLowerCase();
}

export function resolveSectionVisibility(
  override: boolean | "auto" | undefined,
  inferred: boolean
): boolean {
  if (override === undefined || override === "auto") {
    return inferred;
  }
  return override;
}

export function normalizeExplicitSections(
  sections: SsspDocument["sections"]
): Set<SsspSection> | undefined {
  if (sections === undefined) {
    return undefined;
  }

  const valid = new Set<SsspSection>([
    "water-truck",
    "street-sweeping",
    "portable-sanitation",
  ]);
  const selected = new Set<SsspSection>();

  for (const section of sections) {
    if (valid.has(section)) {
      selected.add(section);
    }
  }

  return selected;
}

export function emergencyContactsTable(doc: SsspDocument): ContentTable {
  const cellMargin: [number, number, number, number] = [6, 6, 6, 6];
  const emptyMargin: [number, number, number, number] = [6, 16, 6, 16];
  const nameLineMargin: [number, number, number, number] = [0, 0, 0, 2];

  const rows: ContentTable["table"]["body"] = (doc.contacts ?? []).map((c) => {
    const name = (c.name ?? "").trim();
    const email = (c.email ?? "").trim();
    const phoneLines = (c.phone ?? "")
      .split(MULTILINE_SPLIT_RE)
      .map((s) => s.trim())
      .filter(Boolean);
    const phoneStack: Content[] = phoneLines.length
      ? phoneLines.map((line, i) => ({
          text: line,
          noWrap: true,
          margin: [0, 0, 0, i < phoneLines.length - 1 ? 2 : 0] as [
            number,
            number,
            number,
            number,
          ],
        }))
      : [{ text: "", noWrap: true }];

    return [
      { text: c.role ?? "", margin: cellMargin },
      {
        stack: [
          { text: name, margin: nameLineMargin },
          ...(email
            ? [
                {
                  text: email,
                  fontSize: 10,
                  color: COLORS.mutedForeground,
                } as Content,
              ]
            : []),
        ],
        margin: cellMargin,
      },
      {
        stack: phoneStack,
        margin: cellMargin,
      },
      { text: (c.notes ?? "").trim(), margin: cellMargin },
    ];
  });

  return {
    fontSize: 10,
    table: {
      widths: [70, 140, "auto", "*"],
      body: [
        [
          { text: "Role", bold: true, margin: cellMargin },
          { text: "Contact Name", bold: true, margin: cellMargin },
          { text: "Phone Number", bold: true, margin: cellMargin },
          { text: "Notes", bold: true, margin: cellMargin },
        ],
        ...(rows.length > 0
          ? rows
          : ([
              [
                { text: "", margin: emptyMargin },
                { text: "", margin: emptyMargin },
                { text: "", margin: emptyMargin },
                { text: "", margin: emptyMargin },
              ],
            ] as ContentTable["table"]["body"])),
      ],
    },
    layout: borderedLayout,
  };
}
