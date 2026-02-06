# Technology Stack

**Analysis Date:** 2026-01-22

## Languages

**Primary:**
- TypeScript 5.9.3 - All source code, strict mode with noEmitOnError

**Secondary:**
- TSX (React) - UI components in `src/components/`
- JavaScript (browser automation) - Playwright page scripts

## Runtime

**Environment:**
- Bun (latest) - Primary runtime for server and CLI
- Node.js compatible via Bun's Node.js API compatibility layer

**Package Manager:**
- Bun - Package management and task running
- Lockfile: `bun.lockb` (binary format)

## Frameworks

**Core:**
- Bun.serve() - Web server (HTTP + WebSocket support, no Express)
- React 19 - UI components and dashboard
- Playwright - Browser automation (headless + headed modes)

**Testing:**
- Bun test - Built-in testing framework
- Playwright Test 1.57.0 - E2E tests

**Build/Dev:**
- Bun build - Asset bundling (HTML, CSS, JS)
- bun-plugin-tailwind - Tailwind CSS bundling during build
- Biome 2.3.11 (via Ultracite) - Linting and formatting

**UI Components:**
- Radix UI - Unstyled, accessible component library
  - Dialog, Dropdown, Label, Select, Slot primitives
- Tailwind CSS 4.1.11 - Utility-first CSS framework
- TanStack React Table 8.21.3 - Data table/grid component
- Lucide React 0.545.0 - Icon library
- CVA (class-variance-authority) - Type-safe component styling

## Key Dependencies

**Critical:**
- `@microsoft/microsoft-graph-client` 3.0.7 - Microsoft 365 email/Teams integration
- `@azure/identity` 4.13.0 - Azure authentication (identity management)
- `@azure/msal-node` 3.8.5 - Microsoft identity sign-in (delegated + app-only auth)
- `@google/genai` 1.34.0 - Google Gemini API for PDF/form processing (not deprecated `@google/generative-ai`)
- `@notionhq/client` 5.6.0 - Notion API integration (optional, not currently used in code)

**Data Processing:**
- `xlsx` 0.18.5 - Excel file parsing (permit exports, market data)
- `pdf-lib` 1.17.1 - PDF generation and manipulation
- `zod` 4.3.4 - Schema validation and type inference
- `zod-to-json-schema` 3.25.1 - OpenAPI/JSON Schema generation from Zod

**Utilities:**
- `fuse.js` 7.1.0 - Fuzzy search (permit/company search in UI)
- `clsx` 2.1.1 - Conditional className utility
- `tailwind-merge` 3.3.1 - Merge Tailwind classes intelligently
- `citty` 0.1.6 - CLI argument parsing

**Error Tracking:**
- `@sentry/bun` 10.32.1 - Error tracking and monitoring (production errors)

## Configuration

**Environment:**
- Bun auto-loads `.env` file (no dotenv needed)
- TypeScript config: `tsconfig.json`
- Bun config: `bunfig.toml` (Tailwind plugin configuration)
- Build config: `build.ts` (custom Bun build script)

**Key Environment Variables:**
- `DUST_PERMIT_USERNAME` - Portal login (required)
- `DUST_PERMIT_PASSWORD` - Portal login (required)
- `GEMINI_API_KEY` - Google Gemini API (required for form extraction)
- `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` - Microsoft Graph auth (optional)
- `ASSESSOR_API_KEY` - Maricopa County Assessor API (optional)
- `JINA_API_KEY` - Jina web scraping (optional)
- `SENTRY_DSN` - Sentry error tracking (optional)
- `HEADLESS` - Browser visibility override (`true`/`false`)
- `PORT` - API server port (default: 47822)
- `NODE_ENV` - Environment mode (`development`/`production`)

**TypeScript Configuration:**
- Target: ESNext
- Module: Preserve
- Strict mode: Enabled
- Path aliases: `@/*` (src), `@tests/*` (tests), `@data/*` (data), `@email/*` (src/email)
- JSX: react-jsx

## Platform Requirements

**Development:**
- Bun runtime (>= latest stable)
- Chromium-based browser (for Playwright)
- TypeScript 5.9.3

**Production:**
- Bun runtime
- 47822 port (configurable via PORT env var)
- SQLite3 (built-in via Bun)

## Database

**Engine:**
- SQLite 3 (via bun:sqlite - no external dependency)

**Databases:**
- `src/db/company-permits.sqlite` - Company permits, jobs queue, automation state
- `src/db/marketing-permits.sqlite` - Market permit leads (scraped data)

**Features:**
- WAL (Write-Ahead Logging) mode for concurrent access
- Accessed via `Database` from `bun:sqlite`

## Package Scripts

**Development:**
- `bun dev` - Hot reload server
- `bun --hot src/index.ts` - Manual hot reload

**Production:**
- `bun src/index.ts` - Start server
- `NODE_ENV=production bun src/index.ts` - Production mode

**Utilities:**
- `bun run build.ts` - Build assets (HTML, CSS, JS to dist/)
- `bun run lint` - Check code with Biome
- `bun run lint:fix` - Auto-fix code with Biome
- `bun run typecheck` - TypeScript type checking
- `bun test` - Run all tests

**CLI Commands:**
- `bun src/cli.ts renew` - Renew permits
- `bun src/cli.ts close` - Close permits
- `bun src/cli.ts delete --all` - Delete drafts
- `bun src/cli.ts sync` - Sync market data

---

*Stack analysis: 2026-01-22*
