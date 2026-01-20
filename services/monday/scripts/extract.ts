import { readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Script to extract structured data from estimate PDFs.
 * Uses 'pdftotext' for extraction and Bun APIs for process management.
 */

interface Extractions {
  fileName: string;
  estimateNumber: string | null;
  date: string | null;
  jobName: string | null;
  totalAmount: string | null;
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

async function extractTextFromPdf(filePath: string): Promise<string> {
  const proc = Bun.spawn(["pdftotext", "-layout", filePath, "-"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const text = await new Response(proc.stdout).text();
  const error = await new Response(proc.stderr).text();

  if (error && !text) {
    throw new Error(`PDF to Text error: ${error}`);
  }

  return text;
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

function parseEstimateData(text: string, fileName: string): Extractions {
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
    isClean: false,
  };

  data.isClean = !!(data.estimateNumber && data.date && data.jobName && data.totalAmount);
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

async function processAllEstimates() {
  const estimatesDir = join(process.cwd(), "estimates");
  let files: string[];

  try {
    files = await getFilesToProcess(estimatesDir);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return;
  }

  console.log(`🔍 Found ${files.length} PDFs in ${estimatesDir}. Starting extraction...`);

  const results: Extractions[] = [];
  let cleanCount = 0;

  for (const file of files) {
    const filePath = join(estimatesDir, file);
    try {
      const text = await extractTextFromPdf(filePath);
      const data = parseEstimateData(text, file);
      results.push(data);
      if (data.isClean) {
        cleanCount++;
      }
      console.log(
        `[${data.isClean ? "✔" : "✘"}] ${file.slice(0, 40)}... -> Est: ${data.estimateNumber ?? "???"} | Total: ${data.totalAmount ?? "???"}`,
      );
    } catch (err) {
      console.error(`Failed to process ${file}:`, err instanceof Error ? err.message : err);
    }
  }

  printReport(files.length, cleanCount, results);
  await Bun.write(join(estimatesDir, "extraction_summary.json"), JSON.stringify(results, null, 2));
  console.log("\n📄 Summary saved to estimates/extraction_summary.json");
}

function printReport(total: number, clean: number, results: Extractions[]) {
  console.log("\n--- Extraction Report ---");
  console.log(`Total Files: ${total}`);
  console.log(`Clean Extractions (All fields found): ${clean}`);
  console.log(`Success Rate: ${((clean / total) * 100).toFixed(1)}%`);

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
      console.log(`  - ${item.fileName.slice(0, 50)}... (Missing: ${missing.join(", ")})`);
    }
  }
}

processAllEstimates().catch(console.error);
