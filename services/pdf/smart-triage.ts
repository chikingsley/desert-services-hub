/**
 * Smart Document Triage
 *
 * Strategy:
 * 1. Try filename first (88.5% accurate, free)
 * 2. If low confidence, check if PDF is a drawing (image-based) or text
 * 3. For drawings, use Gemini vision; for text, extract with Jina then classify
 */

import { GoogleGenAI } from "@google/genai";
import { PDFDocument } from "pdf-lib";

const JINA_API_KEY = process.env.JINA_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/** KB per page threshold - above this is likely a drawing/image-based PDF */
const DRAWING_THRESHOLD_KB_PER_PAGE = 500;

/** Minimum text length to consider extraction successful */
const MIN_TEXT_LENGTH = 100;

/** Maximum pages to extract for classification */
const MAX_PAGES_FOR_CLASSIFICATION = 3;

/** Maximum text length to send to Gemini */
const MAX_TEXT_FOR_CLASSIFICATION = 2500;

export type DocType =
  | "NOI_NDC"
  | "SWPPP"
  | "GRADING_PLAN"
  | "GEOTECH_REPORT"
  | "SPECIFICATIONS"
  | "UTILITY_PLAN"
  | "SITE_PLAN"
  | "STRUCTURAL"
  | "PERMIT_APP"
  | "LANDSCAPE"
  | "OTHER";

const DOC_TYPES: DocType[] = [
  "NOI_NDC",
  "SWPPP",
  "GRADING_PLAN",
  "GEOTECH_REPORT",
  "SPECIFICATIONS",
  "UTILITY_PLAN",
  "SITE_PLAN",
  "STRUCTURAL",
  "PERMIT_APP",
  "LANDSCAPE",
  "OTHER",
];

export interface TriageResult {
  filePath: string;
  fileName: string;
  docType: DocType;
  confidence: number;
  method: "filename" | "gemini";
  timeMs: number;
  relevantForDustPermit: boolean;
  relevantForSwpppTakeoff: boolean;
}

const DUST_PERMIT_TYPES: DocType[] = [
  "NOI_NDC",
  "SWPPP",
  "GRADING_PLAN",
  "GEOTECH_REPORT",
  "SPECIFICATIONS",
  "SITE_PLAN",
];

const SWPPP_TAKEOFF_TYPES: DocType[] = [
  "SWPPP",
  "GRADING_PLAN",
  "SITE_PLAN",
  "SPECIFICATIONS",
];

interface FilenamePattern {
  pattern: RegExp;
  docType: DocType;
  confidence: number;
}

const FILENAME_PATTERNS: FilenamePattern[] = [
  // High confidence patterns
  {
    pattern: /noi.*certificate|ndc|azc\d+|cgp\d+/i,
    docType: "NOI_NDC",
    confidence: 0.95,
  },
  { pattern: /swppp|swmp|stormwater.*p/i, docType: "SWPPP", confidence: 0.95 },
  {
    pattern: /geotech|geo.*report|soils.*report|boring/i,
    docType: "GEOTECH_REPORT",
    confidence: 0.95,
  },
  {
    pattern: /structural.*calc|calculation/i,
    docType: "STRUCTURAL",
    confidence: 0.95,
  },
  { pattern: /landscape/i, docType: "LANDSCAPE", confidence: 0.9 },
  { pattern: /issued.*permit/i, docType: "PERMIT_APP", confidence: 0.9 },

  // Medium confidence patterns
  {
    pattern: /grading|g&d|earthwork/i,
    docType: "GRADING_PLAN",
    confidence: 0.8,
  },
  { pattern: /civil.*plan/i, docType: "GRADING_PLAN", confidence: 0.7 },
  {
    pattern: /sewer.*plan|water.*plan|hydrant|utility/i,
    docType: "UTILITY_PLAN",
    confidence: 0.8,
  },
  {
    pattern: /spec(?:ification)?s?(?:\s|\.|-|$)/i,
    docType: "SPECIFICATIONS",
    confidence: 0.7,
  },
  { pattern: /site.*plan|stockpile/i, docType: "SITE_PLAN", confidence: 0.7 },

  // Lower confidence
  { pattern: /permit/i, docType: "PERMIT_APP", confidence: 0.6 },
  { pattern: /plan.*set|drawing/i, docType: "SITE_PLAN", confidence: 0.5 },
];

interface PdfInfo {
  pageCount: number;
  kbPerPage: number;
  isDrawing: boolean;
}

async function getPdfInfo(pdfPath: string): Promise<PdfInfo> {
  const file = Bun.file(pdfPath);
  const buffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(buffer);
  const pageCount = pdf.getPageCount();
  const kbPerPage = file.size / 1024 / pageCount;

  return {
    pageCount,
    kbPerPage,
    isDrawing: kbPerPage > DRAWING_THRESHOLD_KB_PER_PAGE,
  };
}

function classifyByFilename(filePath: string): {
  docType: DocType;
  confidence: number;
} {
  const fileName = filePath.split("/").pop()?.toLowerCase() ?? "";

  for (const { pattern, docType, confidence } of FILENAME_PATTERNS) {
    if (pattern.test(fileName)) {
      return { docType, confidence };
    }
  }

  return { docType: "OTHER", confidence: 0.3 };
}

async function extractFirstPages(
  pdfPath: string,
  maxPages: number
): Promise<Uint8Array> {
  const file = Bun.file(pdfPath);
  const buffer = await file.arrayBuffer();

  const TWO_MB = 2 * 1024 * 1024;
  if (file.size < TWO_MB) {
    return new Uint8Array(buffer);
  }

  const pdfDoc = await PDFDocument.load(buffer);
  const pageCount = pdfDoc.getPageCount();

  if (pageCount <= maxPages) {
    return new Uint8Array(buffer);
  }

  const newPdf = await PDFDocument.create();
  const pageIndices = Array.from({ length: maxPages }, (_, i) => i);
  const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);

  for (const page of copiedPages) {
    newPdf.addPage(page);
  }

  return newPdf.save();
}

async function extractTextWithJina(pdfPath: string): Promise<string> {
  const pdfBytes = await extractFirstPages(
    pdfPath,
    MAX_PAGES_FOR_CLASSIFICATION
  );
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
    throw new Error(`Jina failed: ${response.status}`);
  }

  const data = (await response.json()) as { data?: { content?: string } };
  const content = data?.data?.content ?? "";
  return content.slice(0, 3000);
}

function buildGeminiResponseSchema() {
  return {
    type: "OBJECT" as const,
    properties: {
      documentType: { type: "STRING" as const, enum: DOC_TYPES },
      confidence: { type: "NUMBER" as const },
    },
  };
}

async function classifyWithGemini(
  text: string
): Promise<{ docType: DocType; confidence: number }> {
  if (GEMINI_API_KEY === undefined) {
    throw new Error("GEMINI_API_KEY is required");
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const prompt = `Classify this construction document. Return the type and confidence.

Document types:
- NOI_NDC: Notice of Intent, ADEQ certificate, AZC permit number
- SWPPP: Stormwater Pollution Prevention Plan
- GRADING_PLAN: Grading, civil, earthwork drawings
- GEOTECH_REPORT: Geotechnical, soils report
- SPECIFICATIONS: Project specs document
- UTILITY_PLAN: Water, sewer, fire hydrant plans
- SITE_PLAN: General site layout
- STRUCTURAL: Structural calculations
- PERMIT_APP: Issued permit document
- LANDSCAPE: Landscape plan
- OTHER: Unknown

Text:
${text.slice(0, MAX_TEXT_FOR_CLASSIFICATION)}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: buildGeminiResponseSchema(),
    },
  });

  const result = JSON.parse(response.text ?? "{}");
  return {
    docType: result.documentType ?? "OTHER",
    confidence: result.confidence ?? 0.5,
  };
}

async function classifyDrawingWithGemini(
  pdfPath: string
): Promise<{ docType: DocType; confidence: number }> {
  if (GEMINI_API_KEY === undefined) {
    throw new Error("GEMINI_API_KEY is required");
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const file = Bun.file(pdfPath);
  const buffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buffer);

  const newPdf = await PDFDocument.create();
  const [page] = await newPdf.copyPages(pdfDoc, [0]);
  newPdf.addPage(page);
  const pdfBytes = await newPdf.save();
  const base64 = Buffer.from(pdfBytes).toString("base64");

  const prompt = `Classify this construction drawing. Return JSON with documentType and confidence.

Types: NOI_NDC, SWPPP, GRADING_PLAN, GEOTECH_REPORT, SPECIFICATIONS, UTILITY_PLAN, SITE_PLAN, STRUCTURAL, PERMIT_APP, LANDSCAPE, OTHER`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        parts: [
          { inlineData: { mimeType: "application/pdf", data: base64 } },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: buildGeminiResponseSchema(),
    },
  });

  const result = JSON.parse(response.text ?? "{}");
  return {
    docType: result.documentType ?? "OTHER",
    confidence: result.confidence ?? 0.5,
  };
}

interface TriageResultInput {
  pdfPath: string;
  docType: DocType;
  confidence: number;
  method: "filename" | "gemini";
  startTime: number;
}

function buildTriageResult(input: TriageResultInput): TriageResult {
  const { pdfPath, docType, confidence, method, startTime } = input;
  const fileName = pdfPath.split("/").pop() ?? pdfPath;

  return {
    filePath: pdfPath,
    fileName,
    docType,
    confidence,
    method,
    timeMs: Date.now() - startTime,
    relevantForDustPermit: DUST_PERMIT_TYPES.includes(docType),
    relevantForSwpppTakeoff: SWPPP_TAKEOFF_TYPES.includes(docType),
  };
}

export interface TriageOptions {
  forceGemini?: boolean;
}

/**
 * Triage a single document.
 * Uses filename first, falls back to Gemini if uncertain.
 * Handles drawings (image PDFs) vs text PDFs differently.
 */
export async function triageDocument(
  pdfPath: string,
  options: TriageOptions = {}
): Promise<TriageResult> {
  const start = Date.now();
  const filenameResult = classifyByFilename(pdfPath);

  const hasHighConfidence = filenameResult.confidence >= 0.8;
  const shouldUseFilename = hasHighConfidence && options.forceGemini !== true;

  if (shouldUseFilename) {
    return buildTriageResult({
      pdfPath,
      docType: filenameResult.docType,
      confidence: filenameResult.confidence,
      method: "filename",
      startTime: start,
    });
  }

  try {
    const pdfInfo = await getPdfInfo(pdfPath);
    let geminiResult: { docType: DocType; confidence: number };

    if (pdfInfo.isDrawing) {
      console.log(
        `   Drawing detected (${pdfInfo.kbPerPage.toFixed(0)} KB/page) - using vision`
      );
      geminiResult = await classifyDrawingWithGemini(pdfPath);
    } else {
      const text = await extractTextWithJina(pdfPath);

      if (text.length < MIN_TEXT_LENGTH) {
        console.log("   No text extracted - using vision");
        geminiResult = await classifyDrawingWithGemini(pdfPath);
      } else {
        geminiResult = await classifyWithGemini(text);
      }
    }

    return buildTriageResult({
      pdfPath,
      docType: geminiResult.docType,
      confidence: geminiResult.confidence,
      method: "gemini",
      startTime: start,
    });
  } catch (error) {
    const fileName = pdfPath.split("/").pop() ?? pdfPath;
    console.error(`Classification failed for ${fileName}:`, error);

    const degradedConfidence = filenameResult.confidence * 0.5;
    return buildTriageResult({
      pdfPath,
      docType: filenameResult.docType,
      confidence: degradedConfidence,
      method: "filename",
      startTime: start,
    });
  }
}

export interface TriageFolderResult {
  results: TriageResult[];
  toExtract: TriageResult[];
  skipped: TriageResult[];
  summary: {
    total: number;
    byFilename: number;
    byGemini: number;
    totalTimeMs: number;
  };
}

/**
 * Triage all documents in a folder
 */
export async function triageFolder(
  folderPath: string,
  context: "dust_permit" | "swppp_takeoff" = "dust_permit"
): Promise<TriageFolderResult> {
  const start = Date.now();

  const glob = new Bun.Glob("**/*.pdf");
  const pdfPaths: string[] = [];

  for await (const path of glob.scan(folderPath)) {
    pdfPaths.push(`${folderPath}/${path}`);
  }

  console.log(`\nTriaging ${pdfPaths.length} documents for ${context}...\n`);

  const results: TriageResult[] = [];
  let byFilename = 0;
  let byGemini = 0;

  for (const pdfPath of pdfPaths) {
    const result = await triageDocument(pdfPath);
    results.push(result);

    if (result.method === "filename") {
      byFilename += 1;
    } else {
      byGemini += 1;
    }

    const isRelevant =
      context === "dust_permit"
        ? result.relevantForDustPermit
        : result.relevantForSwpppTakeoff;

    const icon = isRelevant ? "[RELEVANT]" : "[SKIP]";
    const shortName = result.fileName.slice(0, 50).padEnd(50);
    const confidencePercent = (result.confidence * 100).toFixed(0);

    console.log(
      `${icon} ${shortName} | ${result.docType.padEnd(15)} | ${confidencePercent}% | ${result.method} | ${result.timeMs}ms`
    );
  }

  const relevantKey =
    context === "dust_permit"
      ? "relevantForDustPermit"
      : "relevantForSwpppTakeoff";
  const toExtract = results.filter((r) => r[relevantKey]);
  const skipped = results.filter((r) => r[relevantKey] === false);

  console.log(`\n${"=".repeat(80)}`);
  console.log("TRIAGE SUMMARY");
  console.log("=".repeat(80));
  console.log(`   Total: ${results.length}`);
  console.log(`   To extract: ${toExtract.length}`);
  console.log(`   Skipped: ${skipped.length}`);
  console.log(`   By filename: ${byFilename}`);
  console.log(`   By Gemini: ${byGemini}`);
  console.log(`   Time: ${Date.now() - start}ms`);

  if (toExtract.length > 0) {
    console.log("\nDOCUMENTS TO EXTRACT:");
    for (const doc of toExtract) {
      console.log(`   - ${doc.fileName} (${doc.docType})`);
    }
  }

  return {
    results,
    toExtract,
    skipped,
    summary: {
      total: results.length,
      byFilename,
      byGemini,
      totalTimeMs: Date.now() - start,
    },
  };
}

function printUsage(): void {
  console.log(`
Smart Document Triage

Usage:
  bun services/pdf/smart-triage.ts <folder> [context]

Arguments:
  folder    Path to folder containing PDFs
  context   "dust_permit" or "swppp_takeoff" (default: dust_permit)

Examples:
  bun services/pdf/smart-triage.ts ./pdfs/project-folder
  bun services/pdf/smart-triage.ts ./pdfs/project-folder swppp_takeoff
`);
}

if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const folderPath = args[0];
  if (folderPath === undefined) {
    process.exit(0);
  }

  const context = args[1] === "swppp_takeoff" ? "swppp_takeoff" : "dust_permit";

  triageFolder(folderPath, context).catch(console.error);
}
