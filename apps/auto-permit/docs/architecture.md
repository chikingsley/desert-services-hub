# Architecture

System architecture for the Auto Dust Permit Application.

## High-Level View

```
┌─────────────────────────────────────────────────────────────────┐
│                       ENTRY POINTS                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ CLI         │  │ API Server  │  │ AI Tools                │  │
│  │ (citty)     │  │ (Elysia)    │  │ (OpenAI/Claude schemas) │  │
│  │             │  │             │  │                         │  │
│  │ commands/   │  │ api/        │  │ commands/tools.ts       │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                     │                │
│         └────────────────┼─────────────────────┘                │
│                          ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    HANDLERS                              │   │
│  │                  (src/handlers/)                         │   │
│  │                                                          │   │
│  │  Thin wrappers with Zod schemas that call portal funcs   │   │
│  │  - create.ts  → calls portal/create.ts                   │   │
│  │  - renew.ts   → calls portal/create.ts (renewPermitFull) │   │
│  │  - revise.ts  → calls portal/create.ts (revisePermitFull)│   │
│  │  - close.ts   → calls portal/close.ts                    │   │
│  │  - delete.ts  → calls portal/delete.ts                   │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             ▼                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐               │
│  │ portal/      │  │ pdf/         │  │ db/      │               │
│  │              │  │              │  │          │               │
│  │ Browser      │  │ Extract data │  │ Dust &   │               │
│  │ automation   │  │ from PDFs    │  │ Sales DBs│               │
│  │ for Maricopa │  │ (NOI, SWPPP) │  │          │               │
│  │ County Portal│  │              │  │          │               │
│  └──────────────┘  └──────────────┘  └──────────┘               │
└─────────────────────────────────────────────────────────────────┘
                      │
                      │ Browser automation
                      ▼
         ┌─────────────────────┐
         │ Maricopa County     │
         │ Dust Portal         │
         │ (dm.maricopa.gov)   │
         └─────────────────────┘
```

## Layer Responsibilities

| Layer | Location | Purpose | Rules |
|-------|----------|---------|-------|
| **Commands** | `src/commands/` | CLI interface (citty) | Parse args, call handlers, format output |
| **API** | `src/api/` | HTTP interface (Elysia) | Validate requests, call handlers, return JSON |
| **Handlers** | `src/handlers/` | Business logic orchestration | Zod schemas, call portal functions, NO browser code |
| **Portal** | `src/portal/` | Browser automation | Playwright, page navigation, form filling |
| **PDF** | `src/pdf/` | Document extraction | Jina AI, Gemini, stateless |
| **DB** | `src/db/` | Data persistence | SQLite queries |

**Critical Rule**: Handlers are thin wrappers. All browser automation lives in `portal/`. If you're writing `page.click()` or `await login()` in a handler, you're doing it wrong.

## Components

### 1. CLI (`src/cli.ts` + `src/commands/`)

**Framework**: citty
**Purpose**: Command-line interface for permit operations

**Entry Point**: `bun src/cli.ts <command> [options]`

**Commands**:
| Command | Description |
|---------|-------------|
| `list` | List permits from database |
| `create` | Create new permit application |
| `renew` | Renew existing permit |
| `revise` | Revise existing permit |
| `close` | Close active permit |
| `delete` | Delete draft applications |
| `extract` | Extract FormData from PDFs |
| `sync` | Sync CSV exports to database |

**Structure**:
```
src/commands/
├── _shared/
│   ├── headless.ts    # --headless/--headed args
│   └── output.ts      # --json output formatting
├── permit/
│   ├── create.ts
│   ├── renew.ts
│   ├── revise.ts
│   ├── close.ts
│   ├── delete.ts
│   └── list.ts
├── extract.ts
├── sync.ts
└── tools.ts           # AI tool schema exports
```

**Rule**: Commands only parse CLI args and call handlers. No business logic.

### 2. Handlers (`src/handlers/`)

**Purpose**: Business logic with Zod schemas, reusable by CLI, API, and AI tools

**Pattern**:
```typescript
// src/handlers/renew.ts

// 1. Zod schema (AI-tool compatible)
export const renewSchema = z.object({
  permitId: z.string().describe("Permit ID to renew"),
  companyName: z.string().describe("Company name"),
});

// 2. Handler function (calls portal)
export async function renewPermit(input: RenewInput): Promise<RenewResult> {
  // Validate, then call portal function
  return await renewPermitFull(page, context, input.permitId, input.companyName);
}
```

**Modules**:
| File | Calls |
|------|-------|
| `create.ts` | `portal/create.ts` → `createApplicationFull()` |
| `renew.ts` | `portal/create.ts` → `renewPermitFull()` |
| `revise.ts` | `portal/create.ts` → `revisePermitFull()` |
| `close.ts` | `portal/close.ts` → `closePermit()` |
| `delete.ts` | `portal/delete.ts` → `deleteDrafts()` |
| `list.ts` | `db/` → database queries |
| `extract.ts` | `pdf/` → PDF extraction |
| `sync.ts` | `db/` → CSV sync |

**Rule**: Handlers are THIN. They validate input, call portal/pdf/db functions, and return results. NO `page.click()`, NO `await login()`, NO browser code.

### 3. AI Tools (`src/commands/tools.ts`)

**Purpose**: Export handler schemas as JSON Schema for AI function calling

**Exports**:
- `toolSchemas` - JSON Schema for each tool
- `openAITools` - OpenAI function calling format
- `claudeTools` - Claude tool use format
- `tools` - Executor functions

**Usage**:
```typescript
import { claudeTools, executeTool } from "@/commands/tools";

// Pass to Claude API
const response = await claude.messages.create({
  tools: claudeTools,
  // ...
});

// Execute tool call
const result = await executeTool("renew_permit", { permitId: "D0058823", companyName: "..." });
```

### 4. API Server (`src/api/` + `src/index.ts`)

**Framework**: Elysia (Hapi-based)
**Runtime**: Bun

**Responsibilities**:
- HTTP endpoint handling
- Singleton browser session management
- Request routing
- Health monitoring

**Key Routes**:
```
GET    /health                         # Health check
GET    /openapi                        # OpenAPI spec
GET    /api/permits                   # List permits
DELETE /api/permits/:id                 # Delete draft
POST   /api/permits/:id/start           # Start permit
POST   /api/permits/:id/renew          # Renew permit
POST   /api/applications/create          # Create application
GET    /api/browser/status              # Check session
POST   /api/browser/start              # Start browser
POST   /api/browser/stop               # Stop browser
```

### 5. Portal Automation (`src/portal/`)

**Framework**: Playwright
**Purpose**: ALL browser automation for Maricopa County Dust Control Portal

**Modules**:
| File | Purpose | Key Exports |
|------|---------|-------------|
| `create.ts` | Application flows | `createApplicationFull()`, `renewPermitFull()`, `revisePermitFull()` |
| `delete.ts` | Delete drafts | `deleteDrafts()`, `deleteByApplicationId()` |
| `close.ts` | Close permits | `closePermit()` |
| `scrape.ts` | Scrape permit data | `scrapePermits()` |
| `utils/login.ts` | Authentication | `login()` |
| `utils/browser.ts` | Browser lifecycle | `createBrowser()`, `closeBrowser()` |
| `utils/selectors.ts` | ADF form selectors | `portal`, `SELECTORS` |
| `utils/helpers.ts` | Navigation utilities | `navigateToMyDustApps()`, `clickNext()`, `fillText()` |

**Key Functions** (called by handlers):
```typescript
// Create new application
createApplicationFull(page, context, flow, formData, options)

// Renew existing permit (copy + advance dates)
renewPermitFull(page, context, permitId, companyName)

// Revise existing permit (edit in-place)
revisePermitFull(page, context, permitId, revisionPurpose)

// Close permit
closePermit(page, context, permitId, reason)

// Delete drafts
deleteDrafts(page, context)
```

**Browser Session Pattern**:
- **API routes**: Singleton session (one browser for all requests)
- **Tests**: Per-test isolation (fresh browser each test)
- Both use same core `createBrowser()` / `closeBrowser()` utilities

**Rule**: All browser code lives here. Handlers call these functions - they don't implement browser logic themselves.

### 6. PDF Extraction (`src/pdf/`)

**Purpose**: Extract structured permit data from construction PDFs

**Tech Stack**:
- **Jina AI**: PDF → text conversion
- **Google Gemini**: Text → structured JSON

**Modules**:
| File | Purpose |
|------|---------|
| `service.ts` | Main extraction orchestrator |
| `noi.ts` | Extract from Notice of Intent |
| `plan.ts` | Extract from SWPPP Plans |
| `types.ts` | FormData interface (schema) |
| `schema/` | JSON schemas for extraction |

**Supported Document Types**:
- NOI (Notice of Intent)
- SWPPP (Stormwater Pollution Prevention Plan)
- Grading plans
- Geotech reports
- Site plans
- Utility plans

### 7. Database (`src/db/`)

**Purpose**: Local SQLite databases for data storage

**Modules**:
| File | Purpose |
|------|---------|
| `dust.ts` | Dust permit database |
| `sales.ts` | Sales tracking |
| `search.ts` | Company lookup (fuzzy search) |

**Technology**: SQLite with Bun (`bun:sqlite`)

### 8. Webhook Interface (`src/webhook-source-interface.ts`)

**Purpose**: Define data contract for webhook sources

**Key Types**:
```typescript
interface ProjectFiles {
  projectName: string;
  accountName?: string;
  noi: ProjectFile[];      // At least one required
  swpppPlan: ProjectFile[]; // Optional
}
```

**Purpose**: Decouple automation from any specific webhook source (Notion, Monday, etc.)

## Data Flow

### Full Pipeline

```
1. WEBHOOK TRIGGER
   Source (Notion/Monday/Custom) posts ProjectFiles to API

2. DOWNLOAD PHASE
   ├─ Fetch NOI PDF from URL
   ├─ Fetch SWPPP Plan PDF from URL (if provided)
   └─ Save to temp storage

3. EXTRACTION PHASE
   ├─ Jina AI: PDF → text
   ├─ Gemini: Text → structured JSON
   └─ Extract: applicant, project, site, activities

4. CONVERSION PHASE
   ├─ Map extracted data to FormData schema
   ├─ Apply defaults for missing fields
   └─ Merge with any manual overrides

5. FORM FILLING PHASE
   ├─ Get or create browser session
   ├─ Navigate to Maricopa portal
   ├─ Login (if needed)
   ├─ Fill Page 1: Applicant Info
   ├─ Fill Page 2: Project Location (skip map)
   ├─ Fill Page 3: Project Details
   ├─ Fill Page 4: Dust Control Plan
   └─ Fill Page 5: Review & Submit

6. RESPONSE
   └─ Return application ID and status to webhook source
```

### Browser Session Lifecycle

**Singleton Pattern (API Routes)**:
```
┌──────────────────────────────────────┐
│ API Server starts                │
│                                  │
│ First request arrives               │
│   ↓                             │
│ createBrowser() + login()          │
│   Store in global session         │
│                                  │
│ Subsequent requests               │
│   ↓                             │
│ Reuse existing session            │
│   Update lastActivity timestamp   │
│                                  │
│ Server shuts down               │
│   ↓                             │
│ closeBrowser()                   │
└──────────────────────────────────────┘
```

**Per-Test Pattern (E2E Tests)**:
```
┌──────────────────────────────────────┐
│ Test starts                      │
│   ↓                             │
│ harness.setup()                   │
│   createBrowser() + login()       │
│                                  │
│ Test runs                        │
│   ↓                             │
│ Use page/context from harness     │
│                                  │
│ Test completes                   │
│   ↓                             │
│ harness.teardown()                │
│   closeBrowser()                  │
└──────────────────────────────────────┘
```

## Anti-Patterns

### DON'T: Browser Code in Handlers

**Wrong** - handler reimplements portal logic:
```typescript
// src/handlers/renew.ts - WRONG!
export async function renewPermit(input: RenewInput) {
  const instance = await createBrowser({ headless: true });
  const { page, context } = instance;

  await login(page);  // ❌ Browser code in handler
  await navigateToMyDustApps(page);  // ❌ Browser code in handler
  await page.click(selector);  // ❌ Browser code in handler

  // ... 50 more lines of browser automation
}
```

**Right** - handler calls portal function:
```typescript
// src/handlers/renew.ts - CORRECT!
export async function renewPermit(input: RenewInput) {
  // Just call the portal function that does all the browser work
  return await renewPermitFull(page, context, input.permitId, input.companyName);
}
```

**Why this matters**:
- Portal functions are tested and reliable
- Handlers stay thin and testable
- No code duplication
- Single source of truth for browser automation

## Design Decisions

### Why Singleton Browser Session?

**Performance**: Creating a browser instance takes 2-5 seconds (Chromium launch, login). Reusing one session across requests is much faster than creating a new browser per request.

**Trade-off**: Less isolation between API requests, but acceptable for our use case (single-threaded webhook processing).

### Why Separate `portal/` and `pdf/`?

**Separation of concerns**:
- `portal/` = Browser automation (interactive, stateful, UI-dependent)
- `pdf/` = Data processing (stateless, AI-powered, batch-able)

This allows:
- PDF extraction to run without browser (faster, cheaper)
- Portal automation to be tested with mock data
- Independent evolution of both components

### Why Elysia Framework?

**Performance**: Built on Bun's HTTP server (native, fast)
**Simplicity**: Minimal boilerplate compared to Express/Fastify
**TypeScript**: Full type safety with OpenAPI plugin
**WebSocket ready**: Built-in support for future real-time features

### Why Playwright over Puppeteer?

**Better API**: More reliable selectors, better frame handling
**Multi-browser**: Supports Chromium, Firefox, WebKit (future-proof)
**Debugging**: Better inspector and trace capabilities
**Testing**: Same library for E2E tests and automation

## Deployment Considerations

### Docker

Server can run in Docker with:
- Playwright browsers (needs `--no-sandbox` flag)
- Environment variables for API keys
- Volume mounting for databases

### Cloudflare Workers

**Challenges**:
- No browser rendering (Playwright doesn't run in Workers)
- No persistent storage (SQLite needs file system)

**Workarounds**:
- Use Browser Rendering API for UI interactions
- Use D1 or external DB for storage

### Current Deployment

**Local/VM**: Full capabilities
- Playwright browsers
- SQLite databases
- File system for temp PDFs

## Security

### API Keys

All API keys are loaded from environment variables:
- `GEMINI_API_KEY`
- `JINA_API_KEY`
- `DUST_PERMIT_USERNAME`
- `DUST_PERMIT_PASSWORD`

Keys are **never** committed to the repository (`.env` is in `.gitignore`).

### Authentication

Maricopa County portal requires username/password authentication. Credentials are:
- Stored in environment variables
- Used only in `utils/login.ts`
- Never logged or exposed in API responses

### CORS

CORS is enabled via `@elysiajs/cors` plugin for local development. Production should restrict origins.
