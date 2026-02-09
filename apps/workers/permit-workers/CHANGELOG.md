# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-15

**OFFICIAL RELEASE:** `auto-dust-permit` is now live!

### 🚀 Major Features

- **Containerized Stack**: Single Docker image (`ghcr.io/chikingsley/auto-dust-permit`) running Server, Dashboard, and VNC.
- **Full Automation**: Complete support for Creating, Revising, Renewing, and Closing permits.
- **Intelligent Filling**: Hybrid approach using robust selectors with AI-powered PDF extraction for input data.
- **Visual Dashboard**: React-based UI for managing permits and monitoring automation.
- **Live Debugging**: VNC integration allows real-time viewing of the automated browser.
- **API First**: REST API for all major operations (Create, Extract, Revise, etc.).

### 🏗️ Infrastructure

- **Deployment**: Simply copy `docker-compose.yml` and `.env` to any machine to deploy.
- **Performance**: Optimized Puppeteer/Playwright scripts with smart waiting and frame handling.
- **Database**: SQLite with WAL mode for reliable local state management.

### Removed

- **Cloudflare Tunnels**: Moved to direct container deployment.
- **Notion Integration**: Legacy webhook code removed in favor of direct API.

---

## [Unreleased]

### Added (2025-01-04)

- **Webhook Source Interface** - Created `server/src/webhook-source-interface.ts` defining data contract for any webhook source
- **ProjectFiles Schema** - Standardized interface for receiving project files (NOI, SWPPP Plan PDFs)
- **Local Pipeline Script** - Created `src/create-application-full.ts` for running full pipeline from JSON file

### Removed (2025-01-04)

- **Archive folder** - Deleted `archive/archive-stagehand/` (old Stagehand V2 code)
- **Dashboard folder** - Deleted `dashboard/` root directory (React UI)
- **Notion integration** - Removed `server/src/services/notion.ts` and webhook handler
- **Seed data** - Removed mock permit data from `server/src/routes/permits.ts` (was for deleted dashboard)

### Changed (2025-01-04)

- **Decoupled pipeline** - `runFullPipeline()` now accepts `ProjectFiles` directly instead of Notion-specific types
- **Cleaned package.json** - Removed unused React UI dependencies (Tailwind, Radix UI, Motion)
- **Updated scripts** - Added `bun run start`, `bun run dev`, `bun run pipeline`
- **Simplified routes** - Removed Notion webhook endpoint from `server/src/index.ts`

### Fixed (2025-01-04)

- **Import errors** - Fixed deleted imports in `server/src/index.ts` and `src/create-application-full.ts`
- **TypeScript errors** - All type checks pass (`bun run typecheck`)

---

## [Previous]

### Removed (2024-12-18)

- **Major Codebase Reorganization**
  - Created `src/new-application/` folder for Notion integration pipeline
  - Moved `dashboard/` → `notion-webhook/` (self-contained Elysia server + React frontend)
  - Moved `pdf-pipeline/` + `jina.ts` → `notion-extraction/`
  - Moved `companies-db.ts` → `company-lookup/index.ts`
  - Moved `db.ts` → `src/scraper/db.ts` (colocated with scraper)
  - Created `extraction-schema.ts` - Maps form questions to selectors with Primary/Contingency validation rules
  - Organized docs into folders: `api-reference/`, `notion/`, `permit-process/`

- **Docker files** - Dockerfile, docker-compose.yml, .dockerignore (exploring Cloudflare deployment instead)
- **scripts/** folder - One-off utility scripts with broken imports
- **Test PDFs** - `src/pdfs-for-testing/` removed from repo
- **Outdated docs** - STAGEHAND-PLAN.md, architecture.md, extraction-benchmark.md, optimization-research.md, shadcn-vite.md, fire-access-signs-guide.md, observations/

### Changed (2024-12-15)

- **Project Consolidation & Scraper Integration**
  - Merged scraper code into main repo (`src/scraper/`)
  - Created unified Jina service (`src/lib/jina.ts`) for HTML + PDF extraction
  - Moved database helpers to shared lib (`src/lib/db.ts`)
  - Added navigation functions to `src/lib/application.ts`
  - Renamed `src/server/` → `src/notion/` (better reflects Notion webhook purpose)
  - Added `jinaApiKey`, `searchUrl`, `outputDir` to config

- **Form Automation Stability Fixes**
  - Added element readiness verification with retry logic (3 retries, 100-300ms backoff)
  - Added value verification after filling text fields, radios, checkboxes
  - Centralized timing constants (`SETTLE_MS=500ms`, `RETRY_DELAY_MS=100ms`, `ELEMENT_TIMEOUT_MS=5000ms`)
  - Reduced `resolveControlLocator()` timeout from 10s → 5s
  - Added completion logging for Pages 1, 3, 4

### Changed (2024-12-14)

- **Modular Fill Pages System**
  - New `src/fill/` folder with organized modules replacing monolithic `fill-pages.ts`
  - Structure:
    - `index.ts` - Main orchestrator
    - `helpers.ts` - Shared utilities, constants, safe wrappers
    - `page-transition.ts` - Simple, reliable clickNext (matching delete-all.ts pattern)
    - `page1.ts` - Page 1 (Applicant Info) harness
    - `page3.ts` - Page 3 (Project Details) harness
    - `page4.ts` - Page 4 (Dust Control Plan) harness
    - `page5.ts` - Page 5 (Submit) harness
    - `popup.ts` - New app popup handler

### Fixed (2024-12-14)

- Page 1→2 transition failures (caused by over-engineered clickNext with multiple simultaneous fire strategies)
- Page 3→4 transition timeouts (caused by reduced timeout from 35s to 5s)
- Fields not filling on Page 1 (caused by missing settle times between interactions)
- Observe+act fallback never working (setStagehand() was never called)

### Added (2024-12-11)

- **PDF Pipeline System**
  - New `src/pdf-pipeline/` folder (renamed from `src/extraction/`)
  - `smart-triage.ts` - Document classification with filename patterns + Gemini fallback (90% accuracy)
  - `extract-all.ts` - Full extraction pipeline: triage → extract → merge permit data
  - `schema.ts` - Zod schemas for all document types (107 fields)
  - Features:
    - KB/page heuristic to detect drawings vs text PDFs (500 KB/page threshold)
    - Contact filtering: rejects desertservices.com contacts, only accepts contacts from NOI
    - Gemini vision mode for construction drawings
    - Document type classification: NOI_NDC, SWPPP, GRADING_PLAN, GEOTECH_REPORT, SPECIFICATIONS, UTILITY_PLAN, SITE_PLAN, STRUCTURAL, PERMIT_APP, LANDSCAPE

### Added (2024-12-10)

- **PDF Extraction System** - Approach: Jina Reader (PDF → text) + Gemini 2.5 Flash (text → structured JSON)
- Added `pdf-lib` and `sharp` dependencies for PDF/image processing

### Fixed (2024-12-07)

- **delete-all draft applications bugs**
  - Removed `.slice(0, 10)` that limited app discovery to 10 (now finds all)
  - Fixed Stagehand's `page.locator()` - `hasText` option not supported, use `evaluate()` instead
  - Fixed `deletePopup.isClosed()` - Stagehand Page doesn't have this method, check page count instead

### Added (2024-12-03)

- **Phase 2.6: Company Decision Flow**
  - CSV lookup for contractor-list.csv (143 known contractors)
  - `isKnownContractor()` function in config.ts with caching
  - Auto-detect new vs existing company based on CSV lookup
  - `IS_NEW_COMPANY=true` env var override available
  - New Company checkbox selector and helper function
  - Branching logic in `handleNewAppPopup()` for existing vs new company flows

- **Smart element waiting with granular timing**
  - `waitForElement(page, selector)` - polls until element appears on main page
  - `waitForElementInFrame(page, selector)` - polls across frames until element found
  - Applied "next step's selector" pattern - wait for element next step needs
  - **Popup flow reduced from 23s → 11s** (saved ~12 seconds!)
  - Granular timing separates Network waits (server) from Flow time (our code)

### Added (2024-12-03)

- **Delete Application flow**
  - Automatic cleanup of test applications after creation
  - Handles delete confirmation popup with frame navigation
  - Clicks Delete confirmation, then Cancel to close popup
  - Prevents manual cleanup during testing

- **Step numbering for debugging**
  - All functions now have numbered steps (Step 1, Step 2, etc.)
  - Consistent logging format across all flows
  - Easier to identify where failures occur

- **Performance tracking system**
  - High-precision timing using `Bun.nanoseconds()` for step-by-step measurement
  - Stagehand metrics integration for LLM inference time and token tracking
  - Automatic performance logs saved to `logs/performance-*.log`
  - Real-time timing display with ⏱️ emoji for each step
  - Performance summary at end showing total time, LLM vs Browser/DOM breakdown
  - **Current baseline: ~60 seconds total** (Login: 21s, Navigate: 16s, Popup: 23s)

- **Improved logging system**
  - Shows method used: `[Direct Selector]` vs `[Frame N]`
  - Displays both failures and successes for frame iteration
  - Clear visibility into which approach is working at each step

### Added (2024-12-02)

- **CI/CD & Code Quality**
  - Ultracite setup (Biome linter/formatter with opinionated presets)
  - Husky pre-commit hooks for automatic formatting
  - lint-staged configuration
  - Bun global added to JavaScript environment

### Added (2024-12-01)

- **Stagehand + Gemini integration** for browser automation
- Project structure with `src/` directory
- Configuration system (`src/config.ts`)
- TypeScript types and Zod schemas (`src/types.ts`)
- Stagehand helper utilities (`src/stagehand.ts`)
- Phase 1 login script (`src/phases/01-login.ts`)
- Documentation folder (`docs/`)
- Phased TODO.md for development tracking
- Environment template (`.env.example`)
