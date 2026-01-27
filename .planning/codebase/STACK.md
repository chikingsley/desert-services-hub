# Technology Stack

**Analysis Date:** 2026-01-22

## Languages

**Primary:**

- TypeScript 5.9.3 - Type-safe server and client code across all services
- HTML/CSS - Frontend markup and styling
- JavaScript - Runtime execution via Bun

**Secondary:**

- None currently in use

## Runtime

**Environment:**

- Bun 1.x (latest) - Native JavaScript/TypeScript runtime with bundler and test runner
- Node.js compatibility through Bun's drop-in replacement
- Native SQLite support via `bun:sqlite`

**Package Manager:**

- Bun package manager (replaces npm/yarn/pnpm)
- Lockfile: `bun.lock` (present)
- Install: `bun install`

## Frameworks

**Core:**

- No traditional web framework - Server implemented with `bun serve()` and native routing
- Custom HTTP routing in `src/server.ts` with path-based handlers
- Frontend is static HTML bundled by Bun (no React SSR or SPA framework)

**UI/Rendering:**

- React 19.2.3 - Used in PDF generation via pdfmake, not for web UI
- pdfjs-dist 5.4.530 - PDF viewing and manipulation
- Playwright 1.57.0 - Browser automation (testing, PDF operations)

**Testing:**

- Bun's native test runner (`bun test`)
- No external test frameworks (Jest, Vitest) - uses Bun's built-in capabilities
- Tests use `.unit.test.ts` and `.integration.test.ts` naming conventions

**Build/Dev:**

- Ultracite 7.0.12 - Zero-config Biome preset for linting and formatting
- Biome 2.3.11 - Rust-based linting and formatting engine
- TypeScript 5.9.3 - Type checking via `tsc --noEmit`
- Tailwind CSS 4.1.18 - Utility-first CSS framework
- bun-plugin-tailwind 0.1.2 - Tailwind integration for Bun

## Key Dependencies

**Critical:**

- `@modelcontextprotocol/sdk` 1.25.3 - MCP server implementation for Claude Code integration
- `zod` 4.3.6 - Runtime schema validation for API inputs and MCP tools
- `zod-to-json-schema` 3.25.1 - Converts Zod schemas to JSON Schema for MCP tool definitions
- `mailparser` 3.9.1 - Email parsing and extraction
- `csv-parse` 6.1.0 / `csv-stringify` 6.6.0 - CSV data processing

**Infrastructure:**

- `minio` 8.0.6 - S3-compatible object storage client
- `@microsoft/microsoft-graph-client` 3.0.7 - Microsoft Graph API (email, SharePoint)
- `@azure/identity` 4.13.0 - Azure AD authentication (MSAL)
- `@azure/msal-node` (implicit, via @azure/identity) - Device code flow and token caching

**Data & PDF:**

- `pdf-lib` 1.17.1 - PDF manipulation and creation
- `pdfmake` 0.3.3 - Server-side PDF generation with templating
- `pdfjs-dist` 5.4.530 - PDF.js viewer library
- `xlsx` 0.18.5 - Excel file parsing and generation

**UI Components & Styling:**

- `@radix-ui/*` - Component primitives (9 packages, e.g., dialog, select, tabs)
- `lucide-react` 0.562.0 - Icon library (SVG icons)
- `tailwind-merge` 3.4.0 - Tailwind class merging utility
- `class-variance-authority` 0.7.1 - Type-safe CSS class utilities
- `clsx` 2.1.1 - Conditional class name builder
- `cmdk` 1.1.1 - Command palette UI component
- `sonner` 2.0.7 - Toast notification library
- `react-day-picker` 9.13.0 - Calendar/date picker component
- `tw-animate-css` 1.4.0 - Tailwind animation utilities

**Utilities & Helpers:**

- `@google/genai` 1.38.0 - Google Gemini API client
- `peopledatalabs` 14.1.1 - People Data Labs enrichment API
- `@atlaskit/pragmatic-drag-and-drop` 1.7.7 - Drag-and-drop UI library
- `react-rnd` 10.5.2 - Resizable and draggable components
- `react-router` 7.12.0 - Client-side routing (may not be used if static frontend)
- `lodash.debounce` 4.0.8 - Debounce utility
- `cli-progress` 3.12.0 - CLI progress bar for scripts

## Configuration

**Environment:**

- Bun automatically loads `.env` files (no dotenv package needed)
- Config via environment variables (see .env.example)
- Critical secrets: Azure credentials, API keys, database URLs
- Database path configurable via `DATABASE_PATH` env var (defaults to `lib/db/app.db`)

**Build:**

- `tsconfig.json` - TypeScript configuration with path aliases
- `biome.jsonc` - Biome linting/formatting rules (Ultracite preset)
- PostCSS 8.5.6 - CSS processing (Tailwind integration)
- No webpack/esbuild config - Bun handles bundling

## Platform Requirements

**Development:**

- Bun 1.x runtime
- TypeScript 5.9.3 (included as devDependency)
- Node 18+ compatible (Bun runs on Node 18+)
- SQLite 3.x (embedded in Bun)

**Production:**

- Bun 1.x runtime
- Environment variables for Azure AD, API keys, object storage
- SQLite database file (persistent, WAL-enabled)
- MinIO or S3-compatible object storage for PDFs and images

## Development Commands

```bash
bun run dev          # Start development server with hot reload
bun run start        # Run production server
bun run check        # TypeScript check + Biome lint
bun x ultracite fix  # Auto-fix linting and formatting issues
bun test             # Run all tests in tests/ and services/
bun run pdf          # Test PDF generation (scripts/test-pdf-gen.ts)
```

## Notes

- **No frontend framework**: The app served static HTML from `src/frontend/index.html`, not a React SPA or Next.js app
- **MCP-first architecture**: Services expose tools via MCP servers for Claude Code integration
- **Database**: SQLite with WAL mode enabled for concurrent read/write
- **Linting**: Biome via Ultracite - all formatting is automated, strict type checking enforced

---

*Stack analysis: 2026-01-22*
