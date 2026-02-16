/**
 * Full Map Drawing Workflow Test
 *
 * End-to-end test: address → parcel lookup → navigate → draw → save
 *
 * Run with: HEADLESS=false bun test tests/e2e/map-full-workflow.test.ts
 */

import { afterAll, describe, expect, test } from "bun:test";
import type { Frame, Page } from "playwright";

/**
 * Type guard helper: asserts value is not null and returns narrowed type.
 * Use this instead of non-null assertions after expect().not.toBeNull()
 */
function assertNotNull<T>(
  value: T | null | undefined,
  message?: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message || "Expected value to be non-null");
  }
}

import type { ParcelData } from "@/lib/assessor";
import { queryParcelsByAddress } from "@/lib/assessor";
import {
  createExistingCompanyApplication,
  getCurrentPage,
  goToPage,
} from "@/portal/create";
import { findEsriFrame, openMapPopup } from "@/portal/create/fill/page2/map";
import { deleteByApplicationId } from "@/portal/delete";
import { sleep } from "@/portal/utils/helpers";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

// =============================================================================
// CONFIG
// =============================================================================

const COMPANY_NAME = "Sundt Construction Inc";
const COPY_FROM_APP = process.env.COPY_FROM_APP_NUMBER || "D0062461";
// Note: Only use street address - PHYSICAL_ADDRESS field doesn't include city/state
const TEST_ADDRESS = "4837 N Granite Reef Rd";

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Wait for Editor widget to be fully loaded.
 */
async function waitForEditor(
  frame: Frame,
  maxWaitMs = 60_000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const ready = await frame
      .evaluate(() => {
        const { dijit } = window as unknown as Record<
          string,
          {
            registry?: { byId?: (id: string) => unknown };
          }
        >;
        const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0");
        if (!editor) {
          return false;
        }
        const ed = editor as Record<string, unknown>;
        return !!ed._drawToolbar;
      })
      .catch(() => false);

    if (ready) {
      return true;
    }
    await sleep(1500);
  }
  return false;
}

/**
 * Programmatically pan and zoom the map to specific coordinates.
 * Uses ESRI map.centerAndZoom() which is more reliable than the search box.
 */
async function panToCoordinates(
  frame: Frame,
  lat: number,
  lng: number,
  zoomLevel = 18
): Promise<boolean> {
  console.log(
    `  Panning to coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)} (zoom: ${zoomLevel})`
  );

  const result = await frame
    .evaluate(
      ({ lat, lng, zoom }) => {
        const { dijit } = window as unknown as Record<
          string,
          {
            registry?: { byId?: (id: string) => unknown };
          }
        >;
        const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0");
        if (!editor) {
          return { error: "no editor", success: false };
        }

        const ed = editor as Record<string, unknown>;
        const map = ((ed._drawToolbar as Record<string, unknown>)?.map ||
          (ed.settings as Record<string, unknown>)?.map) as
          | {
              centerAndZoom?: (point: unknown, level: number) => unknown;
              centerAt?: (point: unknown) => unknown;
              setZoom?: (level: number) => unknown;
              spatialReference?: { wkid?: number };
            }
          | undefined;

        if (!map) {
          return { error: "no map", success: false };
        }

        // Convert lat/lng to Web Mercator (EPSG:3857)
        const toWebMercator = (lat: number, lng: number) => ({
          spatialReference: map.spatialReference || { wkid: 102_100 },
          x: (lng * 20_037_508.34) / 180,
          y:
            Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) *
            (20_037_508.34 / Math.PI),
        });

        const point = toWebMercator(lat, lng);

        // Try centerAndZoom first
        if (map.centerAndZoom) {
          map.centerAndZoom(point, zoom);
          return { method: "centerAndZoom", success: true };
        }

        // Fallback to centerAt + setZoom
        if (map.centerAt) {
          map.centerAt(point);
          if (map.setZoom) {
            map.setZoom(zoom);
          }
          return { method: "centerAt+setZoom", success: true };
        }

        return { error: "no center methods", success: false };
      },
      { lat, lng, zoom: zoomLevel }
    )
    .catch((error) => ({ success: false, error: String(error) }));

  if (result.success && "method" in result) {
    console.log(`    ✓ Map panned (${result.method})`);
    await sleep(2000); // Wait for map to render
    return true;
  }

  const errorResult = result as { error?: string };
  console.log(`    ✗ Pan failed: ${errorResult.error}`);
  return false;
}

/**
 * Navigate map to a location using the search box.
 * Must wait for autocomplete dropdown and click an option to actually navigate.
 */
async function navigateToLocation(
  frame: Frame,
  searchText: string
): Promise<boolean> {
  console.log(`  Searching for: ${searchText}`);

  // Type in search box
  const typed = await frame
    .evaluate(
      ({ text }) => {
        const input = document.querySelector(
          "#esri_dijit_Search_0_input"
        ) as HTMLInputElement;
        if (!input) {
          return false;
        }
        input.focus();
        input.value = text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      },
      { text: searchText }
    )
    .catch(() => false);

  if (!typed) {
    console.log("    ✗ Could not find search input");
    return false;
  }

  console.log("    ✓ Typed search text, waiting for autocomplete dropdown...");

  // Wait for autocomplete dropdown to appear (poll for it)
  let dropdownClicked = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(500);

    const result = await frame
      .evaluate(() => {
        // Look for autocomplete/suggestion dropdown items
        // ArcGIS 3.x uses various class patterns for suggestions
        const selectors = [
          ".esri-search__suggestions-list li",
          ".esri-search__suggestion",
          ".searchMenu .suggestionsMenu div",
          ".esriSearch .searchInputGroup .searchMenu div",
          "[class*='suggest'] li",
          "[class*='suggestion']",
          ".dijitMenuItem",
        ];

        for (const sel of selectors) {
          const items = document.querySelectorAll(sel);
          if (items.length > 0) {
            // Click the first suggestion
            const first = items[0] as HTMLElement;
            const text = first.textContent?.trim() || "";
            first.click();
            return {
              clicked: true,
              count: items.length,
              found: true,
              selector: sel,
              text,
            };
          }
        }

        // Also check if there's a visible dropdown container
        const containers = document.querySelectorAll(
          ".esri-search__suggestions, .searchMenu, [class*='suggest']"
        );
        const visibleContainers: string[] = [];
        for (const c of containers) {
          const el = c as HTMLElement;
          if (el.offsetParent !== null && el.children.length > 0) {
            visibleContainers.push(el.className);
          }
        }

        return { clicked: false, found: false, visibleContainers };
      })
      .catch(() => ({ clicked: false, found: false }));

    if (
      result.clicked &&
      "text" in result &&
      "selector" in result &&
      "count" in result
    ) {
      console.log(
        `    ✓ Clicked dropdown: "${result.text}" (${result.selector}, ${result.count} items)`
      );
      dropdownClicked = true;
      break;
    }

    if (attempt === 4) {
      // Log what we see halfway through
      console.log(
        `    ... still waiting (visible containers: ${JSON.stringify((result as { visibleContainers?: string[] }).visibleContainers || [])})`
      );
    }
  }

  if (!dropdownClicked) {
    console.log("    ⚠ No dropdown appeared, trying Enter key as fallback...");
    await frame.evaluate(() => {
      const input = document.querySelector(
        "#esri_dijit_Search_0_input"
      ) as HTMLInputElement;
      if (input) {
        input.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            code: "Enter",
            key: "Enter",
            keyCode: 13,
          })
        );
      }
    });
  }

  // Wait for map to pan/zoom after selection
  await sleep(2500);
  console.log("    ✓ Search completed");
  return dropdownClicked;
}

/**
 * Click a template by its label text (e.g., "Disturbed Area", "Access Point").
 * Template IDs are dynamic, so we find by label instead.
 */
async function selectTemplateByLabel(
  frame: Frame,
  label: string,
  maxAttempts = 5
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await frame
      .evaluate(
        ({ label }) => {
          // Find all template picker items
          const tpicks = document.querySelectorAll("[id^='tpick-surface-']");

          for (const tpick of tpicks) {
            // Check if this template's text contains the label
            const text = tpick.textContent?.trim() || "";
            if (text.toLowerCase().includes(label.toLowerCase())) {
              (tpick as HTMLElement).click();
              return { found: true, id: tpick.id, text };
            }
          }

          // Also try finding by examining the template labels
          const templateLabels = document.querySelectorAll(
            ".templatePicker .dojoxGridCell, .esriTemplatePicker td"
          );
          for (const cell of templateLabels) {
            const text = cell.textContent?.trim() || "";
            if (text.toLowerCase().includes(label.toLowerCase())) {
              (cell as HTMLElement).click();
              return { found: true, id: "cell", text };
            }
          }

          // Debug: list available templates
          const availableTemplates = [...tpicks].map((e) => ({
            id: e.id,
            text: e.textContent?.trim().slice(0, 30),
          }));
          return { availableTemplates, found: false };
        },
        { label }
      )
      .catch(() => ({
        availableTemplates: [] as Array<{ id: string; text: string }>,
        found: false,
      }));

    if (result.found) {
      console.log(
        `    ✓ Clicked template: ${(result as { text: string }).text} (${(result as { id: string }).id})`
      );
      await sleep(500);
      return true;
    }

    if (attempt === 1) {
      const templates = (
        result as { availableTemplates: { id: string; text: string }[] }
      ).availableTemplates;
      console.log(`    Looking for "${label}", available templates:`);
      for (const t of templates) {
        console.log(`      - ${t.id}: ${t.text}`);
      }
    }

    // Wait and retry
    await sleep(1000);
  }

  return false;
}

/**
 * Check if drawing mode is active.
 */
function isDrawingModeActive(frame: Frame): Promise<string> {
  return frame
    .evaluate(() => {
      const { dijit } = window as unknown as Record<
        string,
        {
          registry?: { byId?: (id: string) => unknown };
        }
      >;
      const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0");
      if (!editor) {
        return "no-editor";
      }
      const ed = editor as Record<string, unknown>;
      const toolbar = ed._drawToolbar as Record<string, unknown> | undefined;
      return (toolbar?._geometryType as string) || "none";
    })
    .catch(() => "error");
}

/**
 * Convert lat/lng to screen coordinates.
 */
async function getScreenCoords(
  frame: Frame,
  polygon: { lat: number; lng: number }[]
): Promise<Array<{ x: number; y: number }> | null> {
  const result = await frame
    .evaluate(
      ({ coords }) => {
        const { dijit } = window as unknown as Record<
          string,
          {
            registry?: { byId?: (id: string) => unknown };
          }
        >;
        const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0");
        if (!editor) {
          return null;
        }

        const ed = editor as Record<string, unknown>;
        const map = ((ed._drawToolbar as Record<string, unknown>)?.map ||
          (ed.settings as Record<string, unknown>)?.map) as
          | {
              toScreen?: (p: unknown) => { x: number; y: number };
              spatialReference?: { wkid?: number };
            }
          | undefined;

        if (!map?.toScreen) {
          return null;
        }

        const toWebMercator = (lat: number, lng: number) => ({
          spatialReference: map.spatialReference || { wkid: 102_100 },
          x: (lng * 20_037_508.34) / 180,
          y:
            Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) *
            (20_037_508.34 / Math.PI),
        });

        const screenPoints: { x: number; y: number }[] = [];
        for (const v of coords) {
          const mapPt = toWebMercator(v.lat, v.lng);
          const screen = map.toScreen(mapPt);
          screenPoints.push({ x: screen.x, y: screen.y });
        }
        return screenPoints;
      },
      { coords: polygon }
    )
    .catch(() => null);

  return result;
}

/**
 * Draw a polygon using mouse clicks.
 */
async function drawPolygon(
  page: Page,
  frameBox: { x: number; y: number },
  vertices: { x: number; y: number }[]
): Promise<void> {
  console.log(`  Drawing polygon with ${vertices.length} vertices...`);

  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i];
    if (!v) {
      throw new Error(`Vertex at index ${i} is undefined`);
    }
    const pageX = frameBox.x + v.x;
    const pageY = frameBox.y + v.y;
    console.log(
      `    Vertex ${i + 1}: (${pageX.toFixed(0)}, ${pageY.toFixed(0)})`
    );
    await page.mouse.click(pageX, pageY);
    await sleep(400);
  }

  // Double-click to complete
  const first = vertices[0];
  if (!first) {
    throw new Error("First vertex is undefined");
  }
  await page.mouse.dblclick(frameBox.x + first.x, frameBox.y + first.y);
  await sleep(1000);
  console.log("    ✓ Polygon completed");
}

/**
 * Draw a point (for Access Point).
 */
async function drawPoint(
  page: Page,
  frameBox: { x: number; y: number },
  point: { x: number; y: number }
): Promise<void> {
  const pageX = frameBox.x + point.x;
  const pageY = frameBox.y + point.y;
  console.log(`  Drawing point at (${pageX.toFixed(0)}, ${pageY.toFixed(0)})`);
  await page.mouse.click(pageX, pageY);
  await sleep(1000);
  console.log("    ✓ Point placed");
}

/**
 * Click Save and Close button.
 * Note: The button is an <img alt="Save and Close"> element, not a text button.
 */
async function clickSaveAndClose(page: Page): Promise<boolean> {
  // Primary selector: img with alt="Save and Close"
  const saveImgSelector = 'img[alt="Save and Close"]';

  // Try clicking directly on the page
  const imgBtn = await page.$(saveImgSelector);
  if (imgBtn) {
    await imgBtn.click();
    return true;
  }

  // Try in all frames
  for (const frame of page.frames()) {
    try {
      const frameImgBtn = await frame.$(saveImgSelector);
      if (frameImgBtn) {
        await frameImgBtn.click();
        return true;
      }
    } catch {
      // Continue to next frame
    }
  }

  // Fallback: look for any save-related buttons
  const clicked = await page
    .evaluate(() => {
      // Look for img with Save in alt
      const imgs = document.querySelectorAll('img[alt*="Save"]');
      for (const img of imgs) {
        (img as HTMLElement).click();
        return true;
      }

      // Look for button/input with Save text
      const buttons = document.querySelectorAll(
        "button, input[type='button'], a"
      );
      for (const btn of buttons) {
        const text =
          (btn as HTMLElement).textContent ||
          (btn as HTMLInputElement).value ||
          "";
        if (text.toLowerCase().includes("save")) {
          (btn as HTMLElement).click();
          return true;
        }
      }
      return false;
    })
    .catch(() => false);

  return clicked;
}

/**
 * Get current acreage from the map.
 */
function getAcreage(frame: Frame): Promise<string | null> {
  return frame
    .evaluate(() => {
      const text = document.body.textContent;
      // biome-ignore lint/performance/useTopLevelRegex: Regex evaluated in browser context
      const match = text.match(/(\d+\.?\d*)\s*ac/i);
      return match ? match[0] : null;
    })
    .catch(() => null);
}

// =============================================================================
// TEST
// =============================================================================

const harness = new PortalHarness();
let createdAppId: string | null = null;
let esriFrame: Frame | null = null;
let parcelData: ParcelData | null = null;
let mapPopup: Page | null = null;

describe("Full Map Drawing Workflow", () => {
  afterAll(async () => {
    await harness.teardown();
  });

  // ---------------------------------------------------------------------------
  // STEP 1: Lookup parcel
  // ---------------------------------------------------------------------------
  test(
    "1. lookup parcel by address",
    async () => {
      console.log("\n=== STEP 1: Lookup Parcel ===");
      console.log(`  Address: ${TEST_ADDRESS}`);

      const parcels = await queryParcelsByAddress(TEST_ADDRESS);

      if (parcels.length === 0) {
        console.log("  ✗ No parcels found");
        throw new Error("No parcels found for address");
      }

      const firstParcel = parcels[0];
      if (!firstParcel) {
        throw new Error("First parcel is undefined");
      }
      parcelData = firstParcel;
      console.log("  ✓ Found parcel");
      console.log(`    APN: ${parcelData.apn}`);
      console.log(`    Address: ${parcelData.address}`);
      console.log(`    Acres: ${parcelData.acres}`);
      console.log(`    Polygon vertices: ${parcelData.polygon.length}`);
      console.log(
        `    Centroid: ${parcelData.centroid.lat.toFixed(6)}, ${parcelData.centroid.lng.toFixed(6)}`
      );

      expect(parcelData.polygon.length).toBeGreaterThan(0);
    },
    TIMEOUTS.standard
  );

  // ---------------------------------------------------------------------------
  // STEP 2: Setup - login, create app, open map
  // ---------------------------------------------------------------------------
  test(
    "2. setup: login and open map popup",
    async () => {
      console.log("\n=== STEP 2: Setup ===");

      await harness.setup();
      await harness.navigateToDustApps();

      // Create application
      const result = await createExistingCompanyApplication(
        harness.page,
        harness.context,
        COMPANY_NAME,
        COPY_FROM_APP
      );
      expect(result.success).toBe(true);
      createdAppId = result.applicationId;
      console.log(`  ✓ Created application: ${createdAppId}`);

      // Go to page 2
      await goToPage(harness.page, 2);
      expect(await getCurrentPage(harness.page)).toBe(2);
      console.log("  ✓ On Page 2");

      // Open map popup
      mapPopup = await openMapPopup(harness.page, harness.context);
      expect(mapPopup).not.toBeNull();
      assertNotNull(mapPopup, "mapPopup should not be null");
      console.log("  ✓ Map popup opened");

      // Find ESRI iframe
      esriFrame = await findEsriFrame(mapPopup, 30_000);
      expect(esriFrame).not.toBeNull();
      assertNotNull(esriFrame, "esriFrame should not be null");
      console.log("  ✓ ESRI iframe found");

      // Wait for Editor widget
      console.log("  Waiting for Editor widget...");
      const editorReady = await waitForEditor(esriFrame, 60_000);
      expect(editorReady).toBe(true);
      console.log("  ✓ Editor widget ready");
    },
    TIMEOUTS.extended
  );

  // ---------------------------------------------------------------------------
  // STEP 3: Navigate to parcel location
  // ---------------------------------------------------------------------------
  test(
    "3. navigate to parcel location",
    async () => {
      console.log("\n=== STEP 3: Navigate to Location ===");
      expect(esriFrame).not.toBeNull();
      expect(parcelData).not.toBeNull();
      assertNotNull(esriFrame, "esriFrame should not be null");
      assertNotNull(parcelData, "parcelData should not be null");

      // Use programmatic pan/zoom with parcel centroid (most reliable)
      console.log("  Using programmatic pan to parcel centroid...");
      const panned = await panToCoordinates(
        esriFrame,
        parcelData.centroid.lat,
        parcelData.centroid.lng,
        18 // Zoom level 18 for parcel-level detail
      );

      if (!panned) {
        // Fallback: try search
        console.log("  ⚠ Programmatic pan failed, trying search...");
        const searchAddr =
          parcelData.address?.replaceAll(/\s+/g, " ").trim() || TEST_ADDRESS;
        await navigateToLocation(esriFrame, searchAddr);
      }

      // Close any open dropdowns/menus by clicking on the map
      console.log("  Closing any open dropdowns...");
      await esriFrame?.evaluate(() => {
        // Click on map container to dismiss dropdowns
        const mapContainer = document.querySelector("#map_container");
        if (mapContainer) {
          const event = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
          });
          mapContainer.dispatchEvent(event);
        }
        // Also try clicking the map root
        const mapRoot = document.querySelector("#map_root");
        if (mapRoot) {
          const event = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
          });
          mapRoot.dispatchEvent(event);
        }
      });
      await sleep(500);

      // Take screenshot
      await mapPopup?.screenshot({
        path: "tests/e2e/screenshots/full-workflow-1-navigated.png",
      });
      console.log("  Screenshot: full-workflow-1-navigated.png");
    },
    TIMEOUTS.standard
  );

  // ---------------------------------------------------------------------------
  // STEP 4: Draw Disturbed Area (parcel polygon)
  // ---------------------------------------------------------------------------
  test(
    "4. draw Disturbed Area polygon",
    async () => {
      console.log("\n=== STEP 4: Draw Disturbed Area ===");
      expect(esriFrame).not.toBeNull();
      expect(parcelData).not.toBeNull();
      assertNotNull(esriFrame, "esriFrame should not be null");
      assertNotNull(parcelData, "parcelData should not be null");

      // Select Disturbed Area template (by label since IDs are dynamic)
      console.log(`  Selecting 'Disturbed Area' template...`);
      const selected = await selectTemplateByLabel(esriFrame, "Disturbed Area");
      expect(selected).toBe(true);

      // Verify drawing mode
      const mode = await isDrawingModeActive(esriFrame);
      console.log(`    Drawing mode: ${mode}`);
      expect(mode).toBe("polygon");

      // Get iframe bounding box
      const frameEl = await esriFrame.frameElement();
      const box = await frameEl?.boundingBox();
      expect(box).not.toBeNull();
      assertNotNull(box, "box should not be null");

      // Convert parcel polygon to screen coordinates
      const screenCoords = await getScreenCoords(esriFrame, parcelData.polygon);

      if (
        !screenCoords ||
        screenCoords.some(
          (p) => p.x < 0 || p.y < 0 || p.x > box.width || p.y > box.height
        )
      ) {
        // Parcel is off-screen, draw a box at center instead
        console.log("  ⚠ Parcel off-screen, drawing at map center");
        const centerX = box.width / 2;
        const centerY = box.height / 2;
        const size = 60;

        assertNotNull(mapPopup, "mapPopup should not be null");
        await drawPolygon(mapPopup, box, [
          { x: centerX - size, y: centerY - size },
          { x: centerX + size, y: centerY - size },
          { x: centerX + size, y: centerY + size },
          { x: centerX - size, y: centerY + size },
        ]);
      } else {
        // Draw the actual parcel polygon
        console.log("  Drawing parcel polygon...");
        assertNotNull(mapPopup, "mapPopup should not be null");
        await drawPolygon(mapPopup, box, screenCoords);
      }

      // Check acreage
      await sleep(1000);
      assertNotNull(esriFrame, "esriFrame should not be null");
      const acreage = await getAcreage(esriFrame);
      console.log(`  Acreage: ${acreage || "not found"}`);

      // Screenshot
      await mapPopup?.screenshot({
        path: "tests/e2e/screenshots/full-workflow-2-disturbed-area.png",
      });
      console.log("  Screenshot: full-workflow-2-disturbed-area.png");
    },
    TIMEOUTS.standard
  );

  // ---------------------------------------------------------------------------
  // STEP 5: Draw Access Point
  // ---------------------------------------------------------------------------
  test(
    "5. draw Access Point",
    async () => {
      console.log("\n=== STEP 5: Draw Access Point ===");
      expect(esriFrame).not.toBeNull();
      assertNotNull(esriFrame, "esriFrame should not be null");

      // Select Access Point template (by label since IDs are dynamic)
      console.log(`  Selecting 'Access Point' template...`);
      const selected = await selectTemplateByLabel(esriFrame, "Access Point");
      expect(selected).toBe(true);

      // Check drawing mode (might be point or polyline)
      const mode = await isDrawingModeActive(esriFrame);
      console.log(`    Drawing mode: ${mode}`);

      // Get iframe bounding box
      const frameEl = await esriFrame.frameElement();
      const box = await frameEl?.boundingBox();
      expect(box).not.toBeNull();
      assertNotNull(box, "box should not be null");
      assertNotNull(mapPopup, "mapPopup should not be null");

      // Draw a point near the edge of the map (simulating an entrance)
      // Place it to the right of center
      const pointX = box.width / 2 + 80;
      const pointY = box.height / 2;

      if (mode === "point") {
        await drawPoint(mapPopup, box, { x: pointX, y: pointY });
      } else {
        // If it's a polyline, draw a short line
        console.log("  Drawing as polyline...");
        await mapPopup?.mouse.click(box?.x + pointX, box?.y + pointY);
        await sleep(300);
        await mapPopup?.mouse.click(box?.x + pointX + 20, box?.y + pointY);
        await sleep(300);
        await mapPopup?.mouse.dblclick(box?.x + pointX + 20, box?.y + pointY);
        await sleep(500);
      }

      // Screenshot
      await mapPopup?.screenshot({
        path: "tests/e2e/screenshots/full-workflow-3-access-point.png",
      });
      console.log("  Screenshot: full-workflow-3-access-point.png");
    },
    TIMEOUTS.standard
  );

  // ---------------------------------------------------------------------------
  // STEP 6: Save and Close
  // ---------------------------------------------------------------------------
  test(
    "6. save and close",
    async () => {
      console.log("\n=== STEP 6: Save and Close ===");
      expect(mapPopup).not.toBeNull();
      assertNotNull(mapPopup, "mapPopup should not be null");

      // Screenshot before save
      await mapPopup.screenshot({
        path: "tests/e2e/screenshots/full-workflow-4-before-save.png",
      });

      // Click Save and Close - button is img[alt="Save and Close"]
      const saved = await clickSaveAndClose(mapPopup);
      console.log(`  Save clicked: ${saved}`);

      if (saved) {
        // Wait for save to complete and popup to close
        await sleep(3000);
        console.log("  ✓ Save and Close clicked successfully");
      } else {
        console.log("  ⚠ Save button not found - check screenshot");
      }

      // Screenshot after save attempt (on main page since popup may close)
      await harness.page.screenshot({
        path: "tests/e2e/screenshots/full-workflow-5-after-save.png",
      });
      console.log("  Screenshot: full-workflow-5-after-save.png");
    },
    TIMEOUTS.standard
  );

  // ---------------------------------------------------------------------------
  // CLEANUP
  // ---------------------------------------------------------------------------
  test(
    "7. cleanup",
    async () => {
      console.log("\n=== STEP 7: Cleanup ===");

      if (!createdAppId) {
        console.log("  No application to clean up");
        return;
      }

      const deleted = await deleteByApplicationId(
        harness.page,
        harness.context,
        createdAppId
      );
      expect(deleted).toBe(true);
      console.log(`  ✓ Deleted ${createdAppId}`);
    },
    TIMEOUTS.standard
  );
});
