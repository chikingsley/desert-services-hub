# CGP Scrape

A Playwright-based scraper for the ADEQ AZPDES (Arizona Pollutant Discharge Elimination System) Construction Stormwater General Permit Database.

**Target URL**: https://legacy.azdeq.gov/databases/azpdessearch_drupal.html

## ⚠️ Cloudflare Protection

The ADEQ CGI script (`/cgi-bin/databases/azpdes.pl`) is protected by **Cloudflare Turnstile**. This means:

1. **Headless scraping will fail** - Cloudflare will detect automated browsers and present a CAPTCHA
2. **Interactive mode required** - You must run in non-headless mode and manually solve the CAPTCHA
3. **Session persistence may help** - Once you solve the CAPTCHA, the session might work for subsequent requests

## Project Structure

```
cgp-scrape/
├── src/
│   ├── browser.ts      # Browser lifecycle management
│   ├── search.ts       # Search form filling and submission
│   ├── results.ts      # Results page parsing and extraction
│   ├── scrape.ts       # Main orchestrator
│   ├── selectors.ts    # Type-safe CSS selectors
│   └── types.ts        # TypeScript type definitions
├── tests/
│   ├── browser.test.ts   # Browser management tests
│   ├── search.test.ts    # Search form tests
│   ├── results.test.ts   # Results extraction tests
│   ├── scrape.test.ts    # Full flow tests
│   ├── selectors.test.ts # Selector validation tests
│   └── timeouts.ts       # Test timeout constants
├── scripts/
│   ├── debug-results.ts      # Save results page HTML for debugging
│   └── interactive-scrape.ts # Interactive scrape with manual CAPTCHA solve
├── package.json
├── tsconfig.json
└── biome.jsonc
```

## Scripts

```bash
# Run tests
bun test

# Run specific test file
bun test tests/browser.test.ts

# Interactive scrape (non-headless, for CAPTCHA solving)
bun run scrape:interactive

# Debug - save results page HTML
bun run debug

# Type checking
bun run typecheck

# Linting
bun run lint
bun run lint:fix
```

## Usage

### Programmatic Usage

```typescript
import { scrape, scrapeMaricopaGeneral } from './src/scrape';

// Scrape with custom criteria
const result = await scrape({
  applicationType: 'General Construction',
  county: 'Maricopa',
  startDate: '01/01/2024',
}, {
  headless: false, // Required for CAPTCHA
  maxPages: 10,
});

console.log(result.permits); // PermitRecord[]

// Convenience function for Maricopa General Construction
const result = await scrapeMaricopaGeneral({
  headless: false,
  startDate: '01/01/2024',
});
```

### Search Criteria

```typescript
interface SearchCriteria {
  applicationType?: 'General Construction' | 'Waiver Construction';
  azpdesNumber?: string;
  businessName?: string;
  projectSiteName?: string;
  siteCity?: string;
  siteZip?: string;
  county?: County; // 'Maricopa', 'Pima', 'Pinal', etc.
  startDate?: string; // mm/dd/yyyy format
  endDate?: string;   // mm/dd/yyyy format
}
```

### Permit Record

```typescript
interface PermitRecord {
  azpdesNumber: string;
  operatorBusinessName: string;
  projectSiteName: string;
  applicationStatus: string;
  receivedDate: string;
}
```

## Test-Driven Development

This project follows TDD principles. Each step of the scrape workflow has its own test:

1. **Browser tests** - Create browser, navigate to page, close browser
2. **Selector tests** - Validate all CSS selectors against live page
3. **Search tests** - Fill form, clear form, submit form
4. **Results tests** - Detect page, check pagination, extract permits
5. **Scrape tests** - Full end-to-end flow

## Known Issues

1. **Cloudflare blocking** - The CGI script is behind Cloudflare Turnstile
2. **Results extraction** - Table structure needs refinement based on actual results page HTML
3. **Pagination** - Pagination selectors need validation against real paginated results

## Future Improvements

- [ ] Persistent browser context for session reuse
- [ ] Cookie export/import for authenticated sessions
- [ ] Rate limiting and polite scraping
- [ ] Database storage for scraped permits
- [ ] Scheduled scraping with n8n integration
