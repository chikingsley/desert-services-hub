# Playwright Patterns Reference

Preferred patterns for browser automation in this codebase.

## Test File Structure

**Required imports:**

```typescript
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

// Flow-specific imports from portal modules
import { someFlow } from "@/portal/[flow]";
```

**Do NOT import directly in tests:**

```typescript
// These are abstracted by PortalHarness - don't import them
import { createBrowser, closeBrowser } from "@/portal/utils/browser";
import { login } from "@/portal/utils/login";
import { navigateToMyDustApps } from "@/portal/utils/helpers";
import { waitForElement } from "@/portal/utils/helpers";
import { selectors } from "@/portal/utils/selectors";
```

## Test Structure with PortalHarness

**Preferred:** Use `PortalHarness` with `beforeAll/afterAll`

```typescript
const harness = new PortalHarness();

describe("Flow", () => {
  afterAll(async () => {
    await harness.teardown();
  });

  test("1. login", async () => {
    await harness.setup();
    expect(harness.currentState).toBe("logged_in");
  }, TIMEOUTS.standard);

  test("2. navigate to dust apps", async () => {
    const success = await harness.navigateToDustApps();
    expect(success).toBe(true);
    expect(harness.currentState).toBe("dust_apps");
  }, TIMEOUTS.quick);

  test("3. navigate to search", async () => {
    const success = await harness.navigateToSearch();
    expect(success).toBe(true);
    expect(harness.currentState).toBe("dust_search");
  }, TIMEOUTS.quick);

  test("4. run flow", async () => {
    const result = await someFlow(harness.page);
    expect(result.success).toBe(true);
  }, TIMEOUTS.complex);
});
```

**Avoid:** `beforeEach/afterEach` - creates new browser per test (slow)

## TIMEOUTS Constants

Always use named constants from `./utils/timeouts`:

```typescript
TIMEOUTS.quick     // 30s  - login, simple navigation
TIMEOUTS.standard  // 60s  - single page workflows
TIMEOUTS.complex   // 120s - multi-step workflows, popups
TIMEOUTS.extended  // 300s - batch processing, scraping loops
TIMEOUTS.flow      // 360s - complete end-to-end flows
```

**Avoid:** Magic numbers like `60_000`, `120_000`

## Navigation Verification

**In tests:** Use `harness.currentState`

```typescript
await harness.navigateToDustApps();
expect(harness.currentState).toBe("dust_apps");
```

**In portal functions:** Use `waitForURL()` or `waitFor({ state: "visible" })`

```typescript
// Wait for URL pattern
await page.waitForURL(/dustApplicationDetail/);

// Wait for element to appear
await page.locator(selectors.dustApps.draftSection).waitFor({ state: "visible" });
```

## What Tests Should Verify

Tests verify **result objects** from portal functions, not individual UI elements:

```typescript
// GOOD - verify the result object
const result = await closePermitFlow(page);
expect(result.success).toBe(true);
expect(result.formState.reasonFilled).toBe(true);

// AVOID - manually checking UI state in test
const isChecked = await page.locator("...").isChecked();
expect(isChecked).toBe(true);
```

Portal functions should return state objects that tests can verify.

## Popup Handling

When a flow opens a popup window:

```typescript
import type { Page } from "playwright";

const harness = new PortalHarness();
let popupPage: Page | undefined;

describe("Flow with Popup", () => {
  afterAll(async () => {
    // Clean up popup before teardown
    if (popupPage && !popupPage.isClosed()) {
      await popupPage.close().catch(() => {});
    }
    await harness.teardown();
  });

  test("open popup", async () => {
    popupPage = await clickSomeButton(harness.page, harness.context);
    expect(popupPage).toBeDefined();
  }, TIMEOUTS.complex);

  test("interact with popup", async () => {
    if (!popupPage) return;
    const result = await fillPopupForm(popupPage);
    expect(result.success).toBe(true);
  }, TIMEOUTS.standard);
});
```

## Clicking Elements

**Preferred:**

```typescript
await page.locator('selector').first().click();
await page.locator('a:has(img[alt="Submit"])').click();  // anchor containing img
```

**Avoid:**

```typescript
// DOM clicks don't integrate with Playwright's navigation tracking
await page.evaluate(() => document.querySelector('a').click());
```

## Waiting for Elements

**Preferred:**

```typescript
await page.locator('selector').waitFor({ state: "visible" });
```

**Avoid:**

```typescript
// Custom polling loops with arbitrary timeouts
for (let i = 0; i < 10; i++) {
  if (await page.locator('x').count() > 0) break;
  await sleep(1000);
}
```

## Waiting for Navigation

**Preferred:**

```typescript
await page.waitForURL(/dustApplicationDetail/);  // regex match
await page.waitForURL(url => url.includes('detail'));  // function
```

**Avoid:**

```typescript
// Polling URL changes
const startUrl = page.url();
while (page.url() === startUrl) await sleep(500);
```

## Filling Forms

**Preferred:**

```typescript
await fillText(ctx, selector, value);  // uses SETTLE_MS internally
```

Or native:

```typescript
await page.locator('input').fill('value');
```

## When sleep() IS Appropriate

1. **Lazy loading** - scrolling to trigger content load
2. **ADF partial updates** - Oracle ADF doesn't always trigger navigation events

```typescript
// Scrolling for lazy load - sleep is necessary
await page.evaluate((pos) => window.scrollTo(0, pos), scrollPos);
await sleep(SETTLE_MS);
```

## Common Selectors

**Click anchor containing image:**
```typescript
'a:has(img[alt="Submit"])'
```

**Click anchor with text:**
```typescript
'a:has-text("My Dust Control Applications")'
```

**Match exact text:**
```typescript
'text="Exact Text"'
```

**Regex text match (e.g., permit IDs like D0063581):**
```typescript
'a:text-matches("^D\\d{7}$")'
```

**ID contains partial string:**
```typescript
'[id*="siTable:12"]'
```
