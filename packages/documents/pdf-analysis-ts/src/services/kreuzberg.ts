import type { ExtractionResult } from "@kreuzberg/node";
import { extractFile } from "@kreuzberg/node";

import type { TextExtractionResult } from "@pdf-analysis/types";

interface MetadataLike {
  page_count?: number;
  pageCount?: number;
}

function getPageCount(result: ExtractionResult): number {
  const metadata = result.metadata as MetadataLike | undefined;
  if (metadata?.page_count && Number.isFinite(metadata.page_count)) {
    return metadata.page_count;
  }
  if (metadata?.pageCount && Number.isFinite(metadata.pageCount)) {
    return metadata.pageCount;
  }
  return result.pages?.length ?? 0;
}

export async function extractPdfText(
  filePath: string
): Promise<TextExtractionResult> {
  const result = await extractFile(filePath, null, {
    forceOcr: false,
    outputFormat: "markdown",
    pages: {
      extractPages: true,
      insertPageMarkers: true,
      markerFormat: "html_comment",
    },
  });

  const pageCount = getPageCount(result);
  const content = result.content ?? "";
  const pagesWithText = (result.pages ?? []).filter(
    (p) => p.content.trim().length > 0
  ).length;

  return {
    content,
    pageCount,
    pagesWithText,
    hasText: content.trim().length > 0,
    extractor: "kreuzberg",
  };
}

export async function extractPdfWithForcedOcr(
  filePath: string,
  backend: string,
  language?: string
): Promise<TextExtractionResult> {
  const result = await extractFile(filePath, null, {
    forceOcr: true,
    outputFormat: "markdown",
    ocr: {
      backend,
      ...(language ? { language } : {}),
    },
    pages: {
      extractPages: true,
      insertPageMarkers: true,
      markerFormat: "html_comment",
    },
  });

  const pageCount = getPageCount(result);
  const content = result.content ?? "";

  return {
    content,
    pageCount,
    pagesWithText: (result.pages ?? []).filter(
      (p) => p.content.trim().length > 0
    ).length,
    hasText: content.trim().length > 0,
    extractor: `kreuzberg+ocr:${backend}`,
  };
}

export function extractPdfTables(filePath: string): Promise<ExtractionResult> {
  return extractFile(filePath, null, {
    forceOcr: false,
    outputFormat: "markdown",
    pages: {
      extractPages: true,
      insertPageMarkers: false,
    },
  });
}
