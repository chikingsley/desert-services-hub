import { saveSsspPDF } from "@lib/pdf/sssp/generate-sssp-pdf.server";
import type { SsspDocument, SsspSection } from "@lib/pdf/sssp/types";
import { z } from "zod";

export interface SsspGenerateOverrides {
  sections?: SsspSection[];
}

const ssspSectionSchema = z.enum([
  "water-truck",
  "street-sweeping",
  "portable-sanitation",
]);

const ssspContactSchema = z
  .object({
    role: z.string().trim().min(1),
    name: z.string().trim().min(1),
    phone: z.string().trim().min(1),
    email: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  })
  .strict();

const ssspScopeItemSchema = z
  .object({
    title: z.string().trim().min(1),
    details: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

const ssspInputSchema = z
  .object({
    title: z.string().optional(),
    revision: z.string().optional(),
    date: z.string().optional(),
    preparedBy: z.string().optional(),
    approvedBy: z.string().optional(),

    projectName: z.string().trim().min(1),
    projectAddress: z.string().trim().min(1),
    projectCode: z.string().optional(),
    jobNumber: z.string().optional(),
    gcName: z.string().optional(),
    ownerName: z.string().optional(),
    startDate: z.string().optional(),
    duration: z.string().optional(),
    workHours: z.string().optional(),

    scopeOfWork: z.string().optional(),
    scopeItems: z.array(ssspScopeItemSchema).optional(),
    sections: z.array(ssspSectionSchema).optional(),
    includeWaterTruckSection: z
      .union([z.boolean(), z.literal("auto")])
      .optional(),
    includeStreetSweepingSection: z
      .union([z.boolean(), z.literal("auto")])
      .optional(),
    includePortableSanitationSection: z
      .union([z.boolean(), z.literal("auto")])
      .optional(),

    contacts: z.array(ssspContactSchema).min(5),
  })
  .passthrough();

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

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
