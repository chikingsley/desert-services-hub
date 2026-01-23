import { db } from "@/lib/db";
import type { ExtractedPage } from "./types";

const PAGE_BREAK_DELIMITER = "\n\n---PAGE BREAK---\n\n";

/**
 * Store extracted pages for a contract.
 * Uses INSERT OR REPLACE to handle re-extraction scenarios.
 */
export function storeExtractedPages(
  contractId: number,
  pages: ExtractedPage[]
): void {
  const insertStmt = db.prepare(
    "INSERT OR REPLACE INTO contract_pages (contract_id, page_index, text, source) VALUES (?, ?, ?, ?)"
  );

  db.transaction(() => {
    for (const page of pages) {
      insertStmt.run(contractId, page.pageIndex, page.text, page.source);
    }
  })();
}

/**
 * Retrieve all extracted pages for a contract, ordered by page index.
 */
export function getExtractedPages(contractId: number): ExtractedPage[] {
  const rows = db
    .query<{ page_index: number; text: string; source: string }, [number]>(
      "SELECT page_index, text, source FROM contract_pages WHERE contract_id = ? ORDER BY page_index"
    )
    .all(contractId);

  return rows.map((row) => ({
    pageIndex: row.page_index,
    text: row.text,
    source: row.source as "digital" | "ocr",
  }));
}

/**
 * Get the full text of a contract by joining all pages.
 * Useful for full-document analysis or search indexing.
 */
export function getFullText(contractId: number): string {
  const pages = getExtractedPages(contractId);
  return pages.map((p) => p.text).join(PAGE_BREAK_DELIMITER);
}
