# Changelog

All notable changes to Desert Services Hub are documented here.

## [Unreleased]

### Changed

#### Header UI Rework

- **Unified Save UX** - Both takeoff and quote pages now have consistent save behavior:
  - Auto-save with 2-second debounce
  - Manual save button with status indicator (green dot = saved, amber = unsaved, spinner = saving)
  - Button becomes primary variant when there are unsaved changes
- **Removed Undo/Redo** - Simplified header by removing undo/redo buttons
- **Fixed Takeoff/Quote Navigation** - The broken segmented control replaced with proper navigation:
  - Quote page shows "View Takeoff" button that navigates to `/takeoffs/{id}`
  - Takeoff page shows "View Quote" or "Create Quote" button
- **Code Cleanup** - Extracted `SaveButtonIcon` and `SaveButtonLabel` helper components to replace nested ternaries

#### Code Simplification

- Removed unused imports and variables across quote/takeoff components
- Removed console.log debug statements
- Added descriptive comments for non-obvious code patterns
- Removed duplicate save UI from InlineQuoteEditor (now only in parent header)

### Added

#### Quote System

- **Inline Quote Editor** - New editor with inline editing (no dialogs), auto-save, strikethrough support
- **Catalog Integration** - CatalogCombobox and SectionCombobox for selecting items from the service catalog
- **SQLite Backend** - Full quote CRUD operations via SQLite (replacing Supabase)
  - `GET/POST /api/quotes` - List and create quotes
  - `GET/PUT /api/quotes/[id]` - Get and update quotes
  - `GET /api/quotes/next-number` - Generate unique quote numbers (YYMMDD + suffix)
- **Quote Versioning Schema** - Database tables for versions, sections, and line items
- **Quote Editor Components**
  - `inline-quote-editor.tsx` - Main editor with inline editing UI
  - `new-quote-editor.tsx` - Wrapper for creating new quotes
  - `existing-quote-editor.tsx` - Wrapper for editing existing quotes
  - `catalog-combobox.tsx` - Searchable dropdown for catalog items
  - `section-combobox.tsx` - Dropdown to add entire sections

#### Catalog System

- **Catalog Backend** - Full CRUD API for managing service catalog
  - `GET/POST /api/catalog/categories` - Category management
  - `GET/PUT/DELETE /api/catalog/categories/[id]` - Single category operations
  - `GET/POST /api/catalog/subcategories` - Subcategory management
  - `GET/PUT/DELETE /api/catalog/subcategories/[id]` - Single subcategory operations
  - `GET/POST /api/catalog/items` - Item management
  - `GET/PUT/DELETE /api/catalog/items/[id]` - Single item operations
  - `POST /api/catalog/reorder` - Drag-and-drop reordering
  - `POST /api/catalog/seed` - Seed database with catalog data
- **Catalog Management UI** - `/catalog` page for managing categories, subcategories, and items

#### TypeScript Types

- Added comprehensive SQLite row types in `lib/types.ts`:
  - `QuoteRow`, `QuoteVersionRow`, `QuoteSectionRow`, `QuoteLineItemRow`
  - `CatalogCategoryRow`, `CatalogSubcategoryRow`, `CatalogItemRow`
  - `TakeoffRow`

### Changed

- **Database**: Switched from Supabase to SQLite for quotes (preparing for Cloudflare D1 migration)
- **Linting**: Updated Biome config to relax some style rules as warnings

### Technical Details

- Build: Next.js 14+ with App Router
- Database: SQLite via `bun:sqlite`
- UI: shadcn/ui + Tailwind CSS
- Linting: Biome with ultracite presets

---

## Planned Features

### High Priority

- [ ] PDF Preview panel (collapsible side panel)
- [ ] Delete quote functionality
- [ ] Duplicate quote functionality
- [ ] Send quote functionality (mailto: pattern)
- [ ] Quote locking after first send
- [ ] Create Revision flow
- [ ] Recipients panel (track who quote was sent to)
- [ ] Version history view
- [ ] Subtotal per section

### Medium Priority

- [ ] Company name autocomplete
- [ ] Estimator dropdown
- [ ] Address autocomplete (Google Maps)
- [ ] Quote templates

### Future

- [ ] Contract reconciliation module
- [ ] Project initiation workflow
- [ ] Reporting and analytics
