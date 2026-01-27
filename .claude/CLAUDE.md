# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Desert Services Hub is an estimation workflow platform for construction/landscaping services. It handles takeoffs (measurements from PDFs), quoting, contracts, and project management. Currently, the **Quotes** and **Takeoffs** modules are implemented.

## Commands

```bash
# Development
bun run dev          # Start Next.js dev server

# Build & Production
bun run build        # Build for production
bun run start        # Start production server

# Linting & Formatting (Ultracite/Biome)
bun x ultracite fix    # Auto-fix formatting and lint issues
bun x ultracite check  # Check for issues without fixing
```

## Tech Stack

- **Framework**: Next.js 16 with App Router (React 19, Server Components)
- **Database**: SQLite via `bun:sqlite` (`lib/db/index.ts`)
- **Styling**: Tailwind CSS v4 with tw-animate-css
- **UI Components**: shadcn/ui (new-york style) with Radix primitives
- **Icons**: lucide-react
- **PDF**: pdfjs-dist v5 for viewing, pdf-lib for export
- **Linting/Formatting**: Ultracite (Biome preset)

## Architecture

### Directory Structure

```text
app/                    # Next.js App Router pages
  layout.tsx           # Root layout with sidebar
  page.tsx             # Dashboard
  quotes/              # Quotes module
    page.tsx           # List quotes
    new/page.tsx       # Create quote
    [id]/page.tsx      # Edit quote
  takeoffs/            # Takeoffs module (PDF measurement)
    page.tsx           # List takeoffs
    new/page.tsx       # Upload new PDF
    [id]/page.tsx      # Takeoff editor
  catalog/             # Service catalog management
  api/                 # API routes (SQLite-backed)

components/
  ui/                  # shadcn/ui primitives
  quotes/              # Quote-specific components
  takeoffs/            # Takeoff-specific components
  catalog/             # Catalog components
  app-sidebar.tsx      # Main navigation sidebar
  page-header.tsx      # Page header with breadcrumbs

lib/
  db/index.ts          # SQLite database connection and schema
  types.ts             # TypeScript interfaces for domain models
  utils.ts             # Utilities: cn(), formatCurrency(), formatDate()
  pdf-takeoff/         # PDF annotation library
  takeoffs.ts          # Takeoff API client functions

hooks/                 # Custom React hooks
```

### Data Model

The quote system uses a versioned structure:

- **Quote** → base document (job info, client info, status)
- **QuoteVersion** → iteration of line items (supports revisions)
- **QuoteSection** → groups line items (optional)
- **QuoteLineItem** → individual priced items (qty, unit, cost, price)
- **CatalogItem** → reusable pricing templates

Key relationships:

- Quote has many QuoteVersions (one marked `is_current`)
- QuoteVersion has many QuoteSections and QuoteLineItems
- Line items can belong to a section or be "unsectioned"

### Database (SQLite)

- All data stored in `desert-services.db` at project root
- Schema defined in `lib/db/index.ts`
- API routes in `app/api/` use the db directly
- Client components use fetch to API routes

## Code Standards (Ultracite)

This project uses Ultracite, a zero-config Biome preset. Run `bun x ultracite fix` before committing.

**IMPORTANT: Never add lint suppression comments** (`// biome-ignore`, `// eslint-disable`, `// @ts-ignore`, `// @ts-expect-error`, etc.) without explicitly asking the user first. If a lint rule is flagging code, either fix the underlying issue or ask the user how they want to handle it. Do not silently suppress warnings.

Key rules:

- Use `for...of` over `.forEach()` and indexed loops
- Use `const` by default, `let` only when needed, never `var`
- Use optional chaining (`?.`) and nullish coalescing (`??`)
- Use Next.js `<Image>` component for images
- Use Server Components for async data fetching
- React 19: Use ref as prop instead of `React.forwardRef`
- Remove `console.log` and `debugger` from production code

## Path Aliases

Configured in `tsconfig.json`:

- `@/*` → project root (e.g., `@/components/ui/button`)

# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `bun x ultracite fix`
- **Check for issues**: `bun x ultracite check`
- **Diagnose setup**: `bun x ultracite doctor`

Biome (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**

- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**

- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**

- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Biome Can't Help

Biome's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Biome. Run `bun x ultracite fix` before committing to ensure compliance.
