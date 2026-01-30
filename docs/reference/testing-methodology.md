# Testing Principles

## Test Design Principles

- **Atomic**: Each test validates one specific capability
- **Deterministic**: Tests produce consistent, measurable results
- **Realistic**: Use real-world scenarios and data structures
- **Measurable**: Define clear success/failure criteria

## Performance Optimization

- **Parallel Execution**: Design tests to run independently
- **Resource Management**: Clean up after each test (fresh DB per test)
- **Timeout Handling**: Set appropriate timeouts for async operations
- **Error Recovery**: Handle failures gracefully

## Data Quality

- **Ground Truth**: Establish reliable expected outcomes
- **Edge Cases**: Test boundary conditions and error scenarios
- **Statistical Significance**: Run multiple iterations for reliability
- **Version Control**: Track changes to test cases over time

## Best Practices for Custom Evals

1. **Descriptive names** - Test titles explain what's being tested
2. **Logical grouping** - Organize tests in nested describe blocks
3. **Appropriate matchers** - Use specific matchers over boolean checks
4. **Error testing** - Test failure conditions and exception handling
5. **Setup/teardown** - Use lifecycle hooks for consistent test states

## Running Tests

```bash
# Run real API tests (default)
bun test

# Run with coverage
bun test --coverage

# Run specific test file
bun test lib/db.test.ts

# Run mocked unit tests (for CI/offline)
bun test lib/__mocks__

# Watch mode
bun test --watch
```css

## Test Structure

```text
notion-sync/
├── lib/
│   ├── db.ts
│   ├── db.test.ts           # Real tests for database
│   ├── csv.ts
│   ├── csv.test.ts          # Real tests for CSV parsing
│   ├── enrichment.ts
│   ├── enrichment.test.ts   # Real tests for enrichment (hits Clearbit)
│   ├── notion.ts
│   ├── notion.test.ts       # Real API tests for Notion CRUD
│   ├── sync.ts
│   ├── test-utils.ts        # Shared test fixtures
│   └── __mocks__/
│       ├── notion.unit.test.ts  # Mocked Notion tests (for CI)
│       └── sync.unit.test.ts    # Mocked sync tests (for CI)
└── index.test.ts            # CLI integration tests
```

## Test Data

Using Apple and Google as test accounts:

- Well-known domains with valid Clearbit logos
- Deterministic, stable test fixtures
- Easy to verify expected outcomes
