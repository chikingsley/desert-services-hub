# Quote Builder Redesign

Requirements and analysis for improving the quote builder.

---

## Current State (Verified from Code)

### What Works

- **Auto-save** - 2-second debounce, shows save status
- **Catalog integration** - Can add items from catalog, add full sections
- **Strikethrough** - Items can be marked as excluded from total
- **Mobile card view** - Responsive layout for line items
- **Undo/redo hook exists** - `use-undo-redo.ts` written but not connected to quotes

### What's Broken or Missing

1. ~~**Section deduplication blocks multi-site quotes**~~ ✅ FIXED
   - ~~`addCategoryItems()` checks if section exists and returns early if it does~~
   - Now generates unique UUID for each section, allows multiple of same category

2. **Pick-one has auto-removal (too aggressive)**
   - `addFromCatalog()` removes other items in pick-one subcategory when adding new item
   - This is enforcement, not suggestion
   - **Fix needed:** Remove auto-removal, let users manage manually

3. **No dropdown to switch items**
   - Line items are plain text inputs
   - Can't easily pick a different catalog item
   - **Fix needed:** Replace text input with catalog dropdown (copies data, no linking)

4. ~~**Sections can't be renamed**~~ ✅ FIXED
   - Now has editable `title` field in section header
   - Inline editing with transparent input

5. **No versioning despite schema support**
   - Database has `quote_versions` table with version_number, is_current
   - But API just overwrites current version on every save
   - **Fix needed:** Implement actual versioning

6. **Quote title shows estimate number, not job name**
   - PageHeader shows `base_number` (e.g., "2512280101")
   - Job name only in breadcrumbs
   - **Fix needed:** Show job name as title, estimate number as subtitle

7. ~~**No subtotals per section**~~ ✅ FIXED
   - Added toggle button (+Σ/-Σ) to show/hide section subtotal
   - Subtotal displayed at bottom of section when enabled

8. **No undo/redo in UI**
   - Hook exists but not wired up
   - **Fix needed:** Connect to quote editor, add buttons to header

9. ~~**No section duplication**~~ ✅ FIXED
   - Added duplicate button (⧉) to copy section with all items
   - New section gets " (Copy)" suffix on title

---

## Desired Features

### Section Management ✅ COMPLETE

- **Add sections** - From catalog (multiple of same category now allowed)
- **Duplicate sections** - ✅ Copy with all items for multi-site
- **Rename sections** - ✅ Editable title (e.g., "Site A - Water Trucks")
- **Delete sections** - Remove section and all its items
- **Subtotals** - ✅ Toggle to show total per section

### Item Management

- **Dropdown to change items** - Click item name, select different catalog item (copies data)
- **No pick-one enforcement** - Default presentation only, user can add more
- ~~**Custom items**~~ - Deferred for later

### Header/Toolbar

- **Job name as title** - Not estimate number
- **Undo/Redo buttons** - Like takeoffs
- **Save status indicator** - In header, not buried in editor
- **Export button** - PDF download
- **Finalize button** - Lock version, create new one for edits

### Versioning

- **Auto-save updates draft** - Don't create new version every save
- **Finalize creates new version** - v1 → v2, locks previous
- **Version indicator** - Show "v1 (Draft)" or "v2 (Final)"
- **Revision notes** - Per-version comment explaining changes

---

## Implementation Plan

### Phase 1: Section Fixes (Unblocks Multi-Site) ✅ COMPLETE

- [x] Remove section deduplication in `addCategoryItems()`
- [x] Generate unique section IDs (UUID instead of category ID)
- [x] Add editable `title` field to sections (full-width, no truncation)
- [x] Add "Duplicate Section" button with clear label + scroll-to-new-section
- [x] Add per-section subtotals (always shown, no toggle)

### Phase 2: Item Improvements ✅ COMPLETE

- [x] Replace item text input with catalog dropdown
  - Clicking item name opens a combobox to pick from catalog
  - Selecting copies name/description/price/unit (no linking, just a copy)
  - Filtered to items in that section's category (if section has `catalogCategoryId`)
  - New component: `components/quotes/item-combobox.tsx`
  - New hook function: `updateLineItemFromCatalog()` updates multiple fields at once
- [x] Remove pick-one auto-removal behavior
  - Removed auto-removal code from `addFromCatalog()` in `use-quote-editor.ts`
  - Pick-one is now just a UI hint, users manage duplicates manually

**Deferred:**

- ~~Add `catalogItemId` field~~ - Not needed, just copy data
- ~~Custom items (type to create)~~ - Split out for later

### Phase 3: Header/UX & Navigation Redesign

**Core Concept:** Takeoffs are not a separate workflow - they're a way to START a quote. The navigation should reflect this.

#### 3.1 Sidebar Changes ✅ COMPLETE

- [x] Remove "Takeoffs" as separate nav item (step 1)
- [x] Keep "Quotes" as main entry (step 1)
- [x] Add column: "Source" (Takeoff | Manual) to quotes table
- [ ] Add column: "Plan PDF" link (opens takeoff viewer in modal) - deferred

#### 3.2 Quote Creation Entry Points ✅ COMPLETE

- [x] Two buttons in header: "+ New Takeoff" and "+ New Quote"
  - "New Takeoff" → Opens PDF upload modal → After upload, goes to takeoff editor
  - "New Quote" → Goes directly to quote editor (existing flow)

#### 3.3 Takeoff PDF Upload Modal ✅ COMPLETE

- [x] Move upload UI into a modal component (`components/takeoffs/upload-modal.tsx`)
- [x] Modal opens from quotes list header
- [x] After upload completes → navigate to takeoff editor (full page)
- [ ] Takeoff editor has "Continue to Quote" instead of "Create Quote" - deferred

#### 3.4 Takeoff ↔ Quote Navigation (within editor) ✅ COMPLETE

**Decision: Centered segmented control below header (Option C from prototype)**

- [x] Centered toggle bar below header: [Takeoff] [Quote]
- [x] When in takeoff view: Placeholder with link to full takeoff editor
- [x] When in quote view: Line items editor
- [x] Same header for both views - just content changes
- [x] Only show toggle if quote has a takeoff (otherwise just quote view)

#### 3.5 Quote Header Layout ✅ COMPLETE

**Decision: Three-section header (from prototype)**

```text
[Breadcrumbs: Quotes > Job Name]     [Undo] [Redo]     [Save Status] [Export ▼] [Finalize]
        LEFT (flex-1)                   CENTER              RIGHT (flex-1, justify-end)
```markdown

- [x] Left: Breadcrumbs with job name (no estimate number shown)
- [x] Center: Undo/Redo buttons
- [x] Right: Save status, Export dropdown, Finalize button
- [x] Export dropdown options:
  - Download PDF
  - Send via Email (disabled - future)
  - Print (disabled - future)

#### 3.6 Undo/Redo for Quotes ✅ COMPLETE

- [x] Wire up existing `use-undo-redo.ts` hook to quote editor
- [x] Track: line item changes, section changes, field edits
- [x] Keyboard shortcuts: Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y
- [x] Match takeoff editor button style/placement

#### 3.7 Visual Consistency ✅ COMPLETE

- [x] Same button sizes (sm) as takeoff editor
- [x] Undo/redo centered, save/export/finalize right-aligned
- [x] Move save status from editor card to header (near Export button)

### Phase 4: Versioning

- [ ] "Finalize" button creates new version
- [ ] Don't overwrite finalized versions
- [ ] Show version number in UI
- [ ] Add revision notes field

---

## Database Changes

```sql
-- Sections: add editable title
ALTER TABLE quote_sections ADD COLUMN title TEXT;

-- Line items: track version changes (for revision history)
ALTER TABLE quote_line_items ADD COLUMN version_added INTEGER DEFAULT 1;
ALTER TABLE quote_line_items ADD COLUMN version_removed INTEGER;
```css

*(Note: `catalog_item_id` was considered but not needed - items just copy data from catalog)*

---

## Code Changes

### `use-quote-editor.ts`

**Remove section deduplication:**

```typescript
// Current (blocks multi-site):
if (sectionExists) {
  return prev;  // Does nothing!
}

// Fixed:
// Generate unique ID, always allow adding
const sectionId = crypto.randomUUID();
```text

**Remove pick-one enforcement:**

```typescript
// Current (removes items):
if (isPickOne && subcategory) {
  updatedLineItems = prev.lineItems.filter(...);  // Removes other items
}

// Fixed:
// Don't remove, just add the new item
```css

**Add new functions:**

- `duplicateSection(sectionId)` - Copy section with new ID
- `updateSectionTitle(sectionId, title)` - Rename section

### Components

| Component | Changes |
|-----------|---------|
| `InlineQuoteEditor` | Section title edit, duplicate button, subtotal display |
| Line item row | Change text input to catalog dropdown |
| `PageHeader` | Show job name, add undo/redo/export/finalize buttons |

---

## Decisions Made

- **No item reordering** - Not needed
- **No section reordering** - Not needed
- **No catalog linking** - Items copy data, not linked (no auto-price updates)
- **Custom items** - Deferred for later
- **Revision notes per-version** - Not per-item
- **Pick-one = default only** - No enforcement

---

## Open Questions

1. **PDF export modes** - Toggle for "include revision marks"?
2. **Finalize workflow** - Lock immediately, or allow brief review?

---

## Phase 3 Research Notes

### Current State Summary

**Sidebar (`components/app-sidebar.tsx`):**

- Workflow section: Takeoffs (1) → Quotes (2) → Contracts (3) → Project Init (4)
- Takeoffs and Quotes are separate nav items with step numbers

**Takeoff Editor Header:**

```text
[Undo] [Redo] [Save] [View Quote #X] or [Create Quote]
```markdown

- Has undo/redo with keyboard shortcuts (Ctrl+Z, etc.)
- Conditional button: shows linked quote OR create quote option
- No dividers between button groups

**Quote Editor Header:**

```text
[From takeoff: X] (link, if has takeoff_id)
```markdown

- Save status is INSIDE the editor card, not in PageHeader
- No undo/redo buttons
- No export button

**Quotes List (`app/quotes/page.tsx`):**

- Single "+ New Quote" button
- Table columns: Quote #, Job Name, Client, Total, Status, Version, Created, Actions
- No takeoff/source column
- No PDF link column

**Takeoffs List (`app/takeoffs/page.tsx`):**

- Empty state only - no table implemented yet
- Single "+ New Takeoff" button

### Files Modified for Phase 3

| File | Changes | Status |
|------|---------|--------|
| `components/app-sidebar.tsx` | Remove Takeoffs nav item, renumber steps | ✅ Done |
| `app/quotes/page.tsx` | Use client components for modal integration | ✅ Done |
| `components/quotes/quotes-table.tsx` | Add source column | ✅ Done |
| `components/quotes/quotes-header-actions.tsx` | NEW: Client component for header with modal | ✅ Done |
| `components/quotes/quotes-empty-actions.tsx` | NEW: Client component for empty state with modal | ✅ Done |
| `components/takeoffs/upload-modal.tsx` | NEW: Modal version of upload form | ✅ Done |
| `app/quotes/[id]/page.tsx` | Move save status to PageHeader, add undo/redo/export | ✅ Done (3.5-3.7) |
| `components/quotes/inline-quote-editor.tsx` | Wire up undo/redo hook, remove internal save status | ✅ Done (3.6) |

### Navigation Flow Diagram

```text
CURRENT:
Sidebar: [Takeoffs] [Quotes] [Contracts] [Projects]
                ↓           ↓
         /takeoffs      /quotes
              ↓              ↓
      /takeoffs/new    /quotes/new
              ↓              ↓
      /takeoffs/:id    /quotes/:id
              ↓
      "Create Quote" → /quotes/new?from=takeoff

PROPOSED:
Sidebar: [Quotes] [Contracts] [Projects]  (Takeoffs removed)
              ↓
         /quotes (shows all quotes + in-progress takeoffs)
              ↓
    [+ New Quote ▼]
         ├── "From PDF/Takeoff" → Modal upload → /quotes/:id/takeoff
         └── "Manual Entry" → /quotes/new
              ↓
    /quotes/:id
         ├── [Takeoff] tab → PDF viewer + annotation tools
         └── [Quote] tab → Line items editor
```css

### Component Architecture for Phase 3

```text
QuoteWorkspace (new wrapper component)
├── PageHeader
│   ├── Title: Job Name
│   ├── Subtitle: Estimate #
│   └── Actions:
│       ├── [Undo] [Redo]
│       ├── | (divider)
│       ├── [Save] with status
│       ├── [Export ▼]
│       └── [Finalize]
├── TabNav: [Plan/Takeoff] [Quote]
└── Content:
    ├── TakeoffViewer (when Plan tab active)
    └── InlineQuoteEditor (when Quote tab active)
```
