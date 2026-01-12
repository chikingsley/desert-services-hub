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
- **Database**: SQLite via better-sqlite3 (`lib/db/index.ts`)
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
