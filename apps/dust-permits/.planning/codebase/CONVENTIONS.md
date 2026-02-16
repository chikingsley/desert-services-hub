# Coding Conventions

**Analysis Date:** 2026-01-22

## Naming Patterns

**Files:**
- kebab-case for all files: `email-classifier.ts`, `permit-parser.ts`, `form-data.ts`
- Test files use `.test.ts` suffix: `permit-parser.test.ts`, `email-classifier.test.ts`
- Selector files use kebab-case: `category-c.ts`, `page1.ts`, `post-k.ts`
- React components use PascalCase: `App.tsx`

**Functions:**
- camelCase for all function names: `classifyEmail()`, `parseHtmlExport()`, `fillText()`, `navigateToMyDustApps()`
- Async functions prefix action words: `createApplicationFull()`, `renewPermitFull()`, `closeBrowser()`
- Helper functions use verb-noun pattern: `waitForElement()`, `normalizeSelector()`, `validateInput()`

**Variables:**
- camelCase for all variables: `permitId`, `emailIntent`, `browserContext`, `formData`, `config`
- Constants for timing values: `SETTLE_MS = 1000`, `LAZY_LOAD_SCROLL_MS`, `TIMEOUT_DEFAULT`
- Regex patterns are UPPERCASE with `_REGEX` suffix: `DUST_APPLICATION_ID_REGEX`, `PERMIT_ID_REGEX`, `HTML_TAG_REGEX`
- Column indices use SCREAMING_SNAKE_CASE: `const COL = { ID: 0, PROJECT_NAME: 1, ... }`

**Types/Interfaces:**
- PascalCase for all type definitions: `FormData`, `EmailIntent`, `ClassificationResult`, `PortalPermit`, `BrowserInstance`
- Zod schemas use PascalCase with `Schema` suffix: `EmailIntentSchema`, `ClassificationResultSchema`, `EntityTypeSchema`
- Type unions and enums use PascalCase: `EntityType`, `ControlMeasure`, `ApplicationFlow`

## Code Style

**Formatting:**
- Tool: Biome with Ultracite preset (zero-config)
- Config: `biome.jsonc` with override rules for specific directories
- Run formatting: `bun x ultracite fix`
- Check for issues: `bun x ultracite check`
- Disabled rules in specific files: noBarrelFile (off in src/ and tests/), noExcessiveCognitiveComplexity (off in tests/ and specific portal files)

**Linting:**
- Tool: Biome via Ultracite
- Enforced principles: type-safe, explicit, performant, maintainable code
- No unused variable warnings: `noUnusedLocals: false` in tsconfig
- Type guards required: `strictNullChecks: true`, `noImplicitOverride: true`

## Import Organization

**Order:**
1. Built-in/external libraries: `import { readFile } from "xlsx"`
2. Type imports: `import type { Page, BrowserContext } from "playwright"`
3. Path alias imports: `import { fillText } from "@/portal/utils/helpers"`
4. Relative imports (if used): `import { config } from "./config"`
5. Type-only path aliases: `import type { FormData } from "@/form-data"`

**Path Aliases:**
- `@/*` → `src/*` (main source)
- `@tests/*` → `tests/*` (test utilities)
- `@data/*` → `data/*` (sample data)
- `@email/*` → `src/email/*` (email-specific)

**Pattern:**
- Import specific items when possible: `import { classifyEmail, mightBeDustPermit } from "@/lib/email-classifier"`
- Use namespace imports only in tests/docs (Biome allows in these directories)
- Keep unused parameter warnings disabled but use meaningful names
- Use `as` aliases for clarity: `import { handleListPermits as handleList } from "@/api/permits"`

## Error Handling

**Patterns:**
- Throw `Error` objects with descriptive messages: `throw new Error("PortalHarness: Not initialized. Call setup() first.")`
- Use meaningful error context: Include what failed and why in message
- Try-catch for browser interactions (Playwright throws on element not found)
- Catch errors silently with try-catch returning boolean: `try { ... } catch { return false }`
- Validation functions return `{ valid: true } | { valid: false; error: string }` discriminated unions
- API error responses include `error` field: `{ error: "Permit not found" }`

**Error Propagation:**
- Handler functions catch errors and return error responses (HTTP handlers)
- Business logic functions throw errors (handlers wrap them)
- E2E test harness throws on setup failure: `throw new Error("PortalHarness: Login failed...")`
- Browser instance errors propagate immediately (critical resource)

## Logging

**Framework:** Console via `process.stderr.write()`

**Patterns:**
- Use stderr for non-critical logging: `const log = (msg: string) => process.stderr.write(\`${msg}\n\`)`
- No `console.log` statements in production code (Biome enforces removal)
- Email classification tests use descriptive console output with Unicode: `console.log("\n📊 XLSX Sample Invoice Coverage")`
- Test coverage statistics logged to stderr
- Error messages go to stderr by default

## Comments

**When to Comment:**
- File headers with purpose and module path: `/** ... @module src/db/sync/permit-parser */`
- Section dividers with `===` lines (50+ chars): `// ============================================================================ // Core Logic // ============================================================================`
- Complex business logic that isn't self-evident
- Timing strategy explanations (e.g., SETTLE_MS usage in helpers.ts)
- Non-obvious regex patterns with explanation
- Type-safe patterns that need clarification

**JSDoc/TSDoc:**
- Always use JSDoc for exported functions: `/** @param email - Email to classify ... @returns ClassificationResult */`
- Document parameters with type and purpose: `@param config - Optional classifier configuration`
- Document return types: `@returns Classification result with is_dust_permit and intent`
- Module-level JSDoc: `@module src/lib/email-classifier`
- No JSDoc on private/internal functions (single-file utilities)

**No Comments For:**
- Simple variable declarations or obvious assignments
- Self-documenting code with clear function names
- Trivial getters/setters

## Function Design

**Size:** Functions generally 30-100 lines in non-UI code; keep under 200 lines
- Portal fill functions (category-*.ts) explicitly allow higher complexity
- Test utilities and helpers can be more concise

**Parameters:**
- Use parameter objects for 3+ parameters: `fillText(page, selector, value)` vs `fillTextWithSelectors(page, selectors, value)`
- Destructure object parameters for clarity: `async setup(options: { headless?: boolean } = {})`
- Type parameters explicitly: `async fillText(page: Page, selector: string, value: string): Promise<void>`

**Return Values:**
- Async functions return meaningful types: `Promise<boolean>`, `Promise<CreateResult>`, `Promise<Page>`
- Validation functions use discriminated unions: `{ valid: true } | { valid: false; error: string }`
- Void for side-effect only functions: `await harness.teardown(): Promise<void>`
- Boolean for success/failure checks: `const success = await navigateToMyDustApps(page)`
- Single string for simple text: `extract(prompt, z.string())`

## Module Design

**Exports:**
- Export only public APIs; keep internal helpers non-exported
- Use named exports for multiple functions: `export { classifyEmail, mightBeDustPermit }`
- Use default exports for test fixtures/utilities
- Re-export types: `export type { ApplicationLinkInfo } from "@/portal/types"`
- Use `as const` for immutable configuration: `as const` for COL indices

**Barrel Files:**
- Barrel files (index.ts) allowed in src/ and tests/ (Biome override)
- Use sparingly; prefer direct imports when possible
- Portal selectors organized in modules with exports: `export const SELECTORS: SelectorMap = { ... }`

**Zod Validation:**
- Define schemas at module level: `export const EmailIntentSchema = z.enum([...])`
- Infer types from schemas: `export type EmailIntent = z.infer<typeof EmailIntentSchema>`
- Use schema extensions for API variations: `const apiCreateSchema = createSchema.omit({...}).extend({...})`
- Document schema validation with descriptions: `.describe("New permit request")`

## Async/Await

**Pattern:**
- Always await promises in async functions
- Prefer async/await over promise chains
- Use try-catch for error handling in async code
- Handle rejection-prone operations with try-catch

**Example (from helpers.ts):**
```typescript
export async function waitForElement(
  page: Page | Frame,
  selector: string,
  timeoutMs = 15_000
): Promise<boolean> {
  try {
    await page
      .locator(selector)
      .first()
      .waitFor({ state: "visible", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}
```

## TypeScript-Specific

**Type Safety:**
- Use `type` keyword for type aliases: `type EmailInput = { subject: string; ... }`
- Use `interface` for extensible contracts: `interface ClassifierConfig { ... }`
- Prefer `unknown` over `any` if type truly unknown
- Use `as const` for readonly tuples and literal types
- Type guard with narrowing rather than assertions

**Null Handling:**
- Use optional chaining: `data?.choices?.[0]?.message?.content`
- Use nullish coalescing for defaults: `config?.endpoint ?? DEFAULT_ENDPOINT`
- Zod schemas mark nullable fields: `z.string().optional()` or explicit null union

---

*Conventions analysis: 2026-01-22*
