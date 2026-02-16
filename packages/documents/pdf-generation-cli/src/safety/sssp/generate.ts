import { saveSsspPDF } from "@documents/pdf/sssp/generate-sssp-pdf.server";
import type { SsspDocument, SsspSection } from "@documents/pdf/sssp/types";
import { z } from "zod";
import { formatZodError } from "../../common";

export interface SsspGenerateOverrides {
  sections?: SsspSection[];
}

const SSSP_SECTION_NAMES = [
  "water-truck",
  "street-sweeping",
  "portable-sanitation",
] satisfies SsspSection[];

export function parseSsspSectionsOverride(raw: string): SsspSection[] {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    throw new Error(
      `Invalid --sections value. Allowed values: ${SSSP_SECTION_NAMES.join(", ")}, all`
    );
  }

  if (normalized === "all") {
    return [...SSSP_SECTION_NAMES];
  }

  if (normalized === "none" || normalized === "auto") {
    throw new Error(
      `Invalid --sections value ${normalized}. Use all or a comma list of: ${SSSP_SECTION_NAMES.join(", ")}`
    );
  }

  const tokens = normalized
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  const valid = new Set<SsspSection>(SSSP_SECTION_NAMES);
  const selected: SsspSection[] = [];

  for (const token of tokens) {
    if (!valid.has(token as SsspSection)) {
      throw new Error(
        `Invalid section ${token}. Allowed values: ${SSSP_SECTION_NAMES.join(", ")}, all`
      );
    }
    const section = token as SsspSection;
    if (!selected.includes(section)) {
      selected.push(section);
    }
  }

  if (selected.length < 1) {
    throw new Error(
      `SSSP requires at least one section. Choose one or more of: ${SSSP_SECTION_NAMES.join(", ")}`
    );
  }

  return selected;
}

const ssspSectionSchema = z.enum([
  "water-truck",
  "street-sweeping",
  "portable-sanitation",
]);

const ssspContactSchema = z
  .object({
    email: z.string().trim().optional(),
    name: z.string().trim().min(1),
    notes: z.string().trim().optional(),
    phone: z.string().trim().min(1),
    role: z.string().trim().min(1),
  })
  .strict();

const ssspScopeItemSchema = z
  .object({
    details: z.array(z.string().trim().min(1)).min(1),
    title: z.string().trim().min(1),
  })
  .strict();

const ssspInputSchema = z
  .object({
    approvedBy: z.string().optional(),
    contacts: z.array(ssspContactSchema).min(5),
    date: z.string().optional(),
    duration: z.string().optional(),
    gcName: z.string().optional(),

    includePortableSanitationSection: z
      .union([z.boolean(), z.literal("auto")])
      .optional(),
    includeStreetSweepingSection: z
      .union([z.boolean(), z.literal("auto")])
      .optional(),
    includeWaterTruckSection: z
      .union([z.boolean(), z.literal("auto")])
      .optional(),
    jobNumber: z.string().optional(),
    ownerName: z.string().optional(),
    preparedBy: z.string().optional(),
    projectAddress: z.string().trim().min(1),
    projectCode: z.string().optional(),
    projectName: z.string().trim().min(1),

    revision: z.string().optional(),
    scopeItems: z.array(ssspScopeItemSchema).optional(),
    scopeOfWork: z.string().optional(),
    sections: z.array(ssspSectionSchema).optional(),
    startDate: z.string().optional(),
    title: z.string().optional(),

    workHours: z.string().optional(),
  })
  .passthrough();

function deriveSectionsFromLegacyFields(doc: SsspDocument): SsspSection[] {
  const sections: SsspSection[] = [];
  if (doc.includeWaterTruckSection === true) {
    sections.push("water-truck");
  }
  if (doc.includeStreetSweepingSection === true) {
    sections.push("street-sweeping");
  }
  if (doc.includePortableSanitationSection === true) {
    sections.push("portable-sanitation");
  }
  return sections;
}

function ensureAtLeastOneSection(doc: SsspDocument): void {
  if (doc.sections && doc.sections.length > 0) {
    return;
  }

  const derived = deriveSectionsFromLegacyFields(doc);
  if (derived.length > 0) {
    doc.sections = derived;
    return;
  }

  throw new Error(
    "SSSP must include at least one service section. Set sections in JSON or pass --sections with one or more of: water-truck, street-sweeping, portable-sanitation."
  );
}

export async function generatePdf(
  inputJsonPath: string,
  outputPdfPath: string,
  overrides: SsspGenerateOverrides = {}
): Promise<void> {
  const json = await Bun.file(inputJsonPath).text();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(json);
  } catch {
    throw new Error(`Invalid JSON in ${inputJsonPath}`);
  }

  const parsed = ssspInputSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error(`Invalid SSSP input JSON: ${formatZodError(parsed.error)}`);
  }

  const doc = parsed.data as SsspDocument;

  if (overrides.sections !== undefined) {
    doc.sections = overrides.sections;
  }

  ensureAtLeastOneSection(doc);

  await saveSsspPDF(doc, outputPdfPath);
}
