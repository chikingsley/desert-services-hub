# Testing Patterns

**Analysis Date:** 2026-01-22

## Test Framework

**Runner:**

- Bun's built-in test runner via `bun test`
- Config: Implicit (no config file needed)

**Assertion Library:**

- Bun's built-in assertions: `expect()`, `toBe()`, `toEqual()`, `toBeGreaterThan()`, `toBeInstanceOf()`

**Run Commands:**

```bash
bun test tests/ services/          # Run all tests
bun test <file>                    # Run specific test file
bun test --timeout 60000           # Run with custom timeout
```

## Test File Organization

**Location:**

- Test files co-located with implementation or in dedicated `tests/` directory
- Examples:
  - `services/monday/monday.test.ts` (co-located)
  - `tests/lib/pdf/generate.test.ts` (dedicated directory)
  - `src/api/quotes.test.ts` (co-located)

**Naming:**

- Unit tests: `*.unit.test.ts` (e.g., `mcp-server.unit.test.ts`)
- Integration tests: `*.integration.test.ts` (e.g., `mcp-server.integration.test.ts`)
- MCP tests: `*.mcp.test.ts` (e.g., `mcp-server.mcp.test.ts`)
- General tests: `*.test.ts` (e.g., `monday.test.ts`)

**Structure:**

```
tests/
├── lib/
│   └── pdf/
│       ├── generate.test.ts
│       ├── back-page.test.ts
│       └── test-data.ts (shared fixtures)
└── components/
    └── quotes/
        └── quote-workspace.test.ts

services/
├── monday/
│   ├── client.ts
│   ├── monday.test.ts (co-located)
│   └── mcp-server.test.ts (co-located)
```

## Test Structure

**Suite Organization:**

```typescript
import { describe, expect, it } from "bun:test";

describe("module name", () => {
  describe("function/feature", () => {
    it("should do something specific", () => {
      // Arrange
      const input = createTestData();

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

**Patterns:**

- Flat `describe` structure (avoid excessive nesting)
- Each test uses **Arrange-Act-Assert (AAA)** pattern explicitly
- One logical assertion per test (can have multiple `expect()` statements for related checks)

**Setup and Teardown:**

- `beforeAll()`: Initialize expensive resources, create test data
- `afterAll()`: Clean up resources, delete test records
- No `beforeEach()` or `afterEach()` unless needed for isolation

See `src/api/quotes.test.ts` for cleanup pattern:

```typescript
afterAll(() => {
  for (const id of testQuoteIds) {
    try {
      db.prepare("DELETE FROM quotes WHERE id = ?").run(id);
    } catch {
      // Ignore cleanup errors
    }
  }
  // Verify cleanup
  const remaining = db.prepare("SELECT COUNT(*) as count FROM quotes WHERE job_name LIKE ?").get(`${TEST_PREFIX}%`) as { count: number };
  if (remaining.count > 0) {
    throw new Error(`Cleanup failed: ${remaining.count} test quotes remain`);
  }
});
```

## Mocking

**Framework:**

- Bun's built-in `mock()` function from `bun:test`

**Patterns:**

```typescript
import { beforeAll, mock } from "bun:test";

beforeAll(() => {
  global.fetch = mock(
    async () =>
      new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
  ) as any;
});
```

**What to Mock:**

- External APIs (fetch, third-party services)
- File system operations (in unit tests)
- Expensive operations (use real data only in integration tests)

**What NOT to Mock:**

- Internal functions within the same module (test the whole behavior)
- Database operations in integration tests (use test database)
- Core logic that's being tested (unless specifically testing error handling)

## Fixtures and Factories

**Test Data:**
Test data is created inline with descriptive variable names. Example from `services/quoting/mcp-server.unit.test.ts`:

```typescript
const mockQuotes: HubQuote[] = [
  {
    id: "uuid-1",
    base_number: "250101001",
    job_name: "Phoenix Project",
    job_address: "123 Main St",
    client_name: "Acme Corp",
    client_email: "acme@example.com",
    status: "draft",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    current_version: {
      id: "v1",
      total: 1000,
      sections: [],
      line_items: [
        {
          id: "item-1",
          section_id: null,
          description: "Included Item",
          quantity: 10,
          unit: "EA",
          unit_cost: 7,
          unit_price: 10,
          is_excluded: 0,
          notes: null,
          sort_order: 0,
        },
      ],
    },
  },
];
```

**Constants in Tests:**
Tests use constants for unique identifiable values for searching/assertions:

```typescript
const TEST_PREFIX = "_TEST_DELETE_ME_";
const UNIQUE = {
  JOB_NAME: `${TEST_PREFIX}UniqueJob_ABC123`,
  CLIENT_NAME: "UniqueClient_XYZ789",
  CLIENT_EMAIL: "unique_test_456@example.com",
};
```

**Location:**

- Shared test data: `tests/lib/pdf/test-data.ts`
- Inline mock data: Within test file near the test
- Test utilities: `services/contract/test-utils.ts`

## Coverage

**Requirements:**

- No enforced minimum coverage requirement
- Code coverage not currently tracked or reported

## Test Types

**Unit Tests:**

- Scope: Single function/module behavior
- Dependencies: Mocked
- Credentials: Not required
- Example: `services/monday/monday.test.ts` tests `calculateSimilarity()` function
- Time: Fast (< 1 second)

```typescript
describe("calculateSimilarity", () => {
  it("returns 1 for exact match", () => {
    expect(calculateSimilarity("hello", "hello")).toBe(1);
  });
});
```

**Integration Tests:**

- Scope: API interactions with real services
- Dependencies: Real (database, external APIs)
- Credentials: Required from environment variables
- Naming: `*.integration.test.ts`
- Example: `services/quoting/mcp-server.integration.test.ts`
- Time: Slower (can take seconds)
- Cleanup: Must clean up test resources created in integration tests

```typescript
describe("MCP Server Integration", () => {
  let hubAvailable = false;
  let testQuoteId: string | null = null;
  const TEST_PREFIX = "_TEST_DELETE_ME_";

  beforeAll(async () => {
    hubAvailable = await checkHubAvailable();
    if (!hubAvailable) {
      console.log("Hub not available - skipping integration tests");
    }
  });

  afterAll(async () => {
    // Clean up test resources
  });
});
```

**MCP Tests:**

- Scope: MCP server tool definitions and implementations
- Naming: `*.mcp.test.ts` or `mcp-server.test.ts`
- Example: `services/monday/mcp-server.test.ts`
- Tests that tools are callable and return expected structure

## Common Patterns

**Async Testing:**

```typescript
it("async operation completes", async () => {
  // Arrange
  const input = { query: 'test' };

  // Act
  const result = await query(input);

  // Assert
  expect(result.data).toBeDefined();
});
```

**Error Testing:**

```typescript
it("throws when MONDAY_API_KEY not set", async () => {
  const original = process.env.MONDAY_API_KEY;
  process.env.MONDAY_API_KEY = undefined;

  const { query } = await import("./client");

  await expect(query("{ users { id } }")).rejects.toThrow("MONDAY_API_KEY");

  process.env.MONDAY_API_KEY = original;
});
```

**Timeout Configuration:**
Tests that may take longer can specify timeout in milliseconds:

```typescript
test("extracts text from PDF", async () => {
  const text = await extractTextWithPdftotext(fixture);
  expect(text.length).toBeGreaterThan(1000);
}, 60_000); // 60 second timeout
```

**Conditional Test Skipping:**
Use `beforeAll()` to check prerequisites and log skip reason:

```typescript
beforeAll(async () => {
  hubAvailable = await checkHubAvailable();
  if (!hubAvailable) {
    console.log("Hub not available at", HUB_URL, "- skipping integration tests");
  }
});

it("calls hub API", async () => {
  if (!hubAvailable) return; // Skip silently
  const result = await hubFetch("/api/quotes");
  expect(result).toBeDefined();
});
```

## Test Isolation

**Database Tests:**

- Use unique test data prefixes: `_TEST_DELETE_ME_`
- Track created IDs in arrays: `const testQuoteIds: string[] = [];`
- Verify cleanup after all tests: Count remaining records with test prefix

**Environment Variables:**

- Save original values, restore after test
- Example from `services/monday/monday.test.ts`:

  ```typescript
  const original = process.env.MONDAY_API_KEY;
  process.env.MONDAY_API_KEY = undefined;
  // ... test ...
  process.env.MONDAY_API_KEY = original;
  ```

**External Service Tests:**

- Check availability before running integration tests
- Skip gracefully if service not available
- Don't fail CI if external service is down

## Best Practices

**Test Assertions:**

- Be specific with assertions: `expect(value).toBe(expectedValue)` not just checking truthiness
- Verify both happy path and error cases
- Check specific error messages for thrown errors

**Test Naming:**

- Use descriptive `it()` descriptions that read like requirements
- Bad: `it("calculates")`
- Good: `it("calculates total for empty items array")`

**Dependencies:**

- Never use `.only` or `.skip` in committed code
- One test per file can fail without affecting others (tests are isolated)
- Cleanup errors should not cause test failure (wrap in try-catch)

---

*Testing analysis: 2026-01-22*
