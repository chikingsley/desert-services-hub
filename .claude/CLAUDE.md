# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Desert Services Hub is an estimation workflow platform for construction/landscaping services. It handles takeoffs (measurements from PDFs), quoting, contracts, and project management. Currently, only the **Quotes** module is implemented.

## Commands

```bash
# Development
npm run dev          # Start Next.js dev server

# Build & Production
npm run build        # Build for production
npm run start        # Start production server

# Linting & Formatting (Ultracite/Biome)
bun x ultracite fix    # Auto-fix formatting and lint issues
bun x ultracite check  # Check for issues without fixing
npm run lint           # Run ESLint (legacy, prefer ultracite)
```

## Tech Stack

- **Framework**: Next.js 16 with App Router (React 19, Server Components)
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS v4 with tw-animate-css
- **UI Components**: shadcn/ui (new-york style) with Radix primitives
- **Icons**: lucide-react
- **Forms**: react-hook-form + zod
- **Linting/Formatting**: Ultracite (Biome preset)

## Architecture

### Directory Structure
```
app/                    # Next.js App Router pages
  layout.tsx           # Root layout with sidebar
  page.tsx             # Dashboard
  quotes/              # Quotes module
    page.tsx           # List quotes (Server Component)
    new/page.tsx       # Create quote form
    [id]/page.tsx      # Edit quote (QuoteEditor)

components/
  ui/                  # shadcn/ui primitives
  quotes/              # Quote-specific components
  app-sidebar.tsx      # Main navigation sidebar
  page-header.tsx      # Page header with breadcrumbs

lib/
  types.ts             # TypeScript interfaces for domain models
  utils.ts             # Utilities: cn(), formatCurrency(), formatDate()
  supabase/
    client.ts          # Browser Supabase client
    server.ts          # Server-side Supabase client (uses cookies)

hooks/                 # Custom React hooks
scripts/               # SQL migrations for Supabase
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

### Supabase Integration

- Server Components use `lib/supabase/server.ts` (async, reads cookies)
- Client Components use `lib/supabase/client.ts` (browser client)
- Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Code Standards (Ultracite)

This project uses Ultracite, a zero-config Biome preset. Run `bun x ultracite fix` before committing.

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
