# Phase 2: Text Extraction - Research

**Researched:** 2026-01-23
**Domain:** PDF text extraction, OCR, Mistral Document AI
**Confidence:** HIGH

## Summary

Phase 2 requires extracting text from contract PDFs for downstream multi-agent processing. The solution must handle both digital PDFs (embedded text) and scanned PDFs (image-based, requiring OCR). The requirement specifies using Mistral OCR, which is the state-of-the-art solution with 94.9% accuracy and $1-2 per 1,000 pages pricing.

The recommended approach is a two-tier extraction strategy: (1) attempt fast local text extraction using `unpdf` (or the existing `pdfjs-dist`) for digital PDFs, and (2) fall back to Mistral OCR for scanned or low-text-yield PDFs. This optimizes for cost (local extraction is free) and speed (local is faster than API calls) while ensuring high-quality OCR when needed.

Extracted text should be stored in SQLite (existing database pattern) with per-page storage to support downstream agents that need page-level citations. The `processed_contracts` table from Phase 1 should be extended with an `extracted_text` column or a new `contract_pages` table for granular storage.

**Primary recommendation:** Use `unpdf` for digital PDF extraction (or existing `pdfjs-dist`), fall back to Mistral OCR (`@mistralai/mistralai` SDK) for scanned PDFs, store extracted text per-page in SQLite for multi-agent access with citation support.

## Standard Stack

The established libraries/tools for this domain:

### Core

- **@mistralai/mistralai** (latest): Official TypeScript SDK for Mistral AI. Provides `client.ocr.process()` method for document OCR. Model: `mistral-ocr-latest` (alias for `mistral-ocr-2512`).
- **unpdf** (0.12.x): Modern PDF text extraction for serverless/Bun environments. Built on PDF.js v5.4, async/await API, TypeScript-first. Alternative to the project's existing `pdfjs-dist`.
- **bun:sqlite**: Already in use (`lib/db/index.ts`). Extend for extracted text storage.

### Supporting

- **pdfjs-dist** (5.4.x): Already installed in project. Can be used instead of `unpdf` for digital text extraction if preferred for consistency.
- **pdf-lib** (1.17.x): Already installed. Used for PDF page manipulation (extracting first N pages for classification).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Mistral OCR | Jina AI (existing) | Already used for triage in `services/jina/pdf/`, but requirement specifies Mistral |
| unpdf | pdfjs-dist (existing) | Both work; unpdf has cleaner API but pdfjs-dist already installed |
| SQLite TEXT | SQLite BLOB | TEXT is correct for extracted text (searchable, human-readable) |
| Per-page storage | Single text blob | Per-page enables citations; single blob is simpler but loses page info |

**Installation:**
```bash
bun add @mistralai/mistralai unpdf
```

Or if using existing pdfjs-dist:
```bash
bun add @mistralai/mistralai
```

## Architecture Patterns

### Recommended Project Structure
```
services/
  contract/
    pipeline/
      watcher.ts         # (existing) File watcher
      dedup.ts           # (existing) Deduplication
      types.ts           # (existing) Pipeline types
      index.ts           # (existing) Main entrypoint
    extraction/
      text-extractor.ts  # Main extraction orchestrator
      digital-extractor.ts  # unpdf/pdfjs-dist extraction
      ocr-extractor.ts   # Mistral OCR extraction
      types.ts           # Extraction types (ExtractedPage, ExtractionResult)
      storage.ts         # SQLite storage for extracted text
```

### Pattern 1: Two-Tier Extraction Strategy

**What:** Try local extraction first, fall back to OCR if text yield is too low.

**When to use:** Every PDF that enters the pipeline.

**Example:**
```typescript
// Source: Combination of unpdf docs + Mistral OCR docs
import { extractText, getDocumentProxy } from "unpdf";

const MIN_TEXT_LENGTH_PER_PAGE = 100; // Characters

export interface ExtractedPage {
  pageIndex: number;
  text: string;
  source: "digital" | "ocr";
}

export interface ExtractionResult {
  pages: ExtractedPage[];
  totalPages: number;
  extractionMethod: "digital" | "ocr" | "hybrid";
  processingTimeMs: number;
}

export async function extractText(filePath: string): Promise<ExtractionResult> {
  const start = Date.now();
  const buffer = await Bun.file(filePath).arrayBuffer();

  // Step 1: Try digital extraction
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text: pageTexts } = await extractText(pdf, { mergePages: false });

  // Step 2: Check if extraction yielded enough text
  const lowYieldPages = pageTexts
    .map((text, idx) => ({ idx, text }))
    .filter(p => p.text.length < MIN_TEXT_LENGTH_PER_PAGE);

  const hasLowYield = lowYieldPages.length > pageTexts.length * 0.5;

  if (hasLowYield) {
    // Fall back to Mistral OCR
    return extractWithMistralOcr(filePath, start);
  }

  return {
    pages: pageTexts.map((text, idx) => ({
      pageIndex: idx,
      text,
      source: "digital"
    })),
    totalPages: pageTexts.length,
    extractionMethod: "digital",
    processingTimeMs: Date.now() - start,
  };
}
```

### Pattern 2: Mistral OCR Integration

**What:** Call Mistral OCR API with base64-encoded PDF.

**When to use:** When digital extraction fails or yields insufficient text.

**Example:**
```typescript
// Source: https://docs.mistral.ai/capabilities/document_ai/basic_ocr
import { Mistral } from "@mistralai/mistralai";

const mistral = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY ?? "",
});

export async function extractWithMistralOcr(
  filePath: string,
  startTime: number
): Promise<ExtractionResult> {
  const buffer = await Bun.file(filePath).arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const documentUrl = `data:application/pdf;base64,${base64}`;

  const ocrResponse = await mistral.ocr.process({
    model: "mistral-ocr-latest",
    document: {
      type: "document_url",
      documentUrl: documentUrl,
    },
    includeImageBase64: false, // We only need text
    tableFormat: "markdown",   // Preserve table structure
  });

  const pages: ExtractedPage[] = ocrResponse.pages.map((page) => ({
    pageIndex: page.index,
    text: page.markdown,
    source: "ocr" as const,
  }));

  return {
    pages,
    totalPages: ocrResponse.pages.length,
    extractionMethod: "ocr",
    processingTimeMs: Date.now() - startTime,
  };
}
```

### Pattern 3: Per-Page SQLite Storage

**What:** Store extracted text per page for multi-agent access with citation support.

**When to use:** After extraction, before agent processing.

**Example:**
```typescript
// Source: Existing lib/db/index.ts pattern
import { db } from "@/lib/db";

// Schema addition (in lib/db/index.ts)
db.run(`
  CREATE TABLE IF NOT EXISTS contract_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL,
    page_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'digital',
    extracted_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (contract_id) REFERENCES processed_contracts(id) ON DELETE CASCADE,
    UNIQUE(contract_id, page_index)
  )
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_contract_pages_contract ON contract_pages(contract_id)`);

export function storeExtractedPages(
  contractId: number,
  pages: ExtractedPage[]
): void {
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO contract_pages (contract_id, page_index, text, source) VALUES (?, ?, ?, ?)"
  );

  for (const page of pages) {
    stmt.run(contractId, page.pageIndex, page.text, page.source);
  }
}

export function getExtractedText(contractId: number): ExtractedPage[] {
  return db
    .query("SELECT page_index, text, source FROM contract_pages WHERE contract_id = ? ORDER BY page_index")
    .all(contractId) as ExtractedPage[];
}

export function getFullText(contractId: number): string {
  const pages = getExtractedText(contractId);
  return pages.map(p => p.text).join("\n\n---PAGE BREAK---\n\n");
}
```

### Anti-Patterns to Avoid

- **Always using OCR:** Expensive ($1-2/1000 pages) and slower than local extraction. Only use for scanned PDFs.
- **Storing text as single blob:** Loses page-level granularity needed for citations. Store per-page.
- **Not handling large PDFs:** Mistral has 50MB/1000 page limits. Add chunking for large documents.
- **Blocking on OCR:** OCR can take 1-5 seconds per page. Make extraction async and update status.
- **Ignoring table structure:** Contract SOVs have tables. Use `tableFormat: "markdown"` to preserve structure.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF text extraction | Custom pdfjs wrapper | unpdf / existing pdfjs-dist | Handles encoding, font issues, page layouts |
| OCR for scanned PDFs | Tesseract wrapper | Mistral OCR | 94.9% accuracy vs ~85% for Tesseract, handles tables/handwriting |
| Detecting scanned vs digital | Heuristic KB/page only | Text extraction attempt + threshold | More reliable than file size heuristic alone |
| Table extraction | Regex on OCR output | Mistral tableFormat: "markdown" | Preserves structure, handles merged cells |
| Base64 encoding | Manual Buffer operations | Buffer.from().toString("base64") | Built-in, correct, handles edge cases |

**Key insight:** Mistral OCR solves the hard problems (handwriting, low-DPI scans, tables, multi-column layouts) that traditional OCR struggles with. The $1-2/1000 pages cost is negligible compared to building and maintaining a custom OCR pipeline.

## Common Pitfalls

### Pitfall 1: Assuming All PDFs Have Extractable Text

**What goes wrong:** Digital extraction returns empty strings or garbage characters.

**Why it happens:** PDF may be scanned, have embedded fonts without text mapping, or use non-standard encoding.

**How to avoid:** Always check text yield. If total extracted characters < threshold (e.g., 100 per page average), fall back to OCR.

**Warning signs:** Empty text arrays, text full of unicode replacement characters, text length << expected for document size.

### Pitfall 2: Mistral OCR File Size Limits

**What goes wrong:** API returns 413 or error for large PDFs.

**Why it happens:** Mistral OCR limits: 50MB max file size, 1000 pages max.

**How to avoid:** Check file size before calling OCR. For large files, process in chunks (split PDF into sections).

**Warning signs:** Contracts over 50 pages or with high-resolution scans. Construction contracts can be 100+ pages.

### Pitfall 3: Table Data Becomes Unusable

**What goes wrong:** SOV (Schedule of Values) tables extracted as jumbled text, values misaligned.

**Why it happens:** Default OCR output merges table cells linearly without structure.

**How to avoid:** Use `tableFormat: "markdown"` or `tableFormat: "html"` in Mistral OCR. Store table markdown separately if needed.

**Warning signs:** Extracted text has numbers/values but no clear column alignment or headers.

### Pitfall 4: Lost Page Citations

**What goes wrong:** Agents cite "page 5" but extraction merged all text into one blob.

**Why it happens:** Stored extracted text as single string without page boundaries.

**How to avoid:** Store per-page with page_index. Include page breaks in full-text retrieval.

**Warning signs:** Multi-agent outputs cite pages but can't be verified.

### Pitfall 5: OCR Hallucinations in Financial Data

**What goes wrong:** Contract values, dates, or permit numbers are slightly wrong.

**Why it happens:** OCR models can hallucinate, especially on low-quality scans. Mistral tests show 27.5% missing data rate in structured extraction.

**How to avoid:** Store raw OCR output alongside any structured extraction. Flag low-confidence extractions. Human verification step for critical values (Phase 5).

**Warning signs:** Values that don't match expected formats (e.g., permit numbers with wrong prefix).

## Code Examples

Verified patterns from official sources:

### Initialize Mistral Client

```typescript
// Source: https://github.com/mistralai/client-ts
import { Mistral } from "@mistralai/mistralai";

const mistral = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY ?? "",
});
```

### OCR with URL (Public PDF)

```typescript
// Source: https://docs.mistral.ai/capabilities/document_ai/basic_ocr
const result = await mistral.ocr.process({
  model: "mistral-ocr-latest",
  document: {
    type: "document_url",
    documentUrl: "https://example.com/contract.pdf",
  },
  includeImageBase64: false,
  tableFormat: "markdown",
});

// Response structure
// result.pages[].index - page number (0-indexed)
// result.pages[].markdown - extracted text with markdown formatting
// result.pages[].tables - tables if tableFormat specified
// result.pages[].dimensions - { dpi, height, width }
```

### OCR with Base64 (Local PDF)

```typescript
// Source: https://docs.mistral.ai/api/endpoint/ocr
const buffer = await Bun.file(filePath).arrayBuffer();
const base64 = Buffer.from(buffer).toString("base64");

const result = await mistral.ocr.process({
  model: "mistral-ocr-latest",
  document: {
    type: "document_url",
    documentUrl: `data:application/pdf;base64,${base64}`,
  },
  pages: [0, 1, 2], // Optional: specific pages only
});
```

### Digital Extraction with unpdf

```typescript
// Source: https://github.com/unjs/unpdf
import { extractText, getDocumentProxy } from "unpdf";

const buffer = await Bun.file(filePath).arrayBuffer();
const pdf = await getDocumentProxy(new Uint8Array(buffer));

// Per-page extraction
const { totalPages, text } = await extractText(pdf, { mergePages: false });
// text is string[] where text[i] is page i content

// Merged extraction
const { text: fullText } = await extractText(pdf, { mergePages: true });
// fullText is single string
```

### Check if PDF is Likely Scanned

```typescript
// Source: Derived from existing services/jina/pdf/smart-triage.ts pattern
import { extractText, getDocumentProxy } from "unpdf";

const MIN_CHARS_PER_PAGE = 100;

async function isLikelyScannnedPdf(filePath: string): Promise<boolean> {
  const buffer = await Bun.file(filePath).arrayBuffer();
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });

  const totalChars = text.reduce((sum, pageText) => sum + pageText.length, 0);
  const avgCharsPerPage = totalChars / totalPages;

  return avgCharsPerPage < MIN_CHARS_PER_PAGE;
}
```

### Full Extraction Pipeline Integration

```typescript
// Source: Combines patterns above with existing pipeline
import { markAsProcessed, updateProcessingStatus } from "./dedup";
import { extractText } from "../extraction/text-extractor";
import { storeExtractedPages } from "../extraction/storage";

export async function processContract(filePath: string): Promise<void> {
  const contractId = markAsProcessed(filePath, "processing");

  try {
    const result = await extractText(filePath);
    storeExtractedPages(contractId, result.pages);
    updateProcessingStatus(filePath, "completed");

    console.log(`Extracted ${result.totalPages} pages via ${result.extractionMethod}`);
  } catch (error) {
    updateProcessingStatus(filePath, "failed");
    throw error;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tesseract OCR | Mistral OCR / Cloud AI OCR | 2024-2025 | 85% -> 95% accuracy, table/handwriting support |
| pdf-parse (unmaintained) | unpdf (maintained) | 2024 | Modern TypeScript, serverless-compatible |
| Single OCR model | Hybrid digital + OCR | 2025 | Cost reduction (free local extraction when possible) |
| Full-document text blob | Per-page storage | 2025 | Enables page-level citations for AI agents |

**Deprecated/outdated:**
- **pdf-parse npm package**: Unmaintained, use unpdf instead
- **Tesseract.js for production**: Low accuracy compared to cloud AI OCR
- **Jina AI for OCR**: Works but requirement specifies Mistral; Jina better for web scraping

## Open Questions

Things that couldn't be fully resolved:

1. **Mistral OCR pricing for batch processing**
   - What we know: $2/1000 pages standard, $1/1000 pages with Batch API
   - What's unclear: Whether Batch API is available in TypeScript SDK or REST-only
   - Recommendation: Start with standard API, investigate batch if volume exceeds 1000 pages/day

2. **Large contract handling (>50MB or >1000 pages)**
   - What we know: Mistral limits are 50MB/1000 pages
   - What's unclear: How often construction contracts exceed these limits
   - Recommendation: Add file size check and implement page-range extraction for large files

3. **Integration with existing Jina/Gemini code**
   - What we know: `services/jina/pdf/` has extraction code using Jina + Gemini
   - What's unclear: Whether to replace, augment, or run parallel to existing code
   - Recommendation: Keep existing code for document triage; use new Mistral code for contract-specific extraction

## Sources

### Primary (HIGH confidence)
- [Mistral OCR API Documentation](https://docs.mistral.ai/capabilities/document_ai/basic_ocr) - API reference, parameters, response format
- [Mistral OCR Endpoint Reference](https://docs.mistral.ai/api/endpoint/ocr) - Complete API schema
- [Mistral TypeScript SDK](https://github.com/mistralai/client-ts) - Official SDK, OCR examples
- [unpdf GitHub](https://github.com/unjs/unpdf) - API documentation, Bun compatibility
- Existing codebase: `services/jina/pdf/smart-triage.ts` - Current PDF handling patterns

### Secondary (MEDIUM confidence)
- [Mistral OCR 3 Announcement](https://mistral.ai/news/mistral-ocr-3) - Features, pricing, benchmarks
- [unpdf npm](https://www.npmjs.com/package/unpdf) - Version info, installation
- [DeepWiki OCR Examples](https://deepwiki.com/mistralai/client-ts/5.1-ocr-examples) - TypeScript code patterns
- [Strapi PDF Libraries Comparison](https://strapi.io/blog/7-best-javascript-pdf-parsing-libraries-nodejs-2025) - Library comparison

### Tertiary (LOW confidence)
- [Mistral OCR Review - Parsio](https://parsio.io/blog/mistral-ocr-test-review/) - Third-party testing (validate claims with official docs)
- [Medium Mistral OCR Review](https://medium.com/intelligent-document-insights/mistral-ocr-reviewed-711765a9c503) - Real-world issues (hallucinations, table problems)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Mistral SDK well-documented, unpdf actively maintained
- Architecture: HIGH - Patterns follow existing codebase conventions, verified with official docs
- Pitfalls: MEDIUM - Based on third-party reviews and general OCR experience; validate in testing

**Research date:** 2026-01-23
**Valid until:** 2026-02-23 (30 days - Mistral OCR 3 is new, API may evolve)
