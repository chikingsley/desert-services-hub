# Architecture

**Analysis Date:** 2026-01-22

## Pattern Overview

**Overall:** Full-stack SPA with Bun runtime server, React 19 frontend with client-side routing, and SQLite persistent storage. Server handles REST API and static file serving; frontend is a self-contained React application with data loaders.

**Key Characteristics:**
- Monolithic Bun server (`src/server.ts`) with explicit routing using `Bun.serve()`
- React Router v7 in Data Mode for client-side routing with data loaders
- Single SQLite database (`lib/db/index.ts`) with schema centralized in one file
- Stateless API handlers that read/write directly to database
- Frontend components composed of shadcn/ui primitives and domain-specific features

## Layers

**API Layer:**
- Purpose: Handle HTTP requests, validate input, coordinate database operations, generate responses
- Location: `src/api/` (all route handlers)
- Contains: Request handlers for quotes, takeoffs, catalog, Monday.com, file upload, webhooks
- Depends on: `lib/db`, `lib/types`, `lib/pdf`, `lib/schemas`, external services (`services/`)
- Used by: Bun server router, frontend fetch calls

**Data Access Layer:**
- Purpose: Direct SQLite database interaction and schema definition
- Location: `lib/db/index.ts` (single file, all tables defined here)
- Contains: Database initialization, table creation with foreign keys, exported `db` instance
- Depends on: Bun's `bun:sqlite` driver, Node.js filesystem APIs
- Used by: All API handlers, no abstraction—direct SQL queries in handlers

**Domain Logic Layer:**
- Purpose: Business rules and transformations (PDF generation, quote calculations, takeoff conversions)
- Location: `lib/` subdirectories (pdf/, pdf-takeoff/, schemas/)
- Contains: PDF builder logic, takeoff-to-quote conversion, validation schemas, utility functions
- Depends on: `lib/types`, external packages (pdfmake, pdf-lib, zod)
- Used by: API handlers, frontend components

**Frontend Layer:**
- Purpose: User interface, client-side state, data fetching
- Location: `src/frontend/` (SPA bundle)
- Contains: React Router setup, pages, components, hooks
- Depends on: React 19, React Router v7, shadcn/ui, `lib/types`, API routes
- Used by: Browser, served as HTML/JS/CSS bundle

**Service Integration Layer:**
- Purpose: External APIs and third-party integrations (Monday.com, Notion, email, SharePoint)
- Location: `services/` (Monday, email, notion, contract, quoting, etc.)
- Contains: Client libraries, MCP servers, business logic for integrations
- Depends on: SDKs (Microsoft Graph, Monday API, etc.), `lib/types`
- Used by: API handlers, scheduled tasks, automation workflows

## Data Flow

**Quote Creation (POST /api/quotes):**

1. Frontend calls `createQuote()` API (in `src/api/quotes.ts`)
2. API handler receives JSON body with quote data, sections, line items
3. Handler generates base_number (YYMMDD with suffix for duplicates)
4. Handler inserts Quote row → QuoteVersion row → QuoteSections → QuoteLineItems
5. Returns JSON with new quote ID and version ID
6. Frontend receives response, navigates to quote editor

**Quote Rendering (React Router Data Mode):**

1. User navigates to `/quotes`
2. React Router calls `quotesLoader()` (in `src/frontend/pages/quotes.tsx`)
3. Loader fetches `GET /api/quotes`
4. API handler queries all quotes + nested versions as JSON aggregates
5. Response returns quotes with `versions` JSON arrays
6. Loader parses JSON, returns data
7. `QuotesPage` component uses `useLoaderData()` hook, renders `QuotesTable`

**PDF Generation (GET /api/quotes/:id/pdf):**

1. API handler `getQuotePdf()` fetches quote from database with all nested data
2. Handler transforms QuoteRow/QuoteVersionRow/QuoteLineItemRow to `EditorQuote` type
3. Calls `generatePDF(editorQuote, options)` from `lib/pdf/generate-pdf.ts`
4. PDF generator:
   - Loads logo as base64 from filesystem
   - Builds document definition using `buildDocDefinition()` from `pdf-builder.ts`
   - If `includeBackPage`, generates back page and concatenates with pdf-lib
5. Returns PDF as Uint8Array in response with Content-Type: application/pdf

**Takeoff Annotation Flow:**

1. User uploads PDF via `POST /api/upload/pdf`
2. Handler stores PDF file (via MinIO or filesystem, env-dependent)
3. Takeoff record created with `status: 'draft'`
4. Frontend loads PDF in `TakeoffEditorPage` using pdfjs-dist
5. User draws measurements with `react-rnd` draggable annotations
6. Annotations stored in `takeoffs.annotations` (JSON array of shapes)
7. On save `PUT /api/takeoffs/:id`, handler stores serialized annotations
8. User can convert takeoff to quote via `/api/quotes/:id/takeoff` endpoint

**State Management:**
- Database is source of truth; no Redux/Zustand in frontend
- React Router loaders pre-fetch data before rendering
- Component state used only for UI ephemeral state (form inputs, modals, scroll position)
- Mutations trigger fetch() calls to API, which trigger router re-loaders

## Key Abstractions

**Quote Versioning:**
- Purpose: Support multiple iterations of a quote without losing history
- Examples: `src/api/quotes.ts` (createQuote creates QuoteVersion), `src/api/quotes-by-id.ts` (updateQuote creates new version)
- Pattern: Every quote has `versions` array; `is_current = 1` marks the active version; line items belong to versions, not quotes directly

**EditorQuote Type:**
- Purpose: Normalized application type used internally for PDF rendering, separate from database row types
- Examples: `lib/types.ts` (EditorQuote interface), `src/api/quotes-by-id.ts` (transforms QuoteRow → EditorQuote)
- Pattern: API handlers transform raw database rows to application types before using for business logic

**Catalog System:**
- Purpose: Reusable pricing templates organized hierarchically
- Examples: `lib/types.ts` (CatalogCategory, CatalogSubcategory, CatalogServiceItem), `src/api/catalog.ts` (getCatalog)
- Pattern: Categories → Subcategories → Items; selection_mode ("pick-one" or "pick-many") controls UI behavior

**PDF Builder Pattern:**
- Purpose: Centralize PDF document structure generation
- Examples: `lib/pdf/pdf-builder.ts` (buildDocDefinition, buildBackPageDocDefinition), `lib/pdf/generate-pdf.ts` (generatePDF)
- Pattern: Builders take application types (EditorQuote) and return pdfmake document definitions; separate from rendering

## Entry Points

**Server Entry:**
- Location: `src/server.ts`
- Triggers: `bun run dev` or `bun run src/server.ts`
- Responsibilities: Initialize Bun.serve(), define routes, handle static files, manage error handler

**Frontend Entry:**
- Location: `src/frontend/main.tsx`
- Triggers: Bundled by Bun, served as HTML/CSS/JS from `src/frontend/index.html`
- Responsibilities: Bootstrap React app, create router, mount to DOM

**API Routes:**
All in `src/api/` directory:
- `health.ts` → GET /api/health (status check)
- `quotes.ts` → GET/POST /api/quotes (list/create quotes)
- `quotes-by-id.ts` → GET/PUT/DELETE /api/quotes/:id (fetch/update/delete single quote, PDF generation)
- `takeoffs.ts` → GET/POST /api/takeoffs (list/create takeoffs)
- `takeoffs-by-id.ts` → GET/PUT/DELETE /api/takeoffs/:id (fetch/update/delete single takeoff)
- `catalog.ts` → GET /api/catalog (fetch pricing catalog)
- `upload.ts` → GET/POST /api/upload/pdf (check/upload PDF files)
- `monday.ts` → GET /api/monday/search (search Monday.com items)
- `webhooks.ts` → POST /api/webhooks/monday (receive Monday.com updates)

## Error Handling

**Strategy:** Try-catch in each handler with console.error logging and JSON error responses. No custom error classes.

**Patterns:**
- API handlers return `Response.json({ error: "message" }, { status: 500 })` on exception
- Frontend uses React Router's `errorElement: <RouteErrorBoundary />` to catch loader errors
- Missing resources return 404 responses
- Invalid requests return 400 with error message
- Console.error logged for debugging; no error tracking service configured

## Cross-Cutting Concerns

**Logging:** Console.log/console.error calls throughout codebase. No structured logging framework (Winston, Pino).

**Validation:** Zod schemas in `lib/schemas/` for input validation (manual-inputs.ts). Most API handlers do basic type narrowing without schema validation.

**Authentication:** None currently implemented. All API endpoints are public. Server assumes trusted environment.

**Database Transactions:** No explicit transaction management. SQLite with WAL mode and foreign key constraints enabled.

**CORS:** None configured. Assumes same-origin requests (frontend and API served from same host).

---

*Architecture analysis: 2026-01-22*
