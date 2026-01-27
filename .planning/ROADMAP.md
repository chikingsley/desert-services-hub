# Roadmap: Contract Cascade

## Overview

Contract Cascade transforms contract PDFs into actionable Notion tasks with full context. The pipeline watches a folder for incoming contracts, extracts structured data using parallel AI agents, matches to existing estimates in Monday.com, and creates a project row in Notion with task-step columns. Five phases build sequentially: folder trigger, text extraction, multi-agent data extraction, estimate matching, and Notion task orchestration.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Pipeline Foundation** - Folder watching and PDF detection trigger
- [x] **Phase 2: Text Extraction** - OCR PDFs to searchable text via Mistral
- [x] **Phase 3: Multi-Agent Extraction** - Parallel agents extract structured contract data with citations
- [ ] **Phase 4: Estimate Matching** - Fuzzy match contracts to Monday.com estimates
- [ ] **Phase 5: Task Orchestration** - Create Notion project rows with task-step columns and verification

## Phase Details

### Phase 1: Pipeline Foundation

**Goal**: System detects new contract PDFs and triggers processing
**Depends on**: Nothing (first phase)
**Requirements**: TRIG-01, TRIG-02, TRIG-03
**Success Criteria** (what must be TRUE):

  1. Dropping a PDF into the watched folder triggers the processing pipeline
  2. System works with local folder (SharePoint integration deferred)
  3. Duplicate files (same filename) are not reprocessed
**Plans**: 1 plan

Plans:

- [x] 01-01-PLAN.md - Folder watcher with chokidar and SQLite deduplication

### Phase 2: Text Extraction

**Goal**: Contract PDFs are converted to searchable text for agent processing
**Depends on**: Phase 1
**Requirements**: OCR-01, OCR-02, OCR-03
**Success Criteria** (what must be TRUE):

  1. Digital PDFs have text extracted accurately
  2. Scanned PDFs are OCR'd using Mistral and text is readable
  3. Extracted text is stored and available for multiple extraction agents
**Plans**: 1 plan

Plans:

- [x] 02-01-PLAN.md - Two-tier text extraction (pdfjs-dist + Mistral OCR) with per-page SQLite storage

### Phase 3: Multi-Agent Extraction

**Goal**: Parallel agents extract all contract data fields with page citations
**Depends on**: Phase 2
**Requirements**: EXTR-01, EXTR-02, EXTR-03, EXTR-04, EXTR-05, EXTR-06, EXTR-07, EXTR-08, EXTR-09, EXTR-10
**Success Criteria** (what must be TRUE):

  1. Contract info, billing, contacts, SOV, insurance, site info, and red flags are all extracted
  2. Each extraction includes page number or section citation for human verification
  3. Agents run in parallel for speed (not sequentially)
  4. All outputs are validated against Zod schemas (no unstructured data)
  5. Red flags (unusual terms, vague language, missing info) are surfaced
**Plans**: 3 plans

Plans:

- [x] 03-01-PLAN.md - Foundation: Types, Zod schemas for all 7 domains, storage layer
- [x] 03-02-PLAN.md - Agent implementations (pivoted: Claude Code via `claude -p` instead of Mistral)
- [x] 03-03-PLAN.md - Pipeline integration: Auto-extraction via `claude -p` after text extraction

### Phase 4: Estimate Matching

**Goal**: Contracts are linked to their original estimates in Monday.com
**Depends on**: Phase 3
**Requirements**: MATCH-01, MATCH-02, MATCH-03, MATCH-04, MATCH-05
**Success Criteria** (what must be TRUE):

  1. System fuzzy-matches contract to Monday ESTIMATING board using project name + contractor
  2. High-confidence matches (>0.8) are auto-selected
  3. Low-confidence matches present top 3-5 options for human selection
  4. Contract is linked to matched estimate in Monday
**Plans**: 2 plans

Plans:

- [ ] 04-01-PLAN.md - Core matching module: types, multi-field scorer, matcher, storage
- [ ] 04-02-PLAN.md - Pipeline integration and human selection flow

### Phase 5: Task Orchestration

**Goal**: Notion project rows are created with task-step columns and human verification
**Depends on**: Phase 4
**Requirements**: NOTION-01, NOTION-02, NOTION-03, NOTION-04, NOTION-05, NOTION-06, VERIFY-01, VERIFY-02, VERIFY-03
**Success Criteria** (what must be TRUE):

  1. Project row is created in Notion database with all extracted context
  2. Task-step columns have 3 statuses (N/A, To Do, Done): Reconciled, Contractor Emailed, QuickBooks Updated, Monday Updated, Team Notified, Dust Permit Started, SWPPP Ordered, SharePoint Updated
  3. Task columns default based on contract type (e.g., Dust Permit N/A if not detected)
  4. Project page links to source PDF
  5. Extracted data is visible with citations; human can edit before acting
  6. Low-confidence extractions are flagged for review
  7. Deduplication prevents duplicate projects for same contract
**Plans**: TBD

Plans:

- [ ] 05-01: Notion project row creation with task-step columns
- [ ] 05-02: Context attachment and PDF linking
- [ ] 05-03: Human verification interface and confidence flagging

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Pipeline Foundation | 1/1 | Complete | 2026-01-23 |
| 2. Text Extraction | 1/1 | Complete | 2026-01-23 |
| 3. Multi-Agent Extraction | 3/3 | Complete | 2026-01-23 |
| 4. Estimate Matching | 0/2 | Planned | - |
| 5. Task Orchestration | 0/3 | Not started | - |

---
*Roadmap created: 2026-01-23*
*Last updated: 2026-01-23*
