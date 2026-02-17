/**
 * APN Extraction from PDFs using Gemini 2.5 Flash Lite
 *
 * Usage:
 *   bun experiments/apn-extraction/extract-apns.ts <pdf1> [pdf2] [pdf3] ...
 *   bun experiments/apn-extraction/extract-apns.ts /path/to/folder/*.pdf
 *
 * Example:
 *   bun experiments/apn-extraction/extract-apns.ts "./plans/C5.0 GRADING PLAN.pdf"
 */

import { existsSync, readFileSync } from "node:fs";
import { createUserContent, GoogleGenAI } from "@google/genai";

interface APNResult {
  apn: string;
  owner: string | null;
  location: string | null;
}

interface ExtractionResult {
  file: string;
  success: boolean;
  apns: APNResult[];
  error?: string;
}

interface AggregatedResult {
  totalFiles: number;
  successfulFiles: number;
  failedFiles: number;
  uniqueApns: APNResult[];
  byFile: ExtractionResult[];
}

const EXTRACTION_PROMPT = `This is an engineering/construction drawing PDF. Extract ALL APN (Assessor Parcel Numbers) visible anywhere on this drawing.

APNs appear as labels like "APN 501-44-993" or "APN: XXX-XX-XXX" usually near property boundary lines.

For each APN found, provide:
- apn: The APN number (format: XXX-XX-XXX or XXX-XX-XXXX)
- owner: The associated owner/company name if shown, or null
- location: Where on the drawing it appears (e.g., "north boundary"), or null

Return as JSON array. If no APNs found, return empty array [].`;

async function extractAPNsFromPdf(ai: GoogleGenAI, pdfPath: string): Promise<ExtractionResult> {
  const fileName = pdfPath.split("/").pop() ?? pdfPath;

  if (!existsSync(pdfPath)) {
    return {
      file: fileName,
      success: false,
      apns: [],
      error: "File not found",
    };
  }

  try {
    const pdfBuffer = readFileSync(pdfPath);
    const base64Data = pdfBuffer.toString("base64");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: createUserContent([
        {
          inlineData: {
            mimeType: "application/pdf",
            data: base64Data,
          },
        },
        EXTRACTION_PROMPT,
      ]),
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text ?? "[]";
    const apns = JSON.parse(text) as APNResult[];

    return {
      file: fileName,
      success: true,
      apns,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      file: fileName,
      success: false,
      apns: [],
      error: message,
    };
  }
}

function deduplicateApns(results: ExtractionResult[]): APNResult[] {
  const seen = new Map<string, APNResult>();

  for (const result of results) {
    for (const apn of result.apns) {
      const normalized = apn.apn.toUpperCase().trim();
      if (!seen.has(normalized)) {
        seen.set(normalized, apn);
      }
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.apn.localeCompare(b.apn));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: bun extract-apns.ts <pdf1> [pdf2] [pdf3] ...");
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY environment variable not set");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });
  const results: ExtractionResult[] = [];

  console.log(`Processing ${args.length} file(s)...\n`);

  for (const pdfPath of args) {
    console.log(`Extracting APNs from: ${pdfPath}`);
    const result = await extractAPNsFromPdf(ai, pdfPath);
    results.push(result);

    if (result.success) {
      console.log(`  Found ${result.apns.length} APN(s)`);
      for (const apn of result.apns) {
        console.log(`    - ${apn.apn}${apn.owner ? ` (${apn.owner})` : ""}`);
      }
    } else {
      console.log(`  Error: ${result.error}`);
    }
    console.log();
  }

  const aggregated: AggregatedResult = {
    totalFiles: results.length,
    successfulFiles: results.filter((r) => r.success).length,
    failedFiles: results.filter((r) => !r.success).length,
    uniqueApns: deduplicateApns(results),
    byFile: results,
  };

  console.log("=".repeat(50));
  console.log("SUMMARY");
  console.log("=".repeat(50));
  console.log(`Files processed: ${aggregated.totalFiles}`);
  console.log(`Successful: ${aggregated.successfulFiles}`);
  console.log(`Failed: ${aggregated.failedFiles}`);
  console.log(`\nUnique APNs found: ${aggregated.uniqueApns.length}`);

  for (const apn of aggregated.uniqueApns) {
    const ownerStr = apn.owner ? ` - ${apn.owner}` : "";
    console.log(`  ${apn.apn}${ownerStr}`);
  }

  console.log("\n--- JSON Output ---");
  console.log(JSON.stringify(aggregated, null, 2));
}

main().catch(console.error);
