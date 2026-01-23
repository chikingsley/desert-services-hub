/**
 * Extract All - Full extraction pipeline
 *
 * 1. Triage folder to classify docs
 * 2. Extract data from each relevant doc
 * 3. Merge into single permit object
 * 4. Report what we got vs what's missing
 */

import { GoogleGenAI } from "@google/genai";
import { PDFDocument } from "pdf-lib";
import { type TriageResult, triageDocument } from "./smart-triage.js";

const JINA_API_KEY = process.env.JINA_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/** KB per page threshold - above this is likely a drawing */
const DRAWING_THRESHOLD_KB_PER_PAGE = 500;

/** Maximum pages to extract for processing */
const MAX_PAGES_FOR_EXTRACTION = 3;

/** Minimum text length to consider extraction successful */
const MIN_TEXT_LENGTH = 100;

/** Maximum text length to send to Gemini */
const MAX_TEXT_FOR_EXTRACTION = 4000;

export interface PermitData {
  // From NOI/NDC
  permitId?: string;
  siteAddress?: string;
  siteCity?: string;
  siteZip?: string;
  latitude?: number;
  longitude?: number;
  operatorName?: string;
  operatorAddress?: string;
  contactFirstName?: string;
  contactLastName?: string;
  contactPhone?: string;
  contactEmail?: string;
  acresDisturbed?: number;
  projectName?: string;

  // From SWPPP
  siteContactName?: string;
  siteContactPhone?: string;
  siteContactEmail?: string;
  waterSources?: string;
  waterMethods?: string;
  stabilizationMethods?: string;
  estimatedStartDate?: string;
  estimatedEndDate?: string;

  // From Grading/Civil
  cutVolumeYards?: number;
  fillVolumeYards?: number;
  totalEarthworkYards?: number;
  gradingAreaAcres?: number;
  hasMassGrading?: boolean;
  hasFineGrading?: boolean;
  numberOfPhases?: number;

  // From Geotech
  soilTexture?: string;
  soilDescription?: string;
  groundwaterDepth?: number;

  // Metadata
  _sources?: Record<string, string[]>;
}

const EXCLUDED_CONTACT_DOMAINS = ["desertservices.com"];

const CONTACT_FIELDS = [
  "contactEmail",
  "contactPhone",
  "contactFirstName",
  "contactLastName",
  "siteContactEmail",
  "siteContactPhone",
  "siteContactName",
];

const WANTED_FIELDS = [
  "permitId",
  "siteAddress",
  "siteCity",
  "siteZip",
  "latitude",
  "longitude",
  "operatorName",
  "contactFirstName",
  "contactLastName",
  "contactPhone",
  "contactEmail",
  "acresDisturbed",
  "projectName",
  "waterSources",
  "waterMethods",
  "stabilizationMethods",
  "cutVolumeYards",
  "fillVolumeYards",
  "soilTexture",
  "estimatedStartDate",
  "estimatedEndDate",
];

function isExcludedContact(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const lower = value.toLowerCase();
  return EXCLUDED_CONTACT_DOMAINS.some((domain) => lower.includes(domain));
}

async function extractFirstPages(pdfPath: string): Promise<Uint8Array> {
  const file = Bun.file(pdfPath);
  const buffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buffer);

  const newPdf = await PDFDocument.create();
  const maxPages = Math.min(MAX_PAGES_FOR_EXTRACTION, pdfDoc.getPageCount());
  const pageIndices = Array.from({ length: maxPages }, (_, i) => i);
  const pages = await newPdf.copyPages(pdfDoc, pageIndices);

  for (const page of pages) {
    newPdf.addPage(page);
  }

  return newPdf.save();
}

async function extractTextWithJina(pdfPath: string): Promise<string> {
  const file = Bun.file(pdfPath);
  const buffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buffer);
  const kbPerPage = file.size / 1024 / pdfDoc.getPageCount();

  if (kbPerPage > DRAWING_THRESHOLD_KB_PER_PAGE) {
    return "";
  }

  const pdfBytes = await extractFirstPages(pdfPath);
  const base64 = Buffer.from(pdfBytes).toString("base64");
  const fileName = pdfPath.split("/").pop() ?? "document.pdf";

  const response = await fetch("https://r.jina.ai/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${JINA_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      pdf: base64,
      url: `https://local.file/${fileName}`,
    }),
  });

  if (response.ok === false) {
    return "";
  }

  const data = (await response.json()) as { data?: { content?: string } };
  return data?.data?.content ?? "";
}

function getFieldsPromptForDocType(docType: string): string {
  switch (docType) {
    case "NOI_NDC":
      return `
        - permitId: AZC or permit number
        - siteAddress: street address
        - siteCity, siteZip
        - latitude, longitude (decimal degrees)
        - operatorName: company name
        - operatorAddress
        - contactFirstName, contactLastName
        - contactPhone, contactEmail
        - acresDisturbed: total acres
        - projectName`;

    case "SWPPP":
      return `
        - projectName
        - siteAddress
        - waterSources: where water comes from (hydrant, truck, etc)
        - waterMethods: how water is applied
        - stabilizationMethods: dust control methods
        - estimatedStartDate, estimatedEndDate
        - acresDisturbed`;

    case "GRADING_PLAN":
      return `
        - projectName
        - cutVolumeYards: cubic yards of cut
        - fillVolumeYards: cubic yards of fill
        - totalEarthworkYards: total cubic yards
        - gradingAreaAcres: acres to be graded
        - hasMassGrading: true/false
        - hasFineGrading: true/false
        - numberOfPhases`;

    case "GEOTECH_REPORT":
      return `
        - projectName
        - soilTexture: classify as "Severe", "Moderate", or "Other"
        - soilDescription: general soil description
        - groundwaterDepth: depth to groundwater in feet`;

    case "SITE_PLAN":
      return `
        - projectName
        - siteAddress
        - acresDisturbed: total site acreage
        - gradingAreaAcres`;

    default:
      return `
        - projectName
        - siteAddress
        - any contact information
        - any acreage or cubic yard quantities`;
  }
}

async function extractWithVision(
  ai: GoogleGenAI,
  pdfPath: string,
  prompt: string
) {
  const pdfBytes = await extractFirstPages(pdfPath);
  const base64 = Buffer.from(pdfBytes).toString("base64");

  return ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        parts: [
          { inlineData: { mimeType: "application/pdf", data: base64 } },
          { text: prompt },
        ],
      },
    ],
    config: { responseMimeType: "application/json" },
  });
}

function extractWithText(ai: GoogleGenAI, text: string, prompt: string) {
  const truncatedText = text.slice(0, MAX_TEXT_FOR_EXTRACTION);

  return ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ text: `${prompt}\n\nDocument text:\n${truncatedText}` }],
    config: { responseMimeType: "application/json" },
  });
}

async function extractFromDocument(
  pdfPath: string,
  docType: string
): Promise<Partial<PermitData>> {
  if (GEMINI_API_KEY === undefined) {
    throw new Error("GEMINI_API_KEY is required");
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const text = await extractTextWithJina(pdfPath);
  const useVision = text.length < MIN_TEXT_LENGTH;
  const fieldsToExtract = getFieldsPromptForDocType(docType);

  const prompt = `Extract the following fields from this ${docType} document. Return JSON with only the fields you can find. Use null for missing fields.

Fields to extract:
${fieldsToExtract}

Return valid JSON only.`;

  const response = useVision
    ? await extractWithVision(ai, pdfPath, prompt)
    : await extractWithText(ai, text, prompt);

  try {
    return JSON.parse(response.text ?? "{}");
  } catch {
    return {};
  }
}

function isContactFieldFromNonNoi(key: string, docType: string): boolean {
  if (CONTACT_FIELDS.includes(key) === false) {
    return false;
  }
  if (docType === "NOI_NDC") {
    return false;
  }
  return true;
}

function checkForExcludedContact(
  docType: string,
  contactEmail: string | undefined
): boolean {
  if (docType !== "NOI_NDC") {
    return false;
  }
  if (contactEmail === undefined) {
    return false;
  }
  return isExcludedContact(contactEmail);
}

interface MergeContext {
  mergedData: PermitData;
  sources: Record<string, string>;
  fileName: string;
}

function addFieldToMergedData(
  ctx: MergeContext,
  key: string,
  value: unknown
): void {
  const k = key as keyof PermitData;

  if (ctx.mergedData[k] !== undefined) {
    return;
  }

  (ctx.mergedData as Record<string, unknown>)[k] = value;
  ctx.sources[k] = ctx.fileName;

  if (ctx.mergedData._sources === undefined) {
    ctx.mergedData._sources = {};
  }
  if (ctx.mergedData._sources[k] === undefined) {
    ctx.mergedData._sources[k] = [];
  }
  ctx.mergedData._sources[k].push(ctx.fileName);
}

function mergeExtractedData(
  mergedData: PermitData,
  sources: Record<string, string>,
  extracted: Partial<PermitData>,
  doc: TriageResult
): void {
  const hasExcludedContact = checkForExcludedContact(
    doc.docType,
    extracted.contactEmail
  );

  if (hasExcludedContact) {
    console.log(
      "   NOI has excluded contact domain - skipping ALL contact fields"
    );
  }

  const ctx: MergeContext = { mergedData, sources, fileName: doc.fileName };

  for (const [key, value] of Object.entries(extracted)) {
    const isEmpty = value === null || value === undefined || value === "";
    if (isEmpty) {
      continue;
    }

    const isContactFromWrongSource = isContactFieldFromNonNoi(key, doc.docType);
    if (isContactFromWrongSource) {
      console.log(
        `   Skipping ${key} from ${doc.docType} (contacts only from NOI)`
      );
      continue;
    }

    const isExcluded = hasExcludedContact && CONTACT_FIELDS.includes(key);
    if (isExcluded) {
      continue;
    }

    addFieldToMergedData(ctx, key, value);
  }
}

async function triageAllDocs(folderPath: string): Promise<TriageResult[]> {
  const glob = new Bun.Glob("**/*.pdf");
  const pdfPaths: string[] = [];

  for await (const path of glob.scan(folderPath)) {
    pdfPaths.push(`${folderPath}/${path}`);
  }

  console.log(`Found ${pdfPaths.length} PDFs\n`);
  console.log("Triaging documents...\n");

  const results: TriageResult[] = [];

  for (const pdfPath of pdfPaths) {
    const result = await triageDocument(pdfPath);
    results.push(result);

    const icon = result.relevantForDustPermit ? "[RELEVANT]" : "[SKIP]";
    const shortName = result.fileName.slice(0, 50).padEnd(50);
    console.log(`${icon} ${shortName} | ${result.docType.padEnd(15)}`);
  }

  return results;
}

export interface ExtractionResult {
  data: PermitData;
  sources: Record<string, string>;
  missingFields: string[];
  extractedDocs: string[];
  skippedDocs: string[];
}

export async function extractAllFromFolder(
  folderPath: string
): Promise<ExtractionResult> {
  console.log(`\nExtracting from: ${folderPath}\n`);

  const triageResults = await triageAllDocs(folderPath);
  const relevantDocs = triageResults.filter((r) => r.relevantForDustPermit);
  const skippedDocs = triageResults.filter(
    (r) => r.relevantForDustPermit === false
  );

  console.log(
    `\nExtracting from ${relevantDocs.length} relevant documents...\n`
  );

  const mergedData: PermitData = { _sources: {} };
  const sources: Record<string, string> = {};

  for (const doc of relevantDocs) {
    const shortName = doc.fileName.slice(0, 50);
    console.log(`   Extracting: ${shortName}...`);
    const start = Date.now();

    try {
      const extracted = await extractFromDocument(doc.filePath, doc.docType);
      console.log(`   Done (${Date.now() - start}ms)`);
      mergeExtractedData(mergedData, sources, extracted, doc);
    } catch (e) {
      console.log(`   Failed: ${e}`);
    }
  }

  const missingFields = WANTED_FIELDS.filter(
    (f) => mergedData[f as keyof PermitData] === undefined
  );

  return {
    data: mergedData,
    sources,
    missingFields,
    extractedDocs: relevantDocs.map((d) => d.fileName),
    skippedDocs: skippedDocs.map((d) => d.fileName),
  };
}

function printResults(result: ExtractionResult): void {
  console.log(`\n${"=".repeat(80)}`);
  console.log("EXTRACTION RESULTS");
  console.log("=".repeat(80));

  console.log("\nEXTRACTED DATA:\n");
  const { _sources, ...cleanData } = result.data;

  for (const [key, value] of Object.entries(cleanData)) {
    if (value === undefined) {
      continue;
    }
    const source = result.sources[key] ?? "unknown";
    console.log(`  ${key.padEnd(25)} = ${JSON.stringify(value)}`);
    console.log(`  ${"".padEnd(25)}   from: ${source.slice(0, 40)}`);
  }

  console.log(`\nMISSING FIELDS (${result.missingFields.length}):\n`);
  for (const field of result.missingFields) {
    console.log(`  - ${field}`);
  }

  console.log(`\nEXTRACTED FROM (${result.extractedDocs.length} docs):`);
  for (const doc of result.extractedDocs) {
    console.log(`  - ${doc}`);
  }

  console.log(`\nSKIPPED (${result.skippedDocs.length} docs):`);
  for (const doc of result.skippedDocs) {
    console.log(`  - ${doc}`);
  }

  console.log(`\n${"=".repeat(80)}`);

  const filled = Object.keys(cleanData).length;
  const total = filled + result.missingFields.length;
  const pct = ((filled / total) * 100).toFixed(0);
  console.log(`\nCOVERAGE: ${filled}/${total} fields (${pct}%)\n`);
}

function printUsage(): void {
  console.log(`
Extract All - Full extraction pipeline

Usage: bun services/pdf/extract-all.ts <folder>

Example:
  bun services/pdf/extract-all.ts ./pdfs/project-folder
`);
}

async function main(): Promise<void> {
  const folderPath = process.argv[2];

  if (folderPath === undefined) {
    printUsage();
    process.exit(0);
  }

  const result = await extractAllFromFolder(folderPath);
  printResults(result);
}

main().catch(console.error);
