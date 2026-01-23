---
phase: 02-text-extraction
plan: 01
subsystem: extraction
tags: [pdfjs-dist, mistral-ocr, sqlite, text-extraction, ocr]

# Dependency graph
requires:
  - phase: 01-pipeline-foundation
    provides: File watcher, deduplication, processing status
provides:
  - Two-tier text extraction (digital-first, OCR fallback)
  - Per-page storage with source tracking
  - contract_pages SQLite table
  - extractText orchestrator function
affects: [03-entity-extraction, contract-analysis]

# Tech tracking
tech-stack:
  added: [@mistralai/mistralai]
  patterns: [two-tier-extraction, per-page-storage]

key-files:
  created:
    - services/contract/extraction/types.ts
    - services/contract/extraction/storage.ts
    - services/contract/extraction/digital-extractor.ts
    - services/contract/extraction/ocr-extractor.ts
    - services/contract/extraction/text-extractor.ts
  modified:
    - lib/db/index.ts
    - services/contract/pipeline/dedup.ts
    - services/contract/pipeline/index.ts

key-decisions:
  - "100 chars/page threshold for OCR fallback detection"
  - "Per-page storage with source tracking for citation support"
  - "Data URL approach for Mistral OCR (base64-encoded PDF)"

patterns-established:
  - "Two-tier extraction: fast local first, API fallback for scanned"
  - "Per-page storage with pageIndex for citation support"
  - "Processing status flow: pending -> processing -> completed/failed"

# Metrics
duration: 5min
completed: 2026-01-23
---

# Phase 2 Plan 1: Text Extraction Summary

**Two-tier PDF text extraction with pdfjs-dist for digital PDFs and Mistral OCR fallback for scanned documents, storing per-page text in SQLite for downstream agent processing**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-01-23T13:25:12Z
- **Completed:** 2026-01-23T13:29:46Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Implemented fast local text extraction using pdfjs-dist for digital PDFs
- Added Mistral OCR API fallback for scanned PDFs (< 100 chars/page threshold)
- Created contract_pages SQLite table for per-page storage with source tracking
- Integrated text extraction into the contract processing pipeline
- Full processing status tracking (processing -> completed/failed)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create types, schema, and storage layer** - `bebcc7b` (feat)
2. **Task 2: Implement digital and OCR extractors** - `38858cb` (feat)
3. **Task 3: Create main orchestrator and wire to pipeline** - `aa18890` (feat)

## Files Created/Modified
- `services/contract/extraction/types.ts` - ExtractedPage and ExtractionResult type definitions
- `services/contract/extraction/storage.ts` - SQLite storage functions (storeExtractedPages, getExtractedPages, getFullText)
- `services/contract/extraction/digital-extractor.ts` - pdfjs-dist text extraction for digital PDFs
- `services/contract/extraction/ocr-extractor.ts` - Mistral OCR API integration for scanned PDFs
- `services/contract/extraction/text-extractor.ts` - Two-tier extraction orchestrator
- `lib/db/index.ts` - Added contract_pages table and index
- `services/contract/pipeline/dedup.ts` - Updated markAsProcessed to return contract ID
- `services/contract/pipeline/index.ts` - Integrated extraction into pipeline handler

## Decisions Made
- **100 chars/page threshold:** Empirical cutoff to detect scanned PDFs - documents with less than 100 average characters per page are likely scanned images
- **Data URL approach:** Mistral OCR accepts base64-encoded documents via data URLs, avoiding need for file upload API
- **Markdown table format:** OCR configured to preserve table structure as markdown for downstream processing
- **Per-page storage:** Enables page-level citations for human verification of extracted data

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Biome linter has `useConsistentTypeDefinitions` rule preferring `interface` over `type`, but CLAUDE.md specifies to use `type`. This is a style conflict, not a bug - types work correctly.

## User Setup Required

**External services require manual configuration.** The plan references Mistral API:

**MISTRAL_API_KEY:**
- Source: Mistral Console -> API Keys -> Create new key (https://console.mistral.ai/api-keys/)
- Add to `.env`: `MISTRAL_API_KEY=your_api_key_here`

**Verification:**
```bash
bun -e "import { extractWithOcr } from './services/contract/extraction/ocr-extractor'; console.log('Mistral import OK')"
```

## Next Phase Readiness
- Text extraction pipeline complete and ready for Phase 3 (Entity Extraction)
- Per-page text with source tracking available in contract_pages table
- Pipeline integration tested - files dropped in watch folder are processed end-to-end
- MISTRAL_API_KEY required for OCR functionality (digital PDFs work without it)

---
*Phase: 02-text-extraction*
*Completed: 2026-01-23*
