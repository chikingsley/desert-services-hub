# Desert Services Hub - Master TODO

**Last Updated:** 2025-01-20

This is the master task list for the Desert Services Hub application and related automation projects.

---

## CRITICAL - Fix Immediately

### 1. Finalize Button Non-Functional

- [ ] **Implement `handleFinalize()`** - `components/quotes/quote-workspace.tsx:395`
  - Button exists but handler is empty
  - Should: Lock current version, create new version, update UI
  - Use existing `is_locked` column in database

### 2. Console.log in Production

- [ ] **Remove console.log statements** - `app/api/webhooks/monday/route.ts`
  - Lines 13, 24: `console.log("Monday webhook challenge received");`
  - Violates Ultracite standards

---

## HIGH PRIORITY - Quote Builder Gaps (from QUOTE-BUILDER-REDESIGN.md)

### 3. Missing Undo/Redo UI

- [ ] **Add undo/redo buttons to quote header** - `components/quotes/quote-workspace.tsx`
  - Hook exists and is fully wired (`use-quote-editor.ts` exports undo, redo, canUndo, canRedo)
  - Just needs buttons in the header toolbar
  - Match takeoff editor button style/placement

- [ ] **Add keyboard shortcuts** - `components/quotes/quote-workspace.tsx`
  - Ctrl+Z for undo
  - Ctrl+Shift+Z or Ctrl+Y for redo
  - Add event listeners in useEffect

### 4. Upload Modal Not Implemented

- [ ] **Create takeoff upload modal** - `components/takeoffs/upload-modal.tsx` (new file)
  - Design doc calls for modal-based upload from quotes list
  - Current flow goes to separate `/takeoffs/new` page
  - Modal should open from quotes header, navigate to takeoff editor after upload

### 5. Takeoff/Quote Segmented Toggle

- [ ] **Add segmented control in quote editor** - when quote has linked takeoff
  - Toggle between [Takeoff] and [Quote] views
  - Only show when quote has `takeoff_id`
  - Design doc "Option C from prototype"

### 6. Versioning (Phase 4 - Entire phase pending)

- [ ] **Finalize creates new version** - Lock current, create v(n+1)
- [ ] **Don't overwrite finalized versions** - Check `is_locked` before save
- [ ] **Show version number in UI** - Display "v1 (Draft)" or "v2 (Final)"
- [ ] **Add revision notes field** - Per-version comment explaining changes
- [ ] **Add database columns** - `lib/db/index.ts`
  - `quote_line_items.version_added INTEGER DEFAULT 1`
  - `quote_line_items.version_removed INTEGER`

---

## MEDIUM PRIORITY - Takeoff System Gaps (from QUOTING-APP-DESIGN.md)

### 7. Custom Scale Calibration

- [ ] **Add calibration tool** - `components/takeoffs/floating-tools.tsx`
  - Current: Only preset scales (1"=5', 1"=10', etc.)
  - Needed: Draw a known distance, enter real length, calculate pixelsPerFoot
  - More accurate than presets for non-standard plans

### 8. Takeoff Undo/Redo

- [ ] **Add undo/redo to takeoff editor** - `app/takeoffs/[id]/page.tsx`
  - Library supports it but app doesn't use it
  - Critical for fixing mistakes during annotation

### 9. "Update from Takeoff" Action

- [ ] **Add sync button on quote** - `components/quotes/quote-workspace.tsx`
  - Re-sync measurements from linked takeoff
  - Update quantities based on current annotations

---

## MEDIUM PRIORITY - Storage/Performance (from STORAGE-AND-OPTIMIZATION.md)

### 10. PDF Compression

- [ ] **Create compression pipeline** - `lib/pdf-compression.ts` (new file)
  - Use pdf-lib (already installed v1.17.1)
  - Remove metadata, use object streams
  - Store both original and optimized versions
  - Track compression ratio in MinIO tags

### 11. Screenshot Caching

- [ ] **Add LRU cache to screenshot function** - `lib/pdf-takeoff/lib/screenshot.ts:9`
  - TODO comment: `// @TODO: cache this?`
  - Cache key: `${takeoffId}-${annotationId}-${positionHash}`
  - Clear when annotation deleted

### 12. Mouse Event Throttling

- [ ] **Throttle mouse events** - `lib/pdf-takeoff/components/mouse-monitor.tsx:70`
  - TODO comment: `// TODO: Maybe optimise or throttle?`
  - Use lodash.throttle (need to install) or lodash.debounce (already installed)
  - Target: 60fps (16ms throttle)

---

## LOWER PRIORITY - Data Cleanup & Integration

### 13. Monday Data Cleanup

- [ ] Delete 77 junk Contractors (empty, no links)
- [ ] Delete 74 junk Contacts (empty, no links, "New contact" names)
- [ ] Merge duplicate Contractors (Weitz Co 3x, Elder Contracting 2x, Permanent Location 3x)
- [ ] Backfill Estimating → Projects links (currently 94% empty)
- [ ] Backfill Dust Permits → Estimate links (currently 84% empty)

### 14. Duplicate Prevention

- [ ] **Add normalization to Notion lookups** - `services/notion/client.ts`
  - `findOrCreateByTitle()` - lowercase, trim, collapse whitespace
  - `findOrCreateByEmail()` - lowercase, trim

### 15. Estimate Name Formatting

- [ ] **Add title-case transformation** - for project names before sync
  - Convert ALL-CAPS to Title Case
  - Apply before syncing to Notion

### 16. Broken Monday Board Mirrors

- [ ] **Fix SWPPP Plans → Estimates mirror** - Points to deleted column `board_relation_mkp8qh5n`
- [ ] **Fix Contractors → Deals mirror** - Points to deleted column `contact_deal`

---

## FUTURE - Q1 2025+

### 17. Contracts Workflow

- [ ] Enable contracts module in sidebar - `components/app-sidebar.tsx:31`
- [ ] Create `/contracts` page
- [ ] Contract reconciliation checklist (from design doc Appendix C)
- [ ] AI-assisted contract comparison

### 18. Project Initiation Workflow

- [ ] Enable projects module in sidebar - `components/app-sidebar.tsx:35`
- [ ] Create `/projects` page
- [ ] Contractor info collection
- [ ] Pre-project checklist

### 19. Search Feature

- [ ] Enable search in sidebar - `components/app-sidebar.tsx:43`
- [ ] Create `/search` page
- [ ] Cross-entity search (quotes, takeoffs, catalog)

### 20. Settings Expansion

- [ ] Expand settings page - `app/settings/page.tsx`
  - Default category preferences
  - Unit preferences
  - Email integration settings

### 21. Quote Templates

- [ ] Template management in settings
- [ ] "New from Template" option in quote creation

### 22. Email Integration

- [ ] Send quotes via email
- [ ] Use mailto: pattern (like QuickBooks)
- [ ] Follow-up automation

### 23. Reporting Dashboard

- [ ] Quote metrics
- [ ] Win/loss tracking
- [ ] Revenue pipeline

---

## COMPLETED

### Quote Builder (Phases 1-3)

- [x] Section deduplication removed (UUID generation) - `use-quote-editor.ts`
- [x] Editable section titles in UI (but NOT persisted - see Critical #1)
- [x] Duplicate section button with scroll-to-new
- [x] Per-section subtotals always displayed
- [x] Item combobox for catalog selection - `item-combobox.tsx`
- [x] Pick-one auto-removal removed (just UI hint now)
- [x] `updateLineItemFromCatalog()` function
- [x] Sidebar navigation updated (Takeoffs removed as separate item)
- [x] Source column in quotes table (Takeoff/Manual)
- [x] Quote header with breadcrumbs
- [x] Export dropdown (PDF download works)
- [x] Save status in header
- [x] Undo/redo hook wired to editor (just no UI buttons)

### Storage Layer

- [x] MinIO AIStor storage layer - `lib/minio.ts`
- [x] PDF upload API - `app/api/upload/pdf/route.ts`
- [x] Presigned URL generation for PDFs
- [x] Docker compose with AIStor
- [x] `pdf_url` column utilized in database
- [x] Takeoff → Quote bidirectional navigation

### Takeoff System

- [x] PDF upload and display
- [x] Scale presets (per-page)
- [x] Count tool (click markers)
- [x] Polyline tool (linear measurement)
- [x] Polygon tool (area measurement)
- [x] Auto-save (2-second debounce)
- [x] Export measurements to quote
- [x] Catalog integration for bundles

### Catalog Standardization (Jan 2025)

- [x] Reorder Roll-Off codes by size (10yd→40yd as RO-001→RO-005)
- [x] Add "Fence" prefix to temporary fencing items (TF-004 through TF-009)
- [x] Add "Service" to tank recurring items (TANK-003 through TANK-006)
- [x] Remove dashes from Water Equipment items (WE-005, WE-009)
- [x] Fix SWPPP inspection descriptions with duration placeholders
- [x] Add takeoff bundles to catalog.ts (6 bundles)
- [x] Make catalog.ts single source of truth (remove database-based catalog)
- [x] Delete `app/api/catalog/` directory (13 route files)
- [x] Delete `components/catalog/` directory (CRUD components)
- [x] Rewrite `app/catalog/page.tsx` as read-only view
- [x] Clean up scripts folder (remove SQL migrations, seed files)

### General

- [x] Audit Monday boards
- [x] Document broken mirrors and empty columns
- [x] Identify junk items for cleanup
- [x] Codebase architecture audit

---

## Reference

### Key Files

- **Database Schema**: `lib/db/index.ts`
- **Quote Editor Hook**: `hooks/use-quote-editor.ts`
- **Quote Workspace**: `components/quotes/quote-workspace.tsx`
- **Takeoff Editor**: `app/takeoffs/[id]/page.tsx`
- **PDF Annotation Lib**: `lib/pdf-takeoff/`
- **MinIO Client**: `lib/minio.ts`
- **Service Catalog**: `services/quoting/catalog.ts` (single source of truth)

### Files with TODO Comments

- `components/quotes/quote-workspace.tsx:395` - `// TODO: Implement version finalization`
- `lib/pdf-takeoff/lib/screenshot.ts:9` - `// @TODO: cache this?`
- `lib/pdf-takeoff/components/mouse-monitor.tsx:70` - `// TODO: Maybe optimise or throttle?`

### Monday Board IDs

- **Estimating**: 7943937851
- **Projects**: 8692330900
- **Contractors**: 7943937856
- **Contacts**: 7943937855
- **Inspection Reports**: 8791849123
- **Dust Permits**: 9850624269
- **SWPPP Plans**: 9778304069
