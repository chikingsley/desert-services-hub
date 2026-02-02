import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Script to extract structured data from estimate PDFs.
 * Uses pdfjs-dist for header extraction and Gemini 2.5 Flash Lite for line items.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

interface LineItemExtraction {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

interface GeminiExtraction {
  contractorName: string | null;
  lineItems: LineItemExtraction[];
}

interface Extractions {
  fileName: string;
  estimateNumber: string | null;
  date: string | null;
  jobName: string | null;
  totalAmount: string | null;
  contractorName: string | null;
  lineItems: LineItemExtraction[];
  isClean: boolean;
}

// Top-level regex for performance
const ESTIMATE_NUM_PATTERNS = [
  /Estimate\s+#[\s\t:?]+([\d-]+)/i, // Catch 01032123 or 251227-01
  /(\d{6,8})\s*(?:\r?\n|$)/,
  /#\s*([\d-]+)/,
];

const DATE_PATTERN = /(\d{1,2}\/\d{1,2}\/\d{4})/;
const JOB_NAME_PATTERNS = [
  /Job Name[\s\n\t:?]+([^\n\r]+)/i,
  /Job Information[\s\n\t:?]+([^\n\r]+)/i,
];
const TOTAL_PATTERN = /Total[\s\t:?]+([\d,]+\.\d{2})/gi;
const LAST_CURRENCY_PATTERN = /([\d,]+\.\d{2})/g;

const LINE_ITEMS_SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    contractorName: { type: "STRING" as const },
    lineItems: {
      type: "ARRAY" as const,
      items: {
        type: "OBJECT" as const,
        properties: {
          description: { type: "STRING" as const },
          quantity: { type: "NUMBER" as const },
          unit: { type: "STRING" as const },
          unitPrice: { type: "NUMBER" as const },
          total: { type: "NUMBER" as const },
        },
      },
    },
  },
};

const LINE_ITEMS_PROMPT = `Extract all line items from this Desert Services estimate PDF.

For each line item, extract:
- description: The item/service description
- quantity: The quantity (number)
- unit: The unit of measure (e.g., EA, LF, SF, CY, HR, LS)
- unitPrice: The price per unit (number, no currency symbols)
- total: The line total (quantity * unitPrice)

Also extract the contractor/customer name if visible (the company this estimate is FOR, not Desert Services).

Return a JSON object with:
- contractorName: The contractor/customer name or null if not found
- lineItems: Array of line items

If no line items are found, return an empty array.`;

async function extractPdfPages(
  pdfPath: string,
  maxPages = 3
): Promise<Uint8Array> {
  const file = Bun.file(pdfPath);
  const buffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buffer);
  const pageCount = pdfDoc.getPageCount();

  if (pageCount <= maxPages) {
    return new Uint8Array(buffer);
  }

  const newPdf = await PDFDocument.create();
  const pagesToCopy = Array.from({ length: maxPages }, (_, i) => i);
  const copiedPages = await newPdf.copyPages(pdfDoc, pagesToCopy);
  for (const page of copiedPages) {
    newPdf.addPage(page);
  }
  return await newPdf.save();
}

async function extractLineItemsWithGemini(
  pdfPath: string
): Promise<GeminiExtraction> {
  if (!GEMINI_API_KEY) {
    console.warn("  ⚠️  GEMINI_API_KEY not set, skipping line item extraction");
    return { contractorName: null, lineItems: [] };
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const pdfBytes = await extractPdfPages(pdfPath, 3);
  const base64 = Buffer.from(pdfBytes).toString("base64");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: base64,
            },
          },
          {
            text: LINE_ITEMS_PROMPT,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: LINE_ITEMS_SCHEMA,
    },
  });

  const parsed = JSON.parse(response.text ?? "{}") as GeminiExtraction;
  return {
    contractorName: parsed.contractorName ?? null,
    lineItems: parsed.lineItems ?? [],
  };
}

async function extractTextFromPdf(filePath: string): Promise<string> {
  const data = await Bun.file(filePath).arrayBuffer();
  const pdf = await getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const textParts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    textParts.push(pageText);
  }

  return textParts.join("\n");
}

function parseEstimateNumber(text: string): string | null {
  for (const pattern of ESTIMATE_NUM_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function parseJobName(text: string): string | null {
  for (const pattern of JOB_NAME_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

function parseTotalAmount(text: string): string | null {
  const totalMatches = Array.from(text.matchAll(TOTAL_PATTERN));
  if (totalMatches.length > 0) {
    return totalMatches.at(-1)?.[1] ?? null;
  }

  const lastCurrencyStrings = Array.from(text.matchAll(LAST_CURRENCY_PATTERN));
  return lastCurrencyStrings.at(-1)?.[0] ?? null;
}

function parseEstimateData(
  text: string,
  fileName: string,
  geminiData: GeminiExtraction
): Extractions {
  const estimateNumber = parseEstimateNumber(text);
  const dateMatch = text.match(DATE_PATTERN);
  const jobName = parseJobName(text);
  const totalAmount = parseTotalAmount(text);

  const data: Extractions = {
    fileName,
    estimateNumber,
    date: dateMatch ? dateMatch[0] : null,
    jobName,
    totalAmount,
    contractorName: geminiData.contractorName,
    lineItems: geminiData.lineItems,
    isClean: false,
  };

  data.isClean = !!(
    data.estimateNumber &&
    data.date &&
    data.jobName &&
    data.totalAmount
  );
  return data;
}

async function getFilesToProcess(dir: string): Promise<string[]> {
  const { existsSync } = await import("node:fs");
  if (!existsSync(dir)) {
    throw new Error(`Directory not found: ${dir}`);
  }
  const files = await readdir(dir);
  return files.filter((f) => f.toLowerCase().endsWith(".pdf"));
}

async function loadExistingExtractions(
  summaryPath: string
): Promise<Map<string, Extractions>> {
  const file = Bun.file(summaryPath);
  if (!(await file.exists())) {
    return new Map();
  }
  const existing = (await file.json()) as Extractions[];
  const map = new Map<string, Extractions>();
  for (const e of existing) {
    // Only consider it "done" if it has line items extracted
    if (e.lineItems && e.lineItems.length > 0) {
      map.set(e.fileName, e);
    }
  }
  return map;
}

async function processAllEstimates() {
  // Use services/monday/estimates/ directory
  const estimatesDir = join(import.meta.dir, "..", "estimates");
  const summaryPath = join(estimatesDir, "extraction_summary.json");
  let files: string[];

  try {
    files = await getFilesToProcess(estimatesDir);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return;
  }

  // Load existing extractions to skip already-processed files
  const existingExtractions = await loadExistingExtractions(summaryPath);
  const alreadyProcessed = existingExtractions.size;

  // Filter to only unprocessed files
  const filesToProcess = files.filter((f) => !existingExtractions.has(f));

  console.log(
    `🔍 Found ${files.length} PDFs. Already processed: ${alreadyProcessed}. To process: ${filesToProcess.length}`
  );

  if (filesToProcess.length === 0) {
    console.log("✅ All files already processed. Nothing to do.");
    return;
  }

  // Start with existing results
  const results: Extractions[] = [...existingExtractions.values()];
  let cleanCount = results.filter((r) => r.isClean).length;
  let newCount = 0;

  for (const file of filesToProcess) {
    const filePath = join(estimatesDir, file);
    try {
      // Extract text for header parsing
      const text = await extractTextFromPdf(filePath);

      // Extract line items with Gemini
      console.log(`  📄 Processing ${file.slice(0, 40)}...`);
      const geminiData = await extractLineItemsWithGemini(filePath);

      const data = parseEstimateData(text, file, geminiData);
      results.push(data);
      newCount++;
      if (data.isClean) {
        cleanCount++;
      }
      console.log(
        `[${data.isClean ? "✔" : "✘"}] Est: ${data.estimateNumber ?? "???"} | Items: ${data.lineItems.length} | Total: ${data.totalAmount ?? "???"}`
      );
    } catch (err) {
      console.error(
        `Failed to process ${file}:`,
        err instanceof Error ? err.message : err
      );
      // Add a failed entry so we can track it
      results.push({
        fileName: file,
        estimateNumber: null,
        date: null,
        jobName: null,
        totalAmount: null,
        contractorName: null,
        lineItems: [],
        isClean: false,
      });
      newCount++;
    }
  }

  printReport(results.length, cleanCount, results);
  console.log(`\n📊 New files processed this run: ${newCount}`);
  await Bun.write(summaryPath, JSON.stringify(results, null, 2));
  console.log(
    "\n📄 Summary saved to services/monday/estimates/extraction_summary.json"
  );
}

function printReport(total: number, clean: number, results: Extractions[]) {
  console.log("\n--- Extraction Report ---");
  console.log(`Total Files: ${total}`);
  console.log(`Clean Extractions (All fields found): ${clean}`);
  console.log(`Success Rate: ${((clean / total) * 100).toFixed(1)}%`);

  const totalLineItems = results.reduce(
    (sum, r) => sum + r.lineItems.length,
    0
  );
  console.log(`Total Line Items Extracted: ${totalLineItems}`);

  if (clean < total) {
    console.log("\nMissing data in some files:");
    const messy = results.filter((r) => !r.isClean);
    for (const item of messy.slice(0, 10)) {
      const missing: string[] = [];
      if (!item.estimateNumber) {
        missing.push("Est#");
      }
      if (!item.date) {
        missing.push("Date");
      }
      if (!item.jobName) {
        missing.push("JobName");
      }
      if (!item.totalAmount) {
        missing.push("Total");
      }
      console.log(
        `  - ${item.fileName.slice(0, 50)}... (Missing: ${missing.join(", ")})`
      );
    }
  }
}

processAllEstimates().catch(console.error);
