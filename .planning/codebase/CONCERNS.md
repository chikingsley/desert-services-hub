# Codebase Concerns

**Analysis Date:** 2026-01-22

## Tech Debt

**Large Service Files with High Cyclomatic Complexity:**

- Issue: Multiple files exceed 1000+ lines with complex business logic bundled together
- Files: `services/email/client.ts` (2423 lines), `services/n8n/client.ts` (1558 lines), `services/quoting/catalog.ts` (1396 lines), `services/quoting/pdf.ts` (1053 lines), `lib/pdf/pdf-builder.ts` (987 lines)
- Impact: Difficult to test in isolation, high cognitive load for modifications, increased bug surface area
- Fix approach: Break into focused modules with single responsibilities (auth, API calls, data transformation separately)

**PDF Highlighter Component Complexity:**

- Issue: `lib/pdf-takeoff/components/pdf-highlighter.tsx` (920 lines) contains intertwined state management for multiple drawing modes, rendering logic, and event handling
- Files: `lib/pdf-takeoff/components/pdf-highlighter.tsx`, `lib/pdf-takeoff/components/drawing-canvas.tsx`, `lib/pdf-takeoff/components/shape-canvas.tsx`
- Impact: Difficult to add new highlight types or fix mode-specific bugs without affecting other modes
- Fix approach: Extract drawing mode logic into separate custom hooks; use a reducer pattern for mode state transitions

**Biome Linter Suppressions (Intentional but Worth Tracking):**

- Issue: Multiple linter overrides in `biome.jsonc` disable a11y and interaction rules on PDF takeoff components
- Files: `biome.jsonc` lines 66-86 (pdf-takeoff), lines 89-104 (catalog/takeoff-viewer)
- Impact: Accessibility features not enforced on interactive PDF tools; potential a11y debt
- Fix approach: Implement proper ARIA labels and keyboard event handling to re-enable linter rules

**Excessive Complexity in Catalog Content Component:**

- Issue: `src/frontend/components/catalog/catalog-content.tsx` (939 lines) manages 11+ dialog states and edit modes through individual `useState` calls
- Files: `src/frontend/components/catalog/catalog-content.tsx`
- Impact: State mutations are fragmented; difficult to reason about data flow; easy to create inconsistent states
- Fix approach: Use a single reducer for all catalog operations (add/edit/delete category/subcategory/item); consolidate dialog state

**Manual PDF Border Math in Two Places:**

- Issue: PDF table border logic (0.5pt borders that sum to 1pt) is duplicated in `lib/pdf/pdf-builder.ts` and `services/quoting/pdf.ts`
- Files: `lib/pdf/pdf-builder.ts` lines 29-46, `services/quoting/pdf.ts` lines 52-72
- Impact: Maintenance burden if border styling needs to change; inconsistency risk
- Fix approach: Create shared PDF layout constants module

---

## Known Bugs

**Screenshot Caching TODO Not Implemented:**

- Symptoms: PDF takeoff screenshot generation may be slow on large PDFs; no caching layer
- Files: `lib/pdf-takeoff/lib/screenshot.ts` line 9 (comment: "// @TODO: cache this?")
- Trigger: Every time a user exports a takeoff PDF with large source PDFs
- Workaround: None; users experience delay
- Impact: Performance degradation on large documents

**Text Selection Clearing Logic Uncertain:**

- Symptoms: Clearing text selection when clicking on highlight tips may have edge cases
- Files: `lib/pdf-takeoff/components/pdf-highlighter.tsx` line 575 (comment: "// TODO: Check if clearing text selection only if not clicking on tip breaks anything")
- Trigger: Click on a highlight tip after making a text selection
- Workaround: None identified
- Impact: Unexpected text selection behavior in edge cases

**Quote Workspace Version Finalization Missing:**

- Symptoms: Version finalization logic not implemented despite UI affordance
- Files: `src/frontend/components/quotes/quote-workspace.tsx` line 388 (comment: "// TODO: Implement version finalization")
- Trigger: User clicks "Finalize Version" button
- Workaround: Workaround: Users must manually manage version workflow
- Impact: Feature appears to work but does nothing

---

## Security Considerations

**Console Logs in Production:**

- Risk: Debug output, internal state, and error details may leak to browser console and server logs
- Files: `lib/db/insurance.ts` (10+ console.log calls), `lib/pdf-takeoff/components/pdf-highlighter.tsx`, `lib/pdf-takeoff/components/drawing-canvas.tsx`, `src/frontend/components/quotes/quote-workspace.tsx`
- Current mitigation: None (console.log calls remain in production builds)
- Recommendations: Remove all console.log/console.error calls from non-test code; use structured logging for errors only; filter sensitive data from error messages

**Unhandled Promise Rejections:**

- Risk: Silent failures if async operations fail and `.catch()` handlers suppress errors
- Files: `src/frontend/components/quotes/quote-workspace.tsx` lines 250, 270, 307 (.catch with no logging), `lib/pdf/generate-client.ts` line 54 (catch but re-reject)
- Current mitigation: Some catch handlers are empty silencers
- Recommendations: Add logging to all error handlers; use error boundary for React components; propagate critical errors to user

**Type Assertions Hiding Issues:**

- Risk: `as unknown` and `as MouseEvent` type assertions in `lib/pdf-takeoff/components/count-marker-highlight.tsx` bypass type safety
- Files: `lib/pdf-takeoff/components/count-marker-highlight.tsx` line 82: `onClick(e as unknown as MouseEvent<HTMLDivElement>)`
- Current mitigation: None
- Recommendations: Refactor event handler to properly type events instead of asserting; use type narrowing

**Missing .env Validation:**

- Risk: Bun auto-loads .env files but no validation that required vars exist at startup
- Files: `lib/db/index.ts`, services/email, services/n8n require Azure/Google credentials
- Current mitigation: Variables accessed directly without null checks
- Recommendations: Create env validation module that runs on startup and fails fast with helpful error if required vars missing

---

## Performance Bottlenecks

**PDF Rendering and Annotation Accumulation:**

- Problem: PDF highlighter stores all annotations in memory; no pagination or virtualization for large documents
- Files: `lib/pdf-takeoff/components/pdf-highlighter.tsx`, `lib/pdf-takeoff/lib/group-highlights-by-page.ts`
- Cause: Every highlight for every page is kept in memory and re-rendered on interaction
- Improvement path: Implement page-based highlight loading; lazy-load annotations for off-screen pages; implement undo/redo with history compaction

**Loop-Based Page Iteration:**

- Problem: `for (let i = 0; i < viewer.pagesCount; i++)` pattern used in multiple canvas components
- Files: `lib/pdf-takeoff/components/polygon-canvas.tsx` line 115, `lib/pdf-takeoff/components/drawing-canvas.tsx` line 99, `lib/pdf-takeoff/components/polyline-canvas.tsx` line 86, `lib/pdf-takeoff/components/count-canvas.tsx` line 76, `lib/pdf-takeoff/components/shape-canvas.tsx` line 100
- Cause: Not using for...of loops; no early exit optimization
- Improvement path: Switch to for...of; add early exit condition; cache viewer.pagesCount

**Database Query Performance - No Indexes on Foreign Keys:**

- Problem: Foreign key columns (e.g., `quote_id`, `version_id` in quote_line_items) used in WHERE clauses without indexes
- Files: `lib/db/index.ts` - quote_sections, quote_line_items tables
- Cause: Only base_number has unique index; quote foreign key lookups will scan entire table
- Improvement path: Add indexes on `quote_id`, `version_id`, `section_id` in quote tables; add index on `bundle_id` and `item_id` in catalog_bundle_items

**Catalog Search Has No Full-Text Index:**

- Problem: `monday_search_vectors` FTS5 table created but not used; searches likely doing string matching
- Files: `lib/db/index.ts` lines 225-236 (FTS5 creation with try-catch), no search queries visible
- Cause: FTS5 fallback may not be available; search fallback to LIKE is slow on large catalogs
- Improvement path: Verify FTS5 is used for searches; implement proper ranking; add composite indexes on frequently searched columns

**Measurement Calculations Loop Over Points Multiple Times:**

- Problem: `lib/pdf-takeoff/lib/measurements.ts` calculates perimeter and area with separate loops; could combine
- Files: `lib/pdf-takeoff/lib/measurements.ts` lines 18-26 (perimeter loop), lines 38-46 (area loop)
- Cause: Separate loop passes for each calculation
- Improvement path: Combine loops; reduce O(n) to single pass

---

## Fragile Areas

**PDF Takeoff Module - Tight Coupling to pdfjs-dist:**

- Files: `lib/pdf-takeoff/` entire directory
- Why fragile: Global state pattern (`globalThis.pdfjsLib`) required for pdf.js v5+; async module loading in effect; state not centralized
- Safe modification: Only modify through exposed components; don't access global pdfjsLib directly; ensure module-level async is completed before use
- Test coverage: `tests/lib/pdf-takeoff/measurements.test.ts` exists but limited; no integration tests for rendering
- Recommendation: Mock pdf.js in tests; add E2E tests for highlight creation/export; document pdfjs initialization pattern

**Quote Version State Machine:**

- Files: `lib/db/index.ts` (schema), `src/api/quotes-by-id.ts`, `src/frontend/components/quotes/quote-workspace.tsx`
- Why fragile: `is_current` flag in quote_versions not enforced; no constraint preventing multiple current versions; version finalization missing
- Safe modification: Always wrap version updates in transaction; add CHECK constraint to database; implement version finalization before allowing new versions
- Test coverage: `src/api/quotes.test.ts` tests basic CRUD but not version state transitions
- Recommendation: Add test for "switching current version"; add database constraint `CHECK ((is_current = 0) OR (SELECT COUNT(*) FROM quote_versions WHERE quote_id = ? AND is_current = 1) <= 1)`

**Highlight Type Union in pdf-takeoff:**

- Files: `lib/pdf-takeoff/types.ts`, `lib/pdf-takeoff/lib/export-data.ts`
- Why fragile: `Highlight | GhostHighlight | null` union used throughout; adding new highlight type requires changes across multiple files
- Safe modification: Use discriminated unions with type guards; avoid null in unions (use separate optional field)
- Test coverage: No explicit tests for highlight type narrowing
- Recommendation: Create type guard functions; add tests for each highlight type path

**Email Credential Management:**

- Files: `services/email/client.ts`, `services/email/token-cache.ts`
- Why fragile: Private cached credentials held in memory; no credential rotation; token cache relies on file system
- Safe modification: Don't modify token cache directly; always use public methods; never log tokens
- Test coverage: `services/email/tests/client.integration.test.ts` exists but uses live Azure credentials
- Recommendation: Implement credential rotation; move to secure vault; mock credentials in unit tests

---

## Scaling Limits

**SQLite Single-File Database:**

- Current capacity: Designed for single-user/small team; WAL mode supports some concurrency but limited
- Limit: Breaks at high concurrent write load (>10 simultaneous writes); file size grows without pruning
- Scaling path: Migrate to PostgreSQL for concurrent writes; implement data archival strategy for old quotes/takeoffs; add connection pooling

**PDF Annotation Memory Growth:**

- Current capacity: Annotations stored in-memory as JSON strings in SQLite; no size limits
- Limit: Large PDFs with hundreds of annotations cause memory spikes during export
- Scaling path: Stream annotations from database during export; implement pagination for large annotation sets; compress annotation data

**Email Client Rate Limiting:**

- Current capacity: No rate limiting implemented; Microsoft Graph API has 1000 requests/min per tenant
- Limit: High-volume operations (bulk search, archive) can hit rate limits and fail silently
- Scaling path: Implement exponential backoff; add queue for email operations; batch requests where possible

---

## Dependencies at Risk

**pdfjs-dist v5.4.530 - Requires Global State:**

- Risk: pdfjs-dist v5+ requires `globalThis.pdfjsLib` to be set before importing pdf_viewer; breaks in some environments
- Impact: PDF viewing fails; takeoff annotation tools become unusable
- Migration plan: Monitor pdfjs-dist releases for v6+; upgrade carefully with integration tests

**pdfmake ^0.2.20 - Inactive Maintenance:**

- Risk: pdfmake last major release was v0.2.x; npm shows low activity; no TypeScript support without @types package
- Impact: Custom fonts, advanced features may not work; breaking changes in dependencies could require workarounds
- Migration plan: Evaluate alternatives (PDFKit, iText7); ensure PDF export tests are comprehensive before upgrading

**Playwright ^1.57.0 - Heavy Dependency:**

- Risk: Playwright is a large dependency (100MB+) only used in tests; brings Chromium binary
- Impact: Slow installations; large docker images if included in production; may not be needed for current use
- Migration plan: Evaluate if actually used; consider moving to devDependencies only; or replace with lighter alternative for PDF testing

**@microsoft/microsoft-graph-client v3.0.7 - Auth Pattern Complex:**

- Risk: Graph client requires manual auth provider setup; token refresh not automatic in all flows
- Impact: Token expiry can cause silent failures in email operations; unclear error messages
- Migration plan: Implement comprehensive token refresh logic; add monitoring for auth failures; consider simplified wrapper

**Radix UI - Fixed Versions:**

- Risk: Many Radix components pinned to exact versions (1.1.15, 1.3.3, 2.1.16) while others use caret (^1.1.12)
- Impact: Inconsistent minor version upgrades; potential incompatibilities between components
- Migration plan: Standardize all Radix packages to same caret range; test before upgrading

---

## Missing Critical Features

**Quote Locking/Approval Workflow:**

- Problem: `quotes.is_locked` column exists but no implementation; no approval state or audit trail
- Blocks: Cannot prevent accidental quote edits after sending to client; no approval required for large quotes
- Recommendation: Implement state machine (draft → sent → approved → accepted); add audit log; prevent edits on locked quotes

**Database Migration System:**

- Problem: No migration framework; schema changes must be manual; no version tracking
- Blocks: Cannot safely evolve schema in production; rollbacks require manual SQL; risky for teams
- Recommendation: Implement Drizzle ORM or similar; version schema; create migration files; test migrations

**Error Boundary in React App:**

- Problem: No error boundary wrapping app; uncaught errors in components crash entire UI
- Blocks: User loses work if a component throws during save
- Recommendation: Implement Error Boundary component; wrap quote-workspace and takeoff-viewer; log errors to monitoring service

**Structured Logging:**

- Problem: console.log used throughout; no log levels, timestamps, or structured format
- Blocks: Difficult to debug production issues; no log aggregation possible; sensitive data may leak
- Recommendation: Replace console with pino or winston; add log levels; filter sensitive fields; ship logs to observability platform

---

## Test Coverage Gaps

**API Route Tests Incomplete:**

- What's not tested: Error handling paths; edge cases like invalid IDs; missing required fields; cascading deletes
- Files: `src/api/quotes.test.ts` (765 lines) - tests happy path extensively but limited error coverage
- Risk: Bugs in error handling silently deployed to production; data integrity issues not caught
- Priority: **High** - API errors directly impact data consistency

**PDF Export Tests Limited:**

- What's not tested: Large PDFs (100+ pages); many line items (1000+); special characters in descriptions; missing catalog items
- Files: `tests/lib/pdf/*.test.ts` - tests basic structure but not edge cases or performance
- Risk: PDFs may fail silently or produce corrupted output for real-world quotes
- Priority: **High** - directly impacts customer-facing deliverable

**Email Client Integration Tests Use Live Credentials:**

- What's not tested: Auth failures; network timeouts; malformed email responses; batch operations
- Files: `services/email/tests/client.integration.test.ts` - only tests happy path with real Azure credentials
- Risk: Auth changes in Azure silently break email integration; no defensive code paths tested
- Priority: **Medium** - affects automated workflows but fallback is manual

**Takeoff Annotation Export Tests Missing:**

- What's not tested: Large annotation sets; mixed annotation types (drawings + shapes + text); coordinate precision
- Files: No dedicated tests for `lib/pdf-takeoff/lib/export-data.ts` or `lib/pdf-takeoff/lib/export-pdf.ts`
- Risk: Annotation data loss or corruption on export not caught; coordinates may drift
- Priority: **High** - core feature with no safety net

**Monday.com Sync Edge Cases Not Covered:**

- What's not tested: Deleted items; board permission changes; API rate limiting; partial failures
- Files: `lib/monday-search.ts` (no test file) - no tests visible
- Risk: Monday sync fails silently; users get stale data without knowing
- Priority: **Medium** - impacts data freshness but system continues functioning

---

## Biome Configuration Bypasses

**Accessibility Rules Disabled on Interactive Components:**

- Disabled rules: `noStaticElementInteractions`, `noNoninteractiveElementInteractions`, `useKeyWithClickEvents`, `useKeyWithMouseEvents`, `useSemanticElements`
- Files: `biome.jsonc` lines 66-86 (pdf-takeoff), lines 89-104 (specific components)
- Reason: PDF takeoff tools use custom event handling on divs; not standard HTML patterns
- Recommendation: Gradually migrate to semantic HTML with proper ARIA; implement keyboard event handlers alongside mouse handlers

**Complex Cognitive Complexity Allowed:**

- Disabled rule: `noExcessiveCognitiveComplexity`
- Files: Line 15 in `biome.jsonc`
- Reason: Legacy components have high complexity
- Recommendation: Re-enable rule; fix violations one at a time; set threshold to 15 instead of default 20

**Barrel Files Not Enforced in pdf-takeoff:**

- Disabled rule: `noBarrelFile` on `lib/pdf-takeoff/index.ts`
- Files: Line 56-64 in `biome.jsonc`
- Reason: Convenience for exports; reduces import paths
- Recommendation: Refactor exports to be specific; prefer direct imports to improve tree-shaking

---

*Concerns audit: 2026-01-22*
