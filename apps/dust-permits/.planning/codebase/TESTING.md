# Testing Patterns

**Analysis Date:** 2026-01-22

## Test Framework

**Runner:**
- Framework: Bun's built-in test runner (`bun:test`)
- Config: None required (Bun auto-detects `.test.ts` files)
- Version: Latest Bun (uses `@types/bun` ^1.3.5 in devDependencies)

**Assertion Library:**
- Library: Bun's built-in `expect()` from `bun:test`
- Type: Jest-compatible assertion API

**Run Commands:**
```bash
bun test                                  # Run all tests
bun test tests/unit/permit-parser.test.ts # Run specific test file
bun test --watch                          # Watch mode (if supported)
bun test --coverage                       # Coverage report
```

## Test File Organization

**Location:**
- Pattern: Mirror `src/` structure in `tests/` directory
- Colocated tests NOT used; separate `tests/` directory
- Unit tests: `tests/unit/` for non-browser, non-API tests
- API tests: `tests/api/` for HTTP endpoint tests
- E2E tests: `tests/e2e/` for portal automation tests
- Library tests: `tests/lib/` for business logic and utilities

**Naming:**
- Pattern: `{module}.test.ts` (e.g., `permit-parser.test.ts`, `email-classifier.test.ts`)
- Utilities: `.ts` files (not `.test.ts`): `extraction-validator.ts`, `harness.ts`, `timeouts.ts`
- Utilities directory: `tests/{category}/utils/` (e.g., `tests/e2e/utils/`)

**Structure:**
```
tests/
├── unit/
│   └── permit-parser.test.ts       # Unit tests
├── api/
│   ├── health.test.ts              # API endpoint tests
│   ├── permits.test.ts
│   └── browser.test.ts
├── lib/
│   ├── email-classifier.test.ts    # Library/business logic tests
│   ├── extraction-validator.test.ts
│   └── email-classifier-eval.test.ts
├── e2e/
│   ├── login.test.ts               # Portal automation tests
│   ├── create-fresh.test.ts
│   ├── close.test.ts
│   └── utils/
│       ├── harness.ts              # Test utilities
│       ├── timeouts.ts
│       └── element-recorder.ts
└── email.test.ts                   # Module-specific tests
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, test } from "bun:test";

describe("permit-parser", () => {
  describe("parseXlsxFile", () => {
    test("parses sample xlsx file", () => {
      // test body
    });
  });

  describe("parseHtmlExport (portal exports)", () => {
    test("parses company permits HTML export", async () => {
      // test body
    });
  });
});
```

**Patterns:**
- Use `describe()` for logical grouping by function/component
- Use `test()` for individual test cases (or `it()` as alias)
- Nest `describe()` blocks for related functionality
- Flat structure preferred; avoid excessive nesting (Biome rule disables cognitive complexity for tests)

**Async Testing:**
```typescript
describe("Health Check Endpoint", () => {
  it("returns healthy status", async () => {
    const response = await fetch(`${BASE_URL}/health`);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.status).toBe("healthy");
  });
});
```

**Setup/Teardown:**
```typescript
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  // Start server or initialize resources
  server = Bun.serve({
    port: PORT,
    fetch: (req) => {
      // handler
    },
  });
});

afterAll(() => {
  // Clean up
  server.stop();
});
```

## Mocking

**Framework:** No dedicated mocking library used; platform-specific approaches:
- HTTP mocking: Spin up actual Bun server in tests (`Bun.serve()`)
- Browser mocking: Use real Playwright browser (no Jest.mock)
- File mocking: Read actual files using `Bun.file()` and test data in `data/samples/`

**Patterns - HTTP Server in Tests:**
```typescript
// tests/api/health.test.ts
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  const { handleHealthCheck } = await import("@/api/permits");

  server = Bun.serve({
    port: 47_899,
    fetch: (req) => {
      const url = new URL(req.url);
      if (url.pathname === "/health") {
        return handleHealthCheck();
      }
      return new Response("Not found", { status: 404 });
    },
  });
});

// Test makes real fetch calls
it("returns healthy status", async () => {
  const response = await fetch(`http://localhost:47_899/health`);
  expect(response.status).toBe(200);
});
```

**Patterns - Real Browser Tests:**
```typescript
// tests/e2e/login.test.ts
import { PortalHarness } from "./utils/harness";

describe("Login Test", () => {
  const harness = new PortalHarness();

  beforeAll(async () => {
    await harness.setup();  // Creates real Playwright browser
  });

  afterAll(async () => {
    await harness.teardown();
  });

  test("can access My Dust Apps table", async () => {
    const success = await navigateToMyDustApps(harness.page);
    expect(success).toBe(true);
  });
});
```

**What to Mock:**
- HTTP requests: Spin up real Bun server for realistic testing
- Database: Use real SQLite files in tests (data persists between test runs)
- File I/O: Use actual files from `data/samples/`
- Browser: Use real Playwright browser for E2E tests (no headless mocking)

**What NOT to Mock:**
- Playwright browser interactions (test against real browser)
- HTTP servers (test real Bun server behavior)
- File system operations (test real parsing)
- Date/Time: Allow actual system clock (tests have timeouts)

## Fixtures and Factories

**Test Data:**
```typescript
// tests/lib/email-classifier.test.ts
const EMAILS = {
  newPermit: {
    subject: "Fw: Desert Sky: Dust Control Permit",
    from: "rick@desertservices.net",
    body: "Chi, Can you submit the Dust permit...",
  },
  renewal: {
    subject: "Dust Control Renewal",
    from: "lsanchezburciaga@holder.com",
    body: "We will need Dust Control permit renewed...",
  },
  // ... more test emails
} satisfies Record<string, EmailInput>;
```

**Location:**
- Inline test data: Define in test files for readability (emails, small datasets)
- Sample files: Store in `data/samples/` directory
  - `data/samples/dustApplications.xlsx` - Excel export sample
  - `data/samples/company-permits-export.html` - Company portal HTML
  - `data/samples/marketing-permits-export.html` - Marketing portal HTML
- Fixtures: Load via `Bun.file()` and parse in test: `await Bun.file(PATH).text()`

**Test Constants:**
```typescript
// tests/unit/permit-parser.test.ts
const SAMPLE_XLSX_PATH = "data/samples/dustApplications.xlsx";
const COMPANY_HTML_EXPORT = "data/samples/company-permits-export.html";

// Regex patterns at top level for performance
const PERMIT_ID_REGEX = /^D\d+$/;
const COMPANY_ID_REGEX = /^CMP\d+$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
```

## Coverage

**Requirements:** None enforced (no coverage threshold in config)

**View Coverage:**
```bash
bun test --coverage
```

**Coverage Approach:**
- No minimum coverage requirement configured
- Focus on critical paths: permit parsing, email classification, browser automation
- Acceptable gaps: UI rendering (tested manually), error edge cases

## Test Types

**Unit Tests:**
- Scope: Single function/module in isolation
- Location: `tests/unit/` and `tests/lib/`
- Example: `permit-parser.test.ts` tests Excel/HTML parsing functions
- Pattern: Call function with sample data, assert output structure
- No browser/network required

Example:
```typescript
describe("permit-parser", () => {
  describe("parseXlsxFile", () => {
    test("parses sample xlsx file", () => {
      const permits = parseXlsxFile(SAMPLE_XLSX_PATH);
      expect(permits.length).toBeGreaterThan(0);
      expect(permits[0]?.id).toMatch(PERMIT_ID_REGEX);
    });
  });
});
```

**API Tests:**
- Scope: HTTP endpoints with real Bun server
- Location: `tests/api/`
- Example: `health.test.ts`, `permits.test.ts`, `browser.test.ts`
- Pattern: Start server in beforeAll, make fetch calls, stop server in afterAll
- Assert HTTP status, headers, response JSON
- Use different ports per test suite (47_899, 47_900, etc.) to avoid conflicts

Example:
```typescript
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  const { handleListPermits } = await import("@/api/permits");
  server = Bun.serve({
    port: 47_900,
    routes: {
      "/api/permits": {
        GET: handleListPermits,
      },
    },
  });
});

it("returns array of permits", async () => {
  const response = await fetch(`http://localhost:47_900/api/permits`);
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(Array.isArray(data)).toBe(true);
});
```

**E2E Tests:**
- Scope: Full portal automation workflows via Playwright
- Location: `tests/e2e/`
- Example: `login.test.ts`, `create-fresh.test.ts`, `close.test.ts`
- Pattern: Use `PortalHarness` for setup/teardown, interact with real portal
- Assert portal state: elements visible, data correctly filled, status changes
- Include timeout configuration per test
- Headless mode: Controlled via `config.tests.headless` or `--headless`/`--headed` CLI flags

Example:
```typescript
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

describe("Login Test", () => {
  const harness = new PortalHarness();

  beforeAll(async () => {
    await harness.setup();
  }, TIMEOUTS.standard);

  test("can access My Dust Apps table", async () => {
    const success = await navigateToMyDustApps(harness.page);
    expect(success).toBe(true);
  }, TIMEOUTS.standard);
});
```

## E2E Test Utilities

**PortalHarness Class** (`tests/e2e/utils/harness.ts`):
- Purpose: Consistent interface for portal E2E tests
- Methods: `setup()`, `teardown()`, `navigateToDustApps()`, `navigateToSearch()`, `setupForSearch()`
- Properties: `page`, `context`, `currentState`
- State tracking: "disconnected" → "logged_in" → "dust_apps" → "dust_search"

**Timeout Configuration** (`tests/e2e/utils/timeouts.ts`):
- Usage: `test("name", async () => {...}, TIMEOUTS.standard)`
- Types: `TIMEOUTS.quick`, `TIMEOUTS.standard`, `TIMEOUTS.long`
- Purpose: Different timeouts for different test speeds (login slow, button clicks fast)

**Element Recorder** (`tests/e2e/utils/element-recorder.ts`):
- Purpose: Debug utility for discovering portal element selectors
- Pattern: Use `page.evaluate()` to scan DOM for matching patterns
- Complexity: High (allowed override in biome.jsonc)

## Test Principles

**Tests Verify, They Don't Fix:**
- Tests only check behavior; they never retry or work around failures
- If portal is slow: add wait time BEFORE actions, not retry AFTER failures
- No `page.reload()` and try again; add `TIMEOUTS.long` instead
- No silent early returns; test fails loudly if assertion fails

**Example Pattern:**
```typescript
// CORRECT: Expect slowness, wait before action
await sleep(2000); // Portal is slow, wait before action
const success = await navigateToMyDustApps(harness.page);
expect(success).toBe(true);

// INCORRECT: Retry and hide failure
let success = false;
for (let i = 0; i < 3; i++) {
  success = await navigateToMyDustApps(harness.page);
  if (success) break;
  await sleep(1000);
}
expect(success).toBe(true); // Masks timeout issues
```

**Assertion Inside Blocks:**
- All assertions must be inside `test()` or `it()` blocks
- Not in beforeAll/afterAll hooks
- Not at module level

## Common Test Patterns

**Validation Function Testing:**
```typescript
// tests/lib/email-classifier-eval.test.ts
describe("mightBeDustPermit (keyword filter)", () => {
  it("returns true for emails with dust permit keywords", () => {
    expect(mightBeDustPermit(EMAILS.newPermit)).toBe(true);
    expect(mightBeDustPermit(EMAILS.renewal)).toBe(true);
  });

  it("returns false for non-permit emails", () => {
    expect(mightBeDustPermit(EMAILS.irrelevantMeeting)).toBe(false);
  });
});
```

**Data Extraction Testing:**
```typescript
// tests/unit/permit-parser.test.ts
test("extracts invoice data from xlsx", () => {
  const permits = parseXlsxFile(SAMPLE_XLSX_PATH);
  const withInvoice = permits.filter((p) => p.invoiceNumber?.startsWith("IV"));

  expect(withInvoice.length).toBeGreaterThan(0);
  const sample = withInvoice[0];
  expect(sample?.invoiceNumber).toMatch(INVOICE_NUMBER_REGEX);
  expect(typeof sample?.invoiceCharges).toBe("number");
});
```

**File Loading in Tests:**
```typescript
// tests/unit/permit-parser.test.ts
test("parses company permits HTML export", async () => {
  const content = await Bun.file(COMPANY_HTML_EXPORT).text();
  const permits = parseHtmlExport(content);
  expect(permits.length).toBeGreaterThan(1000);
});
```

**API Response Testing:**
```typescript
// tests/api/permits.test.ts
it("returns 404 for non-existent permit", async () => {
  const response = await fetch(`${BASE_URL}/api/permits/NONEXISTENT123`);
  expect(response.status).toBe(404);

  const data = await response.json();
  expect(data.error).toBeDefined();
});
```

**Browser State Assertions:**
```typescript
// tests/e2e/login.test.ts
test("can see New Application button", async () => {
  const btnVisible = await harness.page.isVisible(
    portal.dustApps.newApplicationBtn
  );
  expect(btnVisible).toBe(true);
});
```

## Known Test Characteristics

**Port Usage:**
- API tests use specific high ports to avoid conflicts: 47_899, 47_900, etc.
- No centralized port registry; add comment when assigning new test port

**Headless Mode:**
- Default: Controlled by `config.tests.headless` in `src/portal/utils/config.ts`
- Override: CLI flags `--headless` or `--headed` when running tests
- E2E tests default to headless for CI; use `--headed` for debugging

**Sample Data:**
- Excel files: Real Maricopa County permit data (XLSX format)
- HTML exports: Portal export snapshots with 1000+ permits
- Email examples: Real dust permit request patterns from inbox

**Database Persistence:**
- Tests use real SQLite databases: `src/db/company-permits.sqlite`, `src/db/marketing-permits.sqlite`
- Data persists between test runs (not cleared by harness)
- Manual cleanup required if test database gets corrupted

---

*Testing analysis: 2026-01-22*
