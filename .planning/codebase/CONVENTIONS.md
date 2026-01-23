# Coding Conventions

**Analysis Date:** 2026-01-22

## Naming Patterns

**Files:**
- Module files use lowercase with hyphens: `client.ts`, `mcp-server.ts`, `pdf-builder.ts`
- Test files use descriptive names with test type: `monday.test.ts`, `mcp-server.unit.test.ts`, `contract.test.ts`, `quotes.test.ts`
- Export suffixes indicate type: `*.types.ts` for type definitions, `*.schemas.ts` for Zod schemas
- Hook files use `use-` prefix: `use-quote-editor.ts`, `use-undo-redo.ts`, `use-mobile.ts`

**Functions:**
- Use camelCase for all functions: `calculateSimilarity`, `getBoard`, `validateMCPInput`, `formatCurrency`
- Async functions clearly indicate intent: `searchItems`, `fetchEmails`, `extractTextWithPdftotext`
- Factory/helper functions use descriptive verbs: `createEmptyQuote`, `generateEstimateNumber`, `buildItemUrl`
- Private functions have no underscore prefix; use module scope instead
- Constants that are standalone use UPPER_SNAKE_CASE: `API_URL`, `MIN_WORD_LENGTH`, `DEFAULT_BATCH_SIZE`, `MS_PER_DAY`

**Variables:**
- Use `const` by default, `let` only when reassignment is needed, never `var`
- Use descriptive names over abbreviated ones: `lineItems` not `items`, `testQuoteIds` not `ids`
- Intentionally unused destructured variables are prefixed with `_`: `const { used, _unused } = obj;`
- Boolean variables are prefixed with `is`, `has`, `can`, or `should`: `isExcluded`, `hasChildren`, `canRedo`, `shouldPaginate`

**Types:**
- Use `type` over `interface` for consistency: `type ValidationResult<T> = ...`
- Type names use PascalCase: `QuoteRow`, `MondayItem`, `EditorQuote`, `HubLineItem`
- Row types from SQLite are suffixed with `Row`: `QuoteRow`, `QuoteVersionRow`, `QuoteSectionRow`
- API response types are suffixed with their purpose: `GraphQLResponse<T>`, `ItemsPageResponse`
- Generic type parameters are named meaningfully: `T` for generic data, `S` for schema, `E` for error

**Exports:**
- Named exports are preferred; re-export specific items, not barrels
- Example from `services/monday/client.ts`: `export async function query<T>()`, `export function calculateSimilarity()`
- Type exports use `export type` keyword: `export type ScoredItem = ...`

## Code Style

**Formatting:**
- Tool: Biome via Ultracite preset
- Run `bun x ultracite fix` before committing to auto-fix formatting
- Line length: No hard limit, but keep functions under reasonable cognitive complexity

**Linting:**
- Tool: Biome (Ultracite preset) in `biome.jsonc`
- Key enforced rules: no barrel files (unless explicitly allowed), no `any` types, prefer specific imports
- Exceptions explicitly configured for legacy components in `lib/pdf-takeoff/` and some catalog components
- **IMPORTANT**: Never add lint suppression comments (`// biome-ignore`, `// @ts-ignore`) without explicit user request

## Import Organization

**Order:**
1. Node.js/Bun runtime imports: `import { readdir } from "node:fs"`
2. Third-party packages: `import { describe, expect, it } from "bun:test"`, `import { z } from "zod"`
3. Type imports: `import type { GraphQLResponse, MondayBoard } from "./types"`
4. Internal modules: `import { getApiKey } from "./client"`, `import { cn } from "@/lib/utils"`

**Path Aliases:**
- `@/*` resolves to project root (configured in `tsconfig.json`)
- Used consistently: `@/lib/types`, `@/components/ui/button`, `@/hooks/use-quote-editor`
- Relative imports are acceptable within the same directory

**Import Style:**
- Specific imports preferred over namespace imports: `import { getBoard, getBoardColumns } from "./client"` not `import * as client`
- Type imports use explicit `type` keyword: `import type { MondayItem } from "./types"`
- Unused imports should be removed (Biome detects this)

## Error Handling

**Patterns:**
- Throw `Error` objects with descriptive messages, never strings or other values
- Example: `throw new Error("MONDAY_API_KEY environment variable is required")`
- Include context in error messages: `throw new Error("Monday API error: ${firstError.message}")`
- Use early returns to avoid nested conditionals for error cases

**Try-Catch Usage:**
- Meaningful error handling only; don't catch just to rethrow
- Destructure error safely: `const message = error instanceof Error ? error.message : String(error)`
- Cleanup code in try-catch blocks that interact with external systems (databases, APIs)
- See `src/api/quotes.test.ts` for cleanup pattern: wrap in try-catch, ignore cleanup errors in afterAll

**Error Messages:**
- Provide actionable information for environment variable errors
- Include API/service context: `Hub API error (${response.status}): ${text}`
- For validation, use structured error format from `lib/schemas/validation.ts`

## Logging

**Framework:**
- `console.log` for informational output (only in scripts/tooling, not production code)
- `console.error` for error output in CLI scripts
- `console.warn` for warnings

**Patterns:**
- Remove `console.log` and `debugger` statements from production code in `lib/`, `services/`, and `src/api/`
- Allowed in: CLI scripts (`services/*/estimates/`), test setup (`services/*/mcp-server.test.ts`)
- Use descriptive prefixes in CLI scripts: `✅ All files processed`, `❌ Failed to download`, `⚠️ GEMINI_API_KEY not set`
- Example from `services/monday/estimates/extract.ts`:
  ```typescript
  console.log(`\n📊 New files processed this run: ${newCount}`);
  console.warn("  ⚠️  GEMINI_API_KEY not set, skipping line item extraction");
  ```

## Comments

**When to Comment:**
- Document non-obvious algorithms or business logic
- Provide examples in JSDoc comments for public functions
- Use section headers for organizing large functions: `// ============================================================================`

**JSDoc/TSDoc:**
- Used for public APIs and complex functions
- Include `@param`, `@return`, `@example` tags
- Example from `services/email/client.ts`:
  ```typescript
  /**
   * Microsoft Graph API client for email operations.
   *
   * Supports two authentication modes:
   * - App-only (client credentials): Access any mailbox in the tenant
   * - Delegated (user sign-in): Access the signed-in user's mailbox
   *
   * @example
   * const client = new GraphEmailClient({...});
   * client.initAppAuth();
   */
  ```

**Header Comments:**
- Module files start with a comment describing purpose
- Example from `services/monday/client.ts`:
  ```typescript
  /**
   * Monday.com API Client
   *
   * GraphQL-based client for Monday.com operations.
   */
  ```

## Function Design

**Size:**
- Keep functions focused and under reasonable cognitive complexity
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting

**Parameters:**
- Explicit types for all parameters (no implicit `any`)
- Use object parameters for functions with multiple arguments: `{ boardId, itemId }`
- Destructure parameters when appropriate

**Return Values:**
- Explicit return types for all functions
- Use union types for success/error: `Promise<T | null>`, `ValidationResult<T>`
- Void functions explicitly return nothing

**Async Functions:**
- Always `await` promises; don't forget to use the return value
- Use `async/await` syntax, not promise chains
- Handle errors with try-catch blocks

## Module Design

**Exports:**
- Export what needs to be used externally
- Keep internal helper functions private (module scope)
- Use named exports, not default exports
- Group exports by category with section comments

**Barrel Files:**
- Generally avoided per Biome `noBarrelFile` rule
- Exception: `lib/pdf-takeoff/index.ts` is explicitly allowed
- Prefer direct imports from module files

**Organization:**
- Related functions grouped together with section headers
- Constants defined at module top: API_URL, regex patterns, defaults
- Helper functions before public exports
- Types defined inline or in separate `types.ts` files

## Constants

**Definition:**
- Module-level constants use UPPER_SNAKE_CASE
- Numeric separators for readability: `10_000` not `10000`
- Top-level regex patterns defined once, not in loops
- Example from `services/monday/client.ts`:
  ```typescript
  const API_URL = "https://api.monday.com/v2";
  const WORD_SPLIT_REGEX = /\s+/;
  const DEFAULT_MAX_ITEMS = 10_000;
  const PAGE_SIZE = 500;
  const MIN_WORD_LENGTH = 3;
  ```

**Type-Level Constants:**
- Use `as const` assertions for immutable values and literal types
- Example: `status: "draft" as const`

## Database

**Query Patterns:**
- Use parameterized queries with `db.prepare()` and `.run()` or `.get()`
- Example from `src/api/quotes.test.ts`:
  ```typescript
  db.prepare("DELETE FROM quotes WHERE id = ?").run(id);
  db.prepare("SELECT COUNT(*) as count FROM quotes WHERE job_name LIKE ?").get(`${TEST_PREFIX}%`);
  ```

**Row Types:**
- Import from `lib/types.ts`: `QuoteRow`, `QuoteVersionRow`, etc.
- Type cast results: `db.prepare("...").get(...) as { count: number }`

---

*Convention analysis: 2026-01-22*
