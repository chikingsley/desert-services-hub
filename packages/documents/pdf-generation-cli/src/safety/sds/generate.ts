import { dirname, resolve } from "node:path";
import {
  generateSdsPDF,
  saveSdsPDF,
} from "@lib/pdf/sds/generate-sds-pdf.server";
import type { SdsEntry, SdsListDocument } from "@lib/pdf/sds/types";
import { PDFDocument } from "pdf-lib";

const PDF_HEADER = "%PDF";

export interface GeneratePdfOptions {
  includeSheets?: boolean;
  downloadSheetsFromUrl?: boolean;
  failOnMissingSheets?: boolean;
}

export interface GeneratePdfResult {
  outputPath: string;
  sheetsIncluded: number;
  sheetsSkipped: number;
}

function isPdf(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_HEADER.length) {
    return false;
  }
  return Buffer.from(bytes.subarray(0, 4)).toString() === PDF_HEADER;
}

async function appendPdf(
  merged: PDFDocument,
  bytes: Uint8Array
): Promise<boolean> {
  if (!isPdf(bytes)) {
    return false;
  }
  const pdf = await PDFDocument.load(bytes);
  const pages = await merged.copyPages(pdf, pdf.getPageIndices());
  for (const page of pages) {
    merged.addPage(page);
  }
  return true;
}

async function readLocalPdf(
  jsonDir: string,
  entry: SdsEntry
): Promise<Uint8Array | null> {
  if (!entry.pdfPath) {
    return null;
  }
  const path = entry.pdfPath.startsWith("/")
    ? entry.pdfPath
    : resolve(jsonDir, entry.pdfPath);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return null;
  }
  return new Uint8Array(await file.arrayBuffer());
}

async function readRemotePdf(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function buildBinderPdf(
  doc: SdsListDocument,
  inputJsonPath: string,
  options: GeneratePdfOptions
): Promise<{ bytes: Uint8Array; included: number; skipped: number }> {
  const merged = await PDFDocument.create();
  const inventoryBytes = await generateSdsPDF(doc);
  await appendPdf(merged, inventoryBytes);

  let included = 0;
  let skipped = 0;
  const jsonDir = dirname(inputJsonPath);

  for (const entry of doc.entries) {
    const localBytes = await readLocalPdf(jsonDir, entry);
    const urlBytes =
      localBytes ??
      (options.downloadSheetsFromUrl && entry.url
        ? await readRemotePdf(entry.url)
        : null);

    if (!urlBytes) {
      skipped += 1;
      continue;
    }
    const wasAppended = await appendPdf(merged, urlBytes);
    if (wasAppended) {
      included += 1;
    } else {
      skipped += 1;
    }
  }

  return { bytes: await merged.save(), included, skipped };
}

export async function generatePdf(
  inputJsonPath: string,
  outputPdfPath: string,
  options: GeneratePdfOptions = {}
): Promise<GeneratePdfResult> {
  const json = await Bun.file(inputJsonPath).text();
  const doc = JSON.parse(json) as SdsListDocument;

  if (!options.includeSheets) {
    await saveSdsPDF(doc, outputPdfPath);
    return { outputPath: outputPdfPath, sheetsIncluded: 0, sheetsSkipped: 0 };
  }

  const { bytes, included, skipped } = await buildBinderPdf(
    doc,
    inputJsonPath,
    options
  );
  await Bun.write(outputPdfPath, bytes);

  if (options.failOnMissingSheets && skipped > 0) {
    throw new Error(
      `SDS binder missing ${skipped} sheet(s). Add entry.pdfPath or use --download-sheets-from-url with valid PDF URLs.`
    );
  }

  return {
    outputPath: outputPdfPath,
    sheetsIncluded: included,
    sheetsSkipped: skipped,
  };
}
