# Testing Patterns Template

Template for `.planning/codebase/TESTING.md` - captures test framework and patterns.

**Purpose:** Document how tests are written and run. Guide for adding tests that match existing patterns.

---

## File Template

```markdown
# Testing Patterns

**Analysis Date:** [YYYY-MM-DD]

## Test Framework

**Runner:**
- [Framework: e.g., "Jest 29.x", "Vitest 1.x"]
- [Config: e.g., "jest.config.js in project root"]

**Assertion Library:**
- [Library: e.g., "built-in expect", "chai"]
- [Matchers: e.g., "toBe, toEqual, toThrow"]

**Run Commands:**
```bash
[e.g., "npm test" or "npm run test"]              # Run all tests
[e.g., "npm test -- --watch"]                     # Watch mode
[e.g., "npm test -- path/to/file.test.ts"]       # Single file
[e.g., "npm run test:coverage"]                   # Coverage report
```csv
```

[Show actual directory pattern, e.g.:
src/
  lib/
    utils.ts
    utils.test.ts
  services/
    user-service.ts
    user-service.test.ts
]

```css
```typescript
[Show actual pattern used, e.g.:

describe('ModuleName', () => {
  describe('functionName', () => {
    it('should handle success case', () => {
      // arrange
      // act
      // assert
    });

    it('should handle error case', () => {
      // test code
    });
  });
});
]
```csv
```typescript
[Show actual mocking pattern, e.g.:

// Mock external dependency
vi.mock('./external-service', () => ({
  fetchData: vi.fn()
}));

// Mock in test
const mockFetch = vi.mocked(fetchData);
mockFetch.mockResolvedValue({ data: 'test' });
]
```csv
```typescript
[Show pattern for creating test data, e.g.:

// Factory pattern
function createTestUser(overrides?: Partial<User>): User {
  return {
    id: 'test-id',
    name: 'Test User',
    email: 'test@example.com',
    ...overrides
  };
}

// Fixture file
// tests/fixtures/users.ts
export const mockUsers = [/* ... */];
]
```csv
```bash
[e.g., "npm run test:coverage"]
[e.g., "open coverage/index.html"]
```csv
```typescript
[Show pattern, e.g.:

it('should handle async operation', async () => {
  const result = await asyncFunction();
  expect(result).toBe('expected');
});
]
```text
```typescript
[Show pattern, e.g.:

it('should throw on invalid input', () => {
  expect(() => functionCall()).toThrow('error message');
});

// Async error
it('should reject on failure', async () => {
  await expect(asyncCall()).rejects.toThrow('error message');
});
]
```csv
```

<good_examples>

```markdown
# Testing Patterns

**Analysis Date:** 2025-01-20

## Test Framework

**Runner:**
- Vitest 1.0.4
- Config: vitest.config.ts in project root

**Assertion Library:**
- Vitest built-in expect
- Matchers: toBe, toEqual, toThrow, toMatchObject

**Run Commands:**
```bash
npm test                              # Run all tests
npm test -- --watch                   # Watch mode
npm test -- path/to/file.test.ts     # Single file
npm run test:coverage                 # Coverage report
```css
```

src/
  lib/
    parser.ts
    parser.test.ts
  services/
    install-service.ts
    install-service.test.ts
  bin/
    install.ts
    (no test - integration tested via CLI)

```css
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('ModuleName', () => {
  describe('functionName', () => {
    beforeEach(() => {
      // reset state
    });

    it('should handle valid input', () => {
      // arrange
      const input = createTestInput();

      // act
      const result = functionName(input);

      // assert
      expect(result).toEqual(expectedOutput);
    });

    it('should throw on invalid input', () => {
      expect(() => functionName(null)).toThrow('Invalid input');
    });
  });
});
```markdown
```typescript
import { vi } from 'vitest';
import { externalFunction } from './external';

// Mock module
vi.mock('./external', () => ({
  externalFunction: vi.fn()
}));

describe('test suite', () => {
  it('mocks function', () => {
    const mockFn = vi.mocked(externalFunction);
    mockFn.mockReturnValue('mocked result');

    // test code using mocked function

    expect(mockFn).toHaveBeenCalledWith('expected arg');
  });
});
```markdown
```typescript
// Factory functions in test file
function createTestConfig(overrides?: Partial<Config>): Config {
  return {
    targetDir: '/tmp/test',
    global: false,
    ...overrides
  };
}

// Shared fixtures in tests/fixtures/
// tests/fixtures/sample-command.md
export const sampleCommand = `---
description: Test command
---
Content here`;
```css
```bash
npm run test:coverage
open coverage/index.html
```typescript
```typescript
it('should handle async operation', async () => {
  const result = await asyncFunction();
  expect(result).toBe('expected');
});
```text
```typescript
it('should throw on invalid input', () => {
  expect(() => parse(null)).toThrow('Cannot parse null');
});

// Async error
it('should reject on file not found', async () => {
  await expect(readConfig('invalid.txt')).rejects.toThrow('ENOENT');
});
```text
```typescript
import { vi } from 'vitest';
import * as fs from 'fs-extra';

vi.mock('fs-extra');

it('mocks file system', () => {
  vi.mocked(fs.readFile).mockResolvedValue('file content');
  // test code
});
```markdown
```

</good_examples>

<guidelines>
**What belongs in TESTING.md:**
- Test framework and runner configuration
- Test file location and naming patterns
- Test structure (describe/it, beforeEach patterns)
- Mocking approach and examples
- Fixture/factory patterns
- Coverage requirements
- How to run tests (commands)
- Common testing patterns in actual code

**What does NOT belong here:**

- Specific test cases (defer to actual test files)
- Technology choices (that's STACK.md)
- CI/CD setup (that's deployment docs)

**When filling this template:**

- Check package.json scripts for test commands
- Find test config file (jest.config.js, vitest.config.ts)
- Read 3-5 existing test files to identify patterns
- Look for test utilities in tests/ or test-utils/
- Check for coverage configuration
- Document actual patterns used, not ideal patterns

**Useful for phase planning when:**

- Adding new features (write matching tests)
- Refactoring (maintain test patterns)
- Fixing bugs (add regression tests)
- Understanding verification approach
- Setting up test infrastructure

**Analysis approach:**

- Check package.json for test framework and scripts
- Read test config file for coverage, setup
- Examine test file organization (collocated vs separate)
- Review 5 test files for patterns (mocking, structure, assertions)
- Look for test utilities, fixtures, factories
- Note any test types (unit, integration, e2e)
- Document commands for running tests
</guidelines>
