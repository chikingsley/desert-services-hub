#!/usr/bin/env bun

/**
 * OCR CLI - Extract text from images or PDFs using LightOnOCR
 *
 * Usage:
 *   bun scripts/ocr.ts <file> [options]
 *
 * Examples:
 *   bun scripts/ocr.ts image.png
 *   bun scripts/ocr.ts document.pdf --pages 1,2,3
 *   bun scripts/ocr.ts drawing.pdf --pages 1 --prompt "Extract project name and address"
 */

import { parseArgs } from "node:util";
import {
  checkOCRHealth,
  extractText,
  extractTextFromPdf,
  type PDFOCRResult,
} from "@/lib/ocr";

interface CLIOptions {
  pages?: string;
  prompt?: string;
  resolution?: string;
  json?: boolean;
  help?: boolean;
}

const HELP_TEXT = `
OCR CLI - Extract text from images or PDFs

Usage:
  bun scripts/ocr.ts <file> [options]

Options:
  -p, --pages <list>     Pages to extract (PDF only), e.g., "1,2,3" or "1-5"
  --prompt <text>        Custom prompt for extraction
  -r, --resolution <n>   Image resolution for PDF conversion (default: 150)
  -j, --json             Output as JSON
  -h, --help             Show this help

Examples:
  bun scripts/ocr.ts image.png
  bun scripts/ocr.ts document.pdf --pages 1
  bun scripts/ocr.ts drawing.pdf --pages 1,2,3 --prompt "Extract all text"
`;

function parsePageRange(input: string): number[] {
  const pages: number[] = [];

  for (const part of input.split(",")) {
    const trimmed = part.trim();
    if (trimmed.includes("-")) {
      const parts = trimmed.split("-").map(Number);
      const start = parts[0];
      const end = parts[1];
      if (start !== undefined && end !== undefined) {
        for (let i = start; i <= end; i++) {
          pages.push(i);
        }
      }
    } else {
      pages.push(Number(trimmed));
    }
  }

  return pages.filter((n) => !Number.isNaN(n) && n > 0);
}

function outputPdfResult(
  filePath: string,
  result: PDFOCRResult,
  asJson: boolean
): void {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`PDF: ${filePath}`);
  console.log(`Total pages: ${result.totalPages}`);
  console.log(`Processed: ${result.pages.length} page(s)\n`);

  for (const page of result.pages) {
    console.log(`=== Page ${page.page} ===`);
    if (page.error) {
      console.log(`Error: ${page.error}\n`);
    } else {
      console.log(`${page.text}\n`);
    }
  }
}

async function processPdf(
  filePath: string,
  options: CLIOptions
): Promise<void> {
  const pages = options.pages ? parsePageRange(options.pages) : [1];
  const resolution = options.resolution
    ? Number(options.resolution)
    : undefined;

  const result = await extractTextFromPdf(filePath, {
    pages,
    prompt: options.prompt,
    resolution,
  });

  outputPdfResult(filePath, result, options.json ?? false);
}

async function processImage(
  filePath: string,
  options: CLIOptions
): Promise<void> {
  const result = await extractText(filePath, { prompt: options.prompt });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.success) {
    console.log(result.text);
  } else {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      pages: { type: "string", short: "p" },
      prompt: { type: "string" },
      resolution: { type: "string", short: "r" },
      json: { type: "boolean", short: "j" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const filePath = positionals[0];
  if (!filePath) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const isPdf = filePath.toLowerCase().endsWith(".pdf");

  const isHealthy = await checkOCRHealth();
  if (!isHealthy) {
    console.error("Error: OCR endpoint not available");
    process.exit(1);
  }

  if (isPdf) {
    await processPdf(filePath, values);
  } else {
    await processImage(filePath, values);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
