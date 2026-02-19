import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { DustPermitPdfTextExtractionResult } from "./dust-permit-pdf-types";

const WHITESPACE_REGEX = /\s+/g;

export async function extractDustPermitPdfText(
  bytes: Uint8Array
): Promise<DustPermitPdfTextExtractionResult> {
  const pdftotextPath = Bun.which?.("pdftotext") ?? null;
  if (pdftotextPath) {
    try {
      const text = await extractWithPdftotext(pdftotextPath, bytes);
      return {
        method: "pdftotext",
        pageCount: null,
        text,
      };
    } catch {
      // Fall through to pdf.js extraction.
    }
  }

  const { pageCount, text } = await extractWithPdfJs(bytes);
  return {
    method: "pdfjs",
    pageCount,
    text,
  };
}

async function extractWithPdftotext(
  binary: string,
  bytes: Uint8Array
): Promise<string> {
  const path = join(tmpdir(), `aqdata-permit-${randomUUID()}.pdf`);
  await Bun.write(path, bytes);

  try {
    const proc = Bun.spawn([binary, "-layout", "-enc", "UTF-8", path, "-"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (code !== 0) {
      throw new Error(
        `pdftotext failed (${code}): ${stderr.trim() || "unknown error"}`
      );
    }

    return stdout;
  } finally {
    await Bun.$`rm -f ${path}`.quiet();
  }
}

async function extractWithPdfJs(
  bytes: Uint8Array
): Promise<{ pageCount: number; text: string }> {
  const loadingTask = getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let index = 1; index <= pdf.numPages; index++) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let currentLine = "";

    for (const item of content.items as Array<{
      hasEOL?: boolean;
      str?: string;
    }>) {
      const value = cleanText(item.str ?? "");
      if (!value) {
        continue;
      }

      currentLine = currentLine ? `${currentLine} ${value}` : value;
      if (item.hasEOL) {
        lines.push(currentLine);
        currentLine = "";
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    pages.push(lines.join("\n"));
  }

  return {
    pageCount: pdf.numPages,
    text: pages.join("\n\n"),
  };
}

function cleanText(value: string): string {
  return value.replace(WHITESPACE_REGEX, " ").trim();
}
