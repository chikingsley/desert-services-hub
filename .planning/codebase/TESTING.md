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
```css
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

```css
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
```markdown
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
```typescript
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
```markdown
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
```text
```typescript
const TEST_PREFIX = "_TEST_DELETE_ME_";
const UNIQUE = {
  JOB_NAME: `${TEST_PREFIX}UniqueJob_ABC123`,
  CLIENT_NAME: "UniqueClient_XYZ789",
  CLIENT_EMAIL: "unique_test_456@example.com",
};
```css
```typescript
describe("calculateSimilarity", () => {
  it("returns 1 for exact match", () => {
    expect(calculateSimilarity("hello", "hello")).toBe(1);
  });
});
```markdown
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
```markdown
```typescript
it("async operation completes", async () => {
  // Arrange
  const input = { query: 'test' };

  // Act
  const result = await query(input);

  // Assert
  expect(result.data).toBeDefined();
});
```text
```typescript
it("throws when MONDAY_API_KEY not set", async () => {
  const original = process.env.MONDAY_API_KEY;
  process.env.MONDAY_API_KEY = undefined;

  const { query } = await import("./client");

  await expect(query("{ users { id } }")).rejects.toThrow("MONDAY_API_KEY");

  process.env.MONDAY_API_KEY = original;
});
```text
```typescript
test("extracts text from PDF", async () => {
  const text = await extractTextWithPdftotext(fixture);
  expect(text.length).toBeGreaterThan(1000);
}, 60_000); // 60 second timeout
```text
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
