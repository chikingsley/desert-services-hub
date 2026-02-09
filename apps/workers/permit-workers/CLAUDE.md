# Quick Actions - Dust Permit CLI

Common natural language commands and their CLI equivalents:

| User Says | CLI Command |
|-----------|-------------|
| "Download PDF D0061391" | `bun src/cli.ts scrape D0061391 --pdf` |
| "Download permit to root" | `bun src/cli.ts scrape D0061391 --pdf --output .` |
| "Close permit D0056240" | `bun src/cli.ts close D0056240` |
| "Renew permit D0058823" | `bun src/cli.ts renew D0058823 --company "Company Name"` |
| "Find permit for ABC Corp" | `sqlite3 src/db/company-permits.sqlite "SELECT * FROM permits WHERE company_name LIKE '%ABC%'"` |

**PDF Output Locations:**
- Default: `tests/output/pdfs/D0XXXXXX.pdf`
- Custom: Use `--output /path/to/dir`

**Portal URL:** <https://dm.maricopa.gov/> (requires login via browser automation)

**CRITICAL - Acreage Validation:**
- NO permit in the entire 50,000+ permits database has null or zero acres
- If you see "0.0 Acres" or null acreage, the polygon drawing is WRONG
- Every valid permit has a non-zero disturbed acreage value
- This is a key validation point for renewal/map drawing tests

**ESRI Map Drawing:** See `docs/ESRI-MAP-DRAWING-GUIDE.md` for the complete guide on:
- Why simple `.click()` doesn't work on dojo/dijit widgets (need full mouse event sequence)
- Map container offset (template picker takes ~410px on left side of iframe)
- How to properly select templates and draw polygons
- REST API for querying original permit coordinates
- All the debugging steps and failures that led to the working solution

---

# Bun Runtime

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

### Page 4 State Evaluator (E2E)

- `tests/e2e/utils/page4-state/index.ts` uses a Bun-built browser evaluator module.
- Runtime `new Function` is intentionally not used.
- Bench logging is opt-in:
  - `PAGE4_STATE_BENCH=1`
  - `PAGE4_STATE_BENCH_ITERATIONS=<n>` (default `8`)
- Example:
  - `PAGE4_STATE_BENCH=1 PAGE4_STATE_BENCH_ITERATIONS=20 bun test --max-concurrency 1 tests/e2e/create-fresh.test.ts`

### Test Principles

- **Tests verify, they don't fix.** Tests should only check behavior, never retry or work around failures. If something fails, the test fails - no `page.reload()` and retry, no silent early returns, no "helping the test pass."
- If the portal is slow, add wait time *before* actions (expect slowness), not retry *after* failures.

````ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});

```text

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})

```text

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>

```text

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";

// import .css files directly and it works
import './index.css';

import { createRoot } from "react-dom/client";

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);

```text

Then, run index.ts

```sh
bun --hot ./index.ts

```text

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.

- -

## Google Gemini SDK

Use `@google/genai` for Gemini API calls. Don't use the deprecated `@google/generative-ai`.

### Available Models

- `gemini-3-flash-preview` - Latest preview model (fast, frontier-class)
- `gemini-2.5-flash` - Stable production model
- `gemini-2.5-flash-lite` - Fast, cost-effective model

### Large PDF Handling (File API)

For PDFs over ~20MB, upload to File API first, then reference by URI:

```typescript
import {
  GoogleGenAI,
  createPartFromUri,
  createUserContent,
} from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 1. Upload file
const uploadedFile = await ai.files.upload({
  file: pdfPath,
  config: { mimeType: "application/pdf" },
});

// 2. Use in generateContent
const response = await ai.models.generateContent({
  model: "gemini-3-flash-preview",
  contents: createUserContent([
    createPartFromUri(uploadedFile.uri!, uploadedFile.mimeType!),
    "Your prompt here",
  ]),
  config: { responseMimeType: "application/json" },
});

// 3. Cleanup
await ai.files.delete({ name: uploadedFile.name! });

```text

- -

## Headless Overrides

- Defaults and per-script settings live in `src/portal/utils/config.ts`.
- Per-run overrides for scripts: `--headless` or `--headed`.
- Global override: set `HEADLESS=true|false` in the environment.

---

## Portal Automation Patterns

**IMPORTANT:** Don't reinvent. Use the existing helpers in `src/portal/utils/helpers.ts`.

### Clicking Buttons in ADF Popups

ADF popups use iframes. Never click directly on a frame - use `clickInFrames()`:

```typescript
import { clickInFrames } from "@/portal/utils/helpers";

// WRONG - clicking on one frame
await createFrame.locator('a[id*="someButton"]').click();

// RIGHT - searches all frames
const clicked = await clickInFrames(popupPage, portal.somePopup.buttonSelector);
if (!clicked) {
  throw new Error("Button not found");
}
```

### ADF Confirmation Popup Pattern (CRITICAL)

**For yes/no confirmation popups (Delete, Close, Create, etc.), clicking the action button alone does NOT dismiss the popup.** The action registers on the server, but the popup stays open. You MUST click Cancel after the action button to dismiss the popup and allow the action to complete.

```typescript
// WRONG - action button alone doesn't dismiss popup
await clickInFrames(popup, portal.deletePopup.confirmDeleteBtn);
await sleep(2000);
// Popup is still open, action may not complete properly

// RIGHT - click action, then click Cancel to dismiss
await clickInFrames(popup, portal.deletePopup.confirmDeleteBtn);
await sleep(1000);  // Wait for server to process
await clickInFrames(popup, portal.deletePopup.cancelBtn);  // Dismiss popup
await sleep(1000);
// Now the action completes and page updates
```

This pattern is used consistently in:
- `src/portal/delete.ts` - `deleteApplication()`
- `src/portal/close.ts` - `confirmClosePermit()`

**Why this happens:** The Maricopa portal uses Oracle ADF Faces 10g, which has quirky popup/dialog behavior. The action button triggers the server-side operation, but the dialog doesn't auto-dismiss. Clicking Cancel manually closes the popup, allowing the PPR (Partial Page Rendering) cycle to complete.

### Map/Site Drawing Popup (EXCEPTION to above pattern)

The Site Drawing confirmation popup ("Copy site drawing from D0XXXXXX") is DIFFERENT from Delete/Close popups:

1. Clicking Create opens a **NEW popup window** containing the map
2. The original confirmation popup stays open - DO NOT close it immediately
3. Closing the confirmation popup **invalidates the map popup** (ADF links them)
4. Close popups during cleanup, in order: map popup first, then confirmation popup

```typescript
// Wait for Create to open new map popup
const mapPopupPromise = context.waitForEvent("page", { timeout: 10000 });
await clickInFrames(confirmPopup, portal.siteDrawingPopup.createBtn);
const mapPopup = await mapPopupPromise;

// Work with the map...

// Cleanup (close map first, then confirmation)
await mapPopup.close();
await confirmPopup.close();
```

### After Clicking, VERIFY State Changed

Never just sleep and hope. Always verify something changed:

```typescript
// WRONG - blind wait
await button.click();
await sleep(5000);

// RIGHT - verify state changed
await button.click();
const changed = await waitForSomethingSpecific(page);
if (!changed) {
  // Take screenshot, dump HTML, debug
}
```

### Click Retry Pattern (for stubborn ADF buttons)

From `clickApplicationWithRetry` - try multiple strategies:

```typescript
const strategies = [
  { name: "force", fn: () => locator.click({ force: true }) },
  { name: "standard", fn: () => locator.click() },
  { name: "evaluate", fn: () => locator.evaluate(el => el.click()) },
  { name: "dispatchEvent", fn: () => locator.dispatchEvent("click") },
];

for (const strategy of strategies) {
  await strategy.fn();
  await sleep(1500);
  if (await hasStateChanged()) {
    break;
  }
}
```

### Form Helpers (use these, don't write your own)

```typescript
import {
  fillText,           // Fill text field
  fillTextSafe,       // Fill with timeout (returns bool)
  clickRadio,         // Click radio button
  setCheckbox,        // Set checkbox state (checks current state first)
  clickInFrames,      // Click searching all frames
  findFrameWithSelector,  // Find frame containing element
  waitForFrameElement,    // Wait for element in any frame
  waitForPopup,           // Wait for new popup window
} from "@/portal/utils/helpers";
```

### Polling Pattern for State Changes

```typescript
async function waitForMapReady(frame: Frame, maxWaitMs = 60000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const status = await frame.evaluate(() => ({
      hasCanvas: !!document.querySelector("#map_container canvas"),
      hasWidget: !!document.querySelector("#esri_dijit_Search_0_input"),
    }));

    console.log(`  canvas=${status.hasCanvas}, widget=${status.hasWidget}`);

    if (status.hasCanvas && status.hasWidget) {
      return true;
    }
    await sleep(2000);
  }
  return false;
}
```

### Debug Pattern: Screenshot + HTML Dump

When something fails, ALWAYS capture state:

```typescript
// Take screenshot
await page.screenshot({ path: "tests/e2e/screenshots/DEBUG-failure.png" });

// Dump HTML
const html = await page.content();
await fs.promises.writeFile("tests/e2e/screenshots/DEBUG-failure.html", html);

// Log all frame URLs
for (const frame of page.frames()) {
  const url = await frame.evaluate(() => window.location.href).catch(() => "(inaccessible)");
  console.log(`Frame: ${url}`);
}
```

### Selectors Must Be Defined in portal.ts

Don't hardcode selectors in tests. Add them to `src/portal/utils/selectors/portal.ts`:

```typescript
// In portal.ts
export const siteDrawingPopup = {
  copyCheckbox: '[id="newRevisionSiteDrawing:_idJsp12"]',
  createBtn: '[id="newRevisionSiteDrawing:createNewRevisionSiteDrawing"]',
  cancelBtn: '[id="newRevisionSiteDrawing:cancelNewRevisionSiteDrawing"]',
} as const;
```

Then import and use:
```typescript
import { portal } from "@/portal/utils/selectors";
await clickInFrames(popup, portal.siteDrawingPopup.createBtn);
```

---

## Portal Workflows

### New Application Flow

1. Click "New Application" button
2. Popup opens → select company → click Continue
3. Select copy-from app → click Create
4. Application created → lands on Page 1

**No site drawing confirmation popup** - map opens directly.

### Revision Flow

1. Click "New Application" button
2. Popup opens → check "Application Revision" → select app to revise → fill purpose → click Create
3. Application created → lands on Page 1
4. Navigate to Page 2 → click "Add Site Drawing"
5. **CONFIRMATION POPUP appears** with:
   - Checkbox: "Copy site drawing from [permit]"
   - Create button
   - Cancel button
6. Check the checkbox → click Create → map opens with copied data

**The confirmation popup is DIFFERENT from the new app popup.** Different selectors, different flow.

### Map Popup Flow (after confirmation)

1. ESRI iframe loads at `gis.maricopa.gov/aqd/impact/dust?recordId=...`
2. Wait for map to be ready (canvas + widgets loaded)
3. Editor widget available at `dijit.registry.byId("esri_dijit_editing_Editor_0")`
4. Can search, switch basemap, draw polygons, read features

---

## Naming Conventions

This project follows these naming conventions:

| Element | Convention | Example |
|---------|------------|---------|
| Functions | camelCase | `verifyNotionSignature()`, `processPermitRequest()` |
| Variables | camelCase | `pageId`, `webhookBody`, `pipelineResult` |
| Constants | SCREAMING_SNAKE_CASE | `DUST_PERMIT_CONFIG`, `COMPLETED_COOLDOWN_MS` |
| Types/Interfaces | PascalCase | `NotionWebhook`, `ProgressState`, `SessionResult` |
| Files | kebab-case | `notion-types.ts`, `progress-tracker.ts` |
| Directories | kebab-case | `new-application/`, `form-filling/` |

### External API Conventions

- **Notion API**: Uses `snake_case` for properties (e.g., `verification_token`, `workspace_id`). Match their conventions in type definitions.
- **Elysia/OpenAPI**: Standard TypeScript conventions
- **Maricopa County Portal**: ADF forms use `#ThePage:siTable:N:sioTable:M:siForm:...` selector patterns

---

## Type-Safe Form Selectors

The form selector system uses **TypeScript mapped types** to automatically derive a `SelectorMap` from the `FormData` interface. This ensures selectors stay in sync with form fields at compile time.

### Architecture

**Three components working together:**

1. **SelectorFor<T> Mapped Type** (`src/form-data.ts`)
   - Auto-generates selector structure from FormData
   - Handles three field types:
     - `ControlMeasure` fields (`"Primary" | "Contingency" | "None"`) → `Record<ControlMeasure, string>`
     - Simple fields (string, boolean, number) → single selector string
     - Nested objects → recursive mapping

2. **SelectorMap Type** (exported from `types.ts`)
   - `type SelectorMap = SelectorFor<FormData>`
   - Auto-generated, never manually maintained
   - Always matches FormData structure exactly

3. **SELECTORS Object** (`src/portal/utils/selectors.ts`)
   - Implements `SelectorMap` type
   - Structured to match FormData hierarchy:
     ```typescript
     export const SELECTORS: SelectorMap = {
       permitContact: { email: '...', name: '...', phone: '...' },
       categoryC: {
         c1: {
           preWater: {
             Primary: '...',
             Contingency: '...',
             None: '...'
           }
         }
       }
       // ... more categories
     };
     ```

### How Type Safety Works

TypeScript compiler enforces:

```typescript
// ✅ Valid - field exists in FormData and SelectorMap
await fillText(page, selectors.categoryC.c1.preWater.Primary, value);

// ❌ Error - field doesn't exist in FormData
await fillText(page, selectors.categoryC.invalidField, value);

// ❌ Error - selector missing from SELECTORS object
// Add new field to FormData? TypeScript won't compile until you add selector
```

### Adding New Fields

When adding a new form field:

1. Add to `FormData` interface in `types.ts`
2. TypeScript immediately reports missing selector in `SELECTORS`
3. Add selector to `SELECTORS` object
4. Code compiles - field is now available throughout codebase

**Before this pattern**: Had to manually maintain 4-6 files per field (FormData, selectors, test-data, portal functions). **After**: 2 files (types.ts, selectors.ts).

### Benefits

| Before | After |
|--------|-------|
| Selectors can drift from FormData | Impossible - SelectorMap derives from FormData |
| ~20 minutes to add a field | ~5 minutes to add a field |
| Manual SelectorMap definition | Auto-generated from FormData |
| No compile-time validation | TypeScript validates all field paths |

---

## Maricopa County Portal - Selector Discovery

ADF Oracle forms use dynamic `sioTable` indices that may not match documentation. When adding new selectors, use this debug pattern to discover actual element IDs on the page.

### Debug Pattern for Finding Selectors

Use `page.evaluate()` to scan the DOM for elements matching specific patterns:

```typescript
// Find all text/textarea inputs in a specific siTable section
// Replace XX with the siTable number (e.g., 21 for B.1, 22 for B.2)
const inputs = await page.evaluate(() => {
  const inputs: string[] = [];
  const elements = document.querySelectorAll(
    '[id*="siTable:XX:sioTable"][id*="siForm:text"], ' +
    '[id*="siTable:XX:sioTable"][id*="siForm:textarea"]'
  );
  for (const el of elements) {
    inputs.push(el.id);
  }
  return inputs;
});
console.log("[DEBUG] Text inputs found:", inputs);
```

### Finding Radio Buttons

```typescript
// Find all radio buttons in a section
const radios = await page.evaluate(() => {
  const radios: string[] = [];
  const elements = document.querySelectorAll(
    '[id*="siTable:XX:sioTable"][id*="siForm:radio"]'
  );
  for (const el of elements) {
    radios.push(el.id);
  }
  return radios;
});
console.log("[DEBUG] Radios found:", radios);
```

### Finding Checkboxes

```typescript
// Find all checkboxes in a section
const checkboxes = await page.evaluate(() => {
  const checkboxes: string[] = [];
  const elements = document.querySelectorAll(
    '[id*="siTable:XX:sioTable"][id*="siForm:check"]'
  );
  for (const el of elements) {
    checkboxes.push(el.id);
  }
  return checkboxes;
});
console.log("[DEBUG] Checkboxes found:", checkboxes);
```

### Finding Select Dropdowns

```typescript
// Find all select elements in a section
const selects = await page.evaluate(() => {
  const selects: string[] = [];
  const elements = document.querySelectorAll(
    '[id*="siTable:XX:sioTable"][id*="siForm:select"]'
  );
  for (const el of elements) {
    selects.push(el.id);
  }
  return selects;
});
console.log("[DEBUG] Selects found:", selects);
```

### siTable Section Numbers

| Section | siTable Number |
|---------|----------------|
| Category A (Wind-Blown) | 19 |
| Category B.1 (Staging) | 21 |
| Category B.2 (Access Roads) | 22 |
| Category C.1-C.4 (Disturbed Surface) | 24-27 |
| Category D.1-D.5 (Bulk Material) | 29-33 |
| Category E.1 (Trackout Control) | 35 |
| Category E.2 (Spillage Cleaning) | 36 |
| Category F.1 (Mass Grading) | 38 |
| Category F.2 (Fine Grading) | 39 |
| Category G.1 (Underground) | 41 |
| Category G.2 (Vertical) | 42 |
| Category H (Demolition) | 44 |
| Category I (Weed Abatement) | 46 |
| Category J (Blasting) | 48 |
| Category K (Water Supply) | 50-53 |
| Post-K Water Tiers | 54-67 |

### Usage Workflow

1. Add debug logging to scan for elements in the target section
2. Run the test to capture actual element IDs
3. Compare with selectors.ts and fix any mismatched indices
4. Remove debug logging after verification

---

## ESRI ArcGIS 3.x Map Automation

**Full documentation:** `.planning/research/ESRI-MAP-GUIDE.md`

### Quick Reference

| Task | Pattern |
|------|---------|
| Access map | `dijit.registry.byId("esri_dijit_editing_Editor_0")._drawToolbar.map` |
| Read polygons | REST: `FeatureServer/3/query?where=ImpactID='D0XXXXXX'` |
| Access layers | `map._layers[id]` (NOT `map.getLayer()` - throws) |
| Lat/Lng→WebMercator | `x = lng * 20037508.34 / 180` |

### Layer Indices (FeatureServer)

| Index | Type | Content |
|-------|------|---------|
| 0 | Point | Site center |
| 3 | Polygon | Site boundary |
| 4 | Polyline | Access roads |

### Key Gotchas

1. `map.getLayer()` throws - use `map._layers` instead
2. FeatureLayers only load features in current extent - use REST API
3. Template IDs are dynamic - select by label text, not ID
4. Closing confirmation popup kills map popup (ADF links them)
5. `map.graphics.add()` is temporary - use Editor for persistence

### Reference Files

| File | Purpose |
|------|---------|
| `.planning/research/ESRI-MAP-GUIDE.md` | Complete reference guide |
| `.planning/phases/02-drawing-engine/SPIKE-RESULTS.md` | Drawing spike results |
| `tests/e2e/map-read-features-spike.test.ts` | Reading features spike |
| `tests/e2e/map-drawing-spike.test.ts` | Drawing features spike |
| `tests/e2e/map-full-workflow.test.ts` | End-to-end workflow |

---

## Maricopa County FeatureServer API

The FeatureServer is a **public REST API** hosted by Maricopa County that stores the **map geometry** for all dust permits. It contains the polygon shapes (disturbed areas), point locations (access points), and polylines (access roads) - but **NOT** permit metadata like addresses, APNs, or contact info.

### Base URL

```yaml
https://gis.maricopa.gov/arcgis/rest/services/AQD/DustControl/FeatureServer
```

No authentication required. Public access.

### What It Stores vs. What It Doesn't

| FeatureServer HAS | FeatureServer DOES NOT HAVE |
|-------------------|----------------------------|
| Polygon coordinates (disturbed area boundaries) | Address |
| Point coordinates (access points, site center) | APN / Parcel number |
| Polyline coordinates (access roads) | City / State / Zip |
| Area in square meters (`Shape__Area`) | Project name |
| Perimeter in meters (`Shape__Length`) | Contact information |
| Permit ID for lookup (`ImpactID`) | Company name |
| OBJECTID (internal database ID) | Any permit details |

**Key insight:** The FeatureServer is purely geometric data. All permit metadata (location info, contacts, project details) lives only in the portal database and must be scraped from the web UI.

### Layer Indices

| Layer | Type | Content | Use Case |
|-------|------|---------|----------|
| 0 | Point | Access points, site center markers | Copy access point locations |
| 1 | Point | (unused in observed permits) | - |
| 2 | Point | (unused in observed permits) | - |
| 3 | Polygon | **Disturbed areas, site boundaries** | Primary layer for renewals |
| 4 | Polyline | Access roads, linear projects | Copy road paths |
| 5 | Polygon | (unused in observed permits) | - |

### Query Parameters

```text
/[layer]/query?where=[condition]&outFields=[fields]&returnGeometry=[bool]&f=json
```

| Parameter | Description | Example |
|-----------|-------------|---------|
| `layer` | Layer index (0-5) | `3` for polygons |
| `where` | SQL WHERE clause | `ImpactID='D0064518'` |
| `outFields` | Fields to return | `*` for all, or `ImpactID,Shape__Area` |
| `returnGeometry` | Include coordinates | `true` |
| `returnCountOnly` | Just get count | `true` (for existence check) |
| `f` | Response format | `json` |

### Example: Query Polygon for a Permit

**Request:**
```bash
curl "https://gis.maricopa.gov/arcgis/rest/services/AQD/DustControl/FeatureServer/3/query?where=ImpactID='D0064518'&outFields=*&returnGeometry=true&f=json"
```

**Response:**
```json
{
  "geometryType": "esriGeometryPolygon",
  "spatialReference": { "wkid": 102100 },
  "features": [
    {
      "attributes": {
        "OBJECTID": 2422377,
        "ImpactID": "D0064518",
        "Shape__Area": 8616.11,
        "Shape__Length": 676.04
      },
      "geometry": {
        "rings": [
          [
            [-12514644.03, 3975406.38],
            [-12514441.59, 3975405.78],
            [-12514442.19, 3975481.02],
            ...
          ]
        ]
      }
    }
  ]
}
```

### Coordinate System

The API returns coordinates in **Web Mercator** (EPSG:3857, WKID:102100) - large numbers like `-12514644, 3975406`.

**Convert to lat/lng (WGS84):**
```typescript
function webMercatorToLatLng(x: number, y: number): { lat: number; lng: number } {
  const lng = (x * 180) / 20_037_508.34;
  const lat = (Math.atan(Math.exp((y * Math.PI) / 20_037_508.34)) * 360) / Math.PI - 90;
  return { lat, lng };
}
```

**Convert lat/lng to Web Mercator:**
```typescript
function latLngToWebMercator(lat: number, lng: number): { x: number; y: number } {
  return {
    x: (lng * 20_037_508.34) / 180,
    y: Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * (20_037_508.34 / Math.PI),
  };
}
```

### Example: Check if Permit Has Map Data

**Request:**
```bash
curl "https://gis.maricopa.gov/arcgis/rest/services/AQD/DustControl/FeatureServer/3/query?where=ImpactID='D0064518'&returnCountOnly=true&f=json"
```

**Response:**
```json
{ "count": 1 }
```

### Our Wrapper: `src/lib/dust-features.ts`

We have a TypeScript client that wraps the FeatureServer API:

```typescript
import { queryPermitMapFeatures, permitHasMapData } from "@/lib/dust-features";

// Check if permit has map data
const hasMap = await permitHasMapData("D0064518");  // true/false

// Get all map features for a permit
const mapData = await queryPermitMapFeatures("D0064518");

// mapData contains:
mapData.permitId           // "D0064518"
mapData.disturbedArea      // Main polygon (largest from layer 3)
mapData.polygons           // All polygons
mapData.accessPoints       // Points from layer 0
mapData.points             // All points
mapData.polylines          // All polylines (layer 4)
mapData.centroid           // Center of disturbed area in lat/lng
mapData.acreage            // Calculated from Shape__Area

// Access coordinates
mapData.disturbedArea.coordinates        // Web Mercator [{x, y}, ...]
mapData.disturbedArea.latLngCoordinates  // WGS84 [{lat, lng}, ...]
mapData.disturbedArea.attributes         // {OBJECTID, ImpactID, Shape__Area, ...}
```

### Use Cases

1. **Renewals**: Query original permit's polygon → redraw on renewal application
2. **Validation**: Check if permit has map data before processing
3. **Acreage verification**: Compare calculated acreage vs portal display
4. **Debugging**: Verify polygon coordinates when drawing fails

### Limitations

- **No permit metadata**: Address, APN, contacts must be scraped from portal
- **Geometry only**: Can't get project details, dates, or status
- **No write access**: Read-only API; drawing must go through ESRI Editor widget
- **Extent-dependent in browser**: FeatureLayers only load visible features; use REST API for complete data
````
