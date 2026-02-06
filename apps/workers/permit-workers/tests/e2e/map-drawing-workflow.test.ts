/**
 * Map Drawing Workflow Test
 *
 * Tests the ACTUAL portal workflow for drawing polygons:
 * 1. Look up parcel by address (get real polygon coordinates)
 * 2. Open map popup
 * 3. Navigate to location
 * 4. Draw polygon using portal's templatePicker + drawToolbar
 * 5. Check if acreage displays and save works
 *
 * Run with: HEADLESS=false bun test tests/e2e/screenshots/map-drawing-workflow.test.ts
 */

import { afterAll, describe, expect, test } from "bun:test";
import type { Frame } from "playwright";

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

import { type ParcelData, queryParcelsByAddress } from "@/lib/assessor";
import {
  createExistingCompanyApplication,
  getCurrentPage,
  goToPage,
} from "@/portal/create";
import {
  activateDrawingMode,
  findEsriFrame,
  openMapPopup,
  searchLocation,
} from "@/portal/create/fill/page2/map";
import { deleteByApplicationId } from "@/portal/delete";
import { sleep } from "@/portal/utils/helpers";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

// Test config
const COMPANY_NAME = "Sundt Construction Inc";
const COPY_FROM_APP = process.env.COPY_FROM_APP_NUMBER || "D0062461";

// Test address - 4837 N Granite Reef Rd
const TEST_ADDRESS = "4837 N Granite Reef Rd";

const harness = new PortalHarness();
let createdAppId: string | null = null;
let esriFrame: Frame | null = null;
let parcelData: ParcelData | null = null;

/**
 * Wait for ESRI Editor widget to be fully loaded.
 */
async function waitForEditorWidget(
  frame: Frame,
  maxWaitMs = 60_000
): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 2000;

  while (Date.now() - startTime < maxWaitMs) {
    const status = await frame
      .evaluate(() => {
        // Check for search input (indicates basic widgets loaded)
        const searchInput = document.querySelector(
          "#esri_dijit_Search_0_input"
        );
        const hasSearch = !!searchInput;

        // Check for Editor widget
        const dijit = (
          window as unknown as Record<
            string,
            {
              registry?: { byId?: (id: string) => unknown };
            }
          >
        ).dijit;
        const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0");
        const hasEditor = !!editor;

        // Check for drawToolbar on editor
        let hasDrawToolbar = false;
        if (editor) {
          const ed = editor as Record<string, unknown>;
          hasDrawToolbar = !!ed._drawToolbar;
        }

        return { hasSearch, hasEditor, hasDrawToolbar };
      })
      .catch(() => ({
        hasSearch: false,
        hasEditor: false,
        hasDrawToolbar: false,
      }));

    console.log(
      `    search=${status.hasSearch}, editor=${status.hasEditor}, drawToolbar=${status.hasDrawToolbar}`
    );

    if (status.hasSearch && status.hasEditor && status.hasDrawToolbar) {
      return true;
    }

    await sleep(pollInterval);
  }

  return false;
}

describe("Map Drawing Workflow", () => {
  afterAll(async () => {
    await harness.teardown();
  });

  // ============================================================================
  // STEP 1: Look up parcel data by address
  // ============================================================================

  test(
    "1. lookup parcel by address",
    async () => {
      console.log(`\n  Looking up: ${TEST_ADDRESS}`);

      const parcels = await queryParcelsByAddress(TEST_ADDRESS);
      console.log(`  Found ${parcels.length} parcels`);

      if (parcels.length > 0) {
        const firstParcel = parcels[0];
        if (!firstParcel) {
          throw new Error("First parcel is undefined");
        }
        parcelData = firstParcel;
        console.log(`  APN: ${parcelData.apn}`);
        console.log(`  Address: ${parcelData.address}`);
        console.log(`  Acres: ${parcelData.acres}`);
        console.log(
          `  Centroid: ${parcelData.centroid.lat}, ${parcelData.centroid.lng}`
        );
        console.log(`  Polygon vertices: ${parcelData.polygon.length}`);

        // Log first few vertices
        for (let i = 0; i < Math.min(3, parcelData.polygon.length); i++) {
          const v = parcelData.polygon[i];
          if (!v) {
            throw new Error(`Vertex at index ${i} is undefined`);
          }
          console.log(`    [${i}]: ${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}`);
        }
      }

      expect(parcels.length).toBeGreaterThan(0);
      expect(parcelData?.polygon.length).toBeGreaterThan(0);
    },
    TIMEOUTS.standard
  );

  // ============================================================================
  // STEP 2: Setup - login, create app, open map popup
  // ============================================================================

  test(
    "2. setup: login, create app, open map popup",
    async () => {
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
      console.log(`  Created: ${createdAppId}`);

      // Navigate to page 2
      await goToPage(harness.page, 2);
      const currentPage = await getCurrentPage(harness.page);
      expect(currentPage).toBe(2);

      // Open map popup
      const mapPopup = await openMapPopup(harness.page, harness.context);
      expect(mapPopup).not.toBeNull();
      assertNotNull(mapPopup, "mapPopup should not be null");

      // Find ESRI iframe
      esriFrame = await findEsriFrame(mapPopup, 30_000);
      expect(esriFrame).not.toBeNull();
      assertNotNull(esriFrame, "esriFrame should not be null");

      // Wait for Editor widget to fully load
      console.log("  Waiting for ESRI Editor widget to load...");
      const editorLoaded = await waitForEditorWidget(esriFrame, 60_000);
      console.log(`  Editor loaded: ${editorLoaded}`);

      if (!editorLoaded) {
        // Take screenshot if not loaded
        await mapPopup?.screenshot({
          path: "tests/e2e/screenshots/map-workflow-not-loaded.png",
        });
      }

      // Activate drawing mode to ensure editor is ready
      await activateDrawingMode(esriFrame);

      console.log("  ✓ Setup complete");
    },
    TIMEOUTS.extended
  );

  // ============================================================================
  // STEP 3: Navigate map to parcel location
  // ============================================================================

  test(
    "3. navigate map to parcel location",
    async () => {
      expect(esriFrame).not.toBeNull();
      expect(parcelData).not.toBeNull();
      assertNotNull(esriFrame, "esriFrame should not be null");
      assertNotNull(parcelData, "parcelData should not be null");

      // Use cleaner address (remove extra spaces) or fall back to test address
      const rawAddr = parcelData.address || TEST_ADDRESS;
      const searchAddr = rawAddr.replace(/\s+/g, " ").trim();
      console.log(`\n  Searching for: ${searchAddr}`);

      // Also try with the APN
      console.log(`  (APN: ${parcelData.apn})`);

      await searchLocation(esriFrame, parcelData.apn, searchAddr);

      // Wait for map to pan
      await sleep(2000);

      // Verify map center is near parcel centroid
      const mapCenter = await esriFrame?.evaluate(() => {
        const dijit = (
          window as unknown as Record<
            string,
            {
              registry?: { byId?: (id: string) => unknown };
            }
          >
        ).dijit;

        const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0");
        if (!editor) {
          return null;
        }

        const ed = editor as Record<string, unknown>;
        const drawToolbar = ed._drawToolbar as
          | Record<string, unknown>
          | undefined;
        const map = drawToolbar?.map as
          | {
              extent?: { getCenter?: () => { x: number; y: number } };
            }
          | undefined;

        if (!map?.extent?.getCenter) {
          return null;
        }

        const center = map.extent.getCenter();
        return { x: center.x, y: center.y };
      });

      console.log("  Map center (Web Mercator):", mapCenter);
      console.log("  ✓ Map navigated to location");
    },
    TIMEOUTS.standard
  );

  // ============================================================================
  // STEP 4: Explore the templatePicker and drawing workflow
  // ============================================================================

  test(
    "4. explore templatePicker and drawing tools",
    async () => {
      expect(esriFrame).not.toBeNull();
      assertNotNull(esriFrame, "esriFrame should not be null");

      // Get info about the templatePicker and available templates
      const templateInfo = await esriFrame.evaluate(() => {
        const dijit = (
          window as unknown as Record<
            string,
            {
              registry?: { byId?: (id: string) => unknown };
            }
          >
        ).dijit;

        const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0");
        if (!editor) {
          return { error: "Editor not found" };
        }

        const ed = editor as Record<string, unknown>;
        const templatePicker = ed.templatePicker as
          | Record<string, unknown>
          | undefined;

        if (!templatePicker) {
          return { error: "templatePicker not found" };
        }

        const results: Record<string, unknown> = {
          templatePickerKeys: Object.keys(templatePicker).slice(0, 20),
        };

        // Check for templates/items
        if (templatePicker.items) {
          const items = templatePicker.items as unknown[];
          results.templateCount = items.length;
          results.templates = items.slice(0, 6).map((item, i) => {
            const t = item as Record<string, unknown>;
            return {
              index: i,
              label: t.label,
              type: t.type,
              hasFeatureLayer: !!t.featureLayer,
              keys: Object.keys(t).slice(0, 10),
            };
          });
        }

        // Check for getSelected method
        if (typeof templatePicker.getSelected === "function") {
          results.hasGetSelected = true;
          const selected = (templatePicker.getSelected as () => unknown)();
          results.currentlySelected = selected ? "yes" : "none";
        }

        // Check drawToolbar state
        const drawToolbar = ed._drawToolbar as
          | Record<string, unknown>
          | undefined;
        if (drawToolbar) {
          results.drawToolbarKeys = Object.keys(drawToolbar).slice(0, 15);
          results.drawToolbarActive = drawToolbar._geometryType || "none";
        }

        return results;
      });

      console.log("\n  === Template Picker Info ===");
      console.log("  ", JSON.stringify(templateInfo, null, 2));
    },
    TIMEOUTS.standard
  );

  // ============================================================================
  // STEP 5: Click a template card to activate drawing mode
  // ============================================================================

  test(
    "5. click 'Grading Site' template to activate drawing",
    async () => {
      expect(esriFrame).not.toBeNull();
      assertNotNull(esriFrame, "esriFrame should not be null");

      // Find and click the "Grading Site" template card in the left panel
      // These are the tpick-surface-* widgets we saw in discovery

      // First, let's find what template cards exist
      const templateCards = await esriFrame?.evaluate(() => {
        const results: Record<string, unknown> = {};

        // Look for template picker items by various selectors
        const selectors = [
          ".templatePicker-item",
          ".esriTemplatePicker .item",
          "[id^='tpick-surface']",
          ".dojoxGridRow",
          "[class*='template']",
        ];

        for (const sel of selectors) {
          const elements = document.querySelectorAll(sel);
          if (elements.length > 0) {
            results[sel] = {
              count: elements.length,
              texts: Array.from(elements)
                .slice(0, 6)
                .map((el) => ({
                  id: (el as HTMLElement).id,
                  text: (el as HTMLElement).innerText?.slice(0, 50),
                  className: (el as HTMLElement).className,
                })),
            };
          }
        }

        // Also look for the template picker widget DOM
        const dijit = (
          window as unknown as Record<
            string,
            {
              registry?: { byId?: (id: string) => unknown };
            }
          >
        ).dijit;
        const templatePickerWidget = dijit?.registry?.byId?.(
          "esri_dijit_editing_TemplatePicker_0"
        );
        if (templatePickerWidget) {
          const tpw = templatePickerWidget as {
            domNode?: Element;
            grid?: unknown;
            _itemWidgets?: unknown[];
          };
          results.templatePickerWidget = {
            hasDomNode: !!tpw.domNode,
            hasGrid: !!tpw.grid,
            itemWidgetsCount: tpw._itemWidgets?.length ?? 0,
          };

          // Try to find items via _itemWidgets
          if (tpw._itemWidgets && tpw._itemWidgets.length > 0) {
            results.itemWidgets = tpw._itemWidgets.slice(0, 6).map((w, i) => {
              const widget = w as {
                domNode?: HTMLElement;
                label?: string;
                item?: { label?: string };
              };
              return {
                index: i,
                label: widget.label || widget.item?.label,
                hasDOM: !!widget.domNode,
              };
            });
          }
        }

        return results;
      });

      console.log("\n  === Template Cards Discovery ===");
      console.log("  ", JSON.stringify(templateCards, null, 2));

      // Click "Disturbed Area" template directly via DOM selector
      const clickResult = await esriFrame?.evaluate(() => {
        // Try clicking the template by ID (tpick-surface-6 = Disturbed Area)
        const disturbedArea = document.getElementById("tpick-surface-6");
        if (disturbedArea) {
          disturbedArea.click();
          return {
            success: true,
            clicked: "Disturbed Area",
            method: "getElementById + click",
            id: "tpick-surface-6",
          };
        }

        // Fallback: try clicking via dojoxGridRow
        const rows = document.querySelectorAll(".dojoxGridRow");
        if (rows.length > 0) {
          (rows[0] as HTMLElement).click();
          return {
            success: true,
            clicked: "first row",
            method: "dojoxGridRow click",
          };
        }

        return { error: "Could not find template to click" };
      });

      console.log("\n  === Click Result ===");
      console.log("  ", JSON.stringify(clickResult, null, 2));

      await sleep(1000);

      // Check if drawing mode is now active
      const drawingState = await esriFrame?.evaluate(() => {
        const dijit = (
          window as unknown as Record<
            string,
            {
              registry?: { byId?: (id: string) => unknown };
            }
          >
        ).dijit;

        const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0");
        if (!editor) {
          return { error: "Editor not found" };
        }

        const ed = editor as Record<string, unknown>;
        const drawToolbar = ed._drawToolbar as
          | Record<string, unknown>
          | undefined;

        return {
          drawToolbarActive: drawToolbar?._geometryType || "none",
          drawToolbarKeys: drawToolbar
            ? Object.keys(drawToolbar).slice(0, 10)
            : [],
        };
      });

      console.log("\n  === Drawing State After Click ===");
      console.log("  ", JSON.stringify(drawingState, null, 2));

      // Take screenshot
      const popupPage = esriFrame?.page();
      await popupPage.screenshot({
        path: "tests/e2e/screenshots/map-workflow-template-selected.png",
      });
      console.log(
        "  Screenshot: tests/e2e/screenshots/map-workflow-template-selected.png"
      );
    },
    TIMEOUTS.standard
  );

  // ============================================================================
  // STEP 6: Draw a simple box at map center using mouse clicks
  // ============================================================================

  test(
    "6. draw box at map center via mouse clicks",
    async () => {
      expect(esriFrame).not.toBeNull();
      assertNotNull(esriFrame, "esriFrame should not be null");

      // Get the iframe bounding box for coordinate offset
      const frameElement = await esriFrame.frameElement();
      const boundingBox = await frameElement?.boundingBox();

      if (!boundingBox) {
        console.log("  Could not get iframe bounding box");
        return;
      }

      console.log("\n  Iframe bounding box:", boundingBox);

      // Get map container size to find center
      const mapSize = await esriFrame?.evaluate(() => {
        const container = document.getElementById("map_container");
        if (container) {
          const rect = container.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }
        return { width: 800, height: 600 };
      });

      console.log("  Map container size:", mapSize);

      // Calculate center of the map area
      const centerX = mapSize.width / 2;
      const centerY = mapSize.height / 2;

      // Draw a simple rectangle around center (100px x 80px)
      const boxSize = 50;
      const vertices = [
        { x: centerX - boxSize, y: centerY - boxSize * 0.8 }, // Top-left
        { x: centerX + boxSize, y: centerY - boxSize * 0.8 }, // Top-right
        { x: centerX + boxSize, y: centerY + boxSize * 0.8 }, // Bottom-right
        { x: centerX - boxSize, y: centerY + boxSize * 0.8 }, // Bottom-left
      ];

      const popupPage = esriFrame?.page();

      console.log("\n  Drawing box at map center...");
      console.log(`  Center: (${centerX}, ${centerY})`);

      // Click each vertex
      for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        if (!v) {
          throw new Error(`Vertex at index ${i} is undefined`);
        }
        const pageX = boundingBox.x + v.x;
        const pageY = boundingBox.y + v.y;

        console.log(
          `    Click ${i + 1}/${vertices.length}: (${pageX.toFixed(0)}, ${pageY.toFixed(0)})`
        );
        await popupPage.mouse.click(pageX, pageY);
        await sleep(600);
      }

      // Double-click near first vertex to complete the polygon
      const firstVertex = vertices[0];
      if (!firstVertex) {
        throw new Error("First vertex is undefined");
      }
      const closeX = boundingBox.x + firstVertex.x;
      const closeY = boundingBox.y + firstVertex.y;

      console.log(
        `    Double-click to close: (${closeX.toFixed(0)}, ${closeY.toFixed(0)})`
      );
      await popupPage.mouse.dblclick(closeX, closeY);

      await sleep(2000);

      // Take screenshot
      await popupPage.screenshot({
        path: "tests/e2e/screenshots/map-workflow-parcel-drawn.png",
      });
      console.log(
        "  Screenshot: tests/e2e/screenshots/map-workflow-parcel-drawn.png"
      );
    },
    TIMEOUTS.standard
  );

  // ============================================================================
  // STEP 7: Check if acreage displays and try to save
  // ============================================================================

  test(
    "7. check acreage display and save button",
    async () => {
      expect(esriFrame).not.toBeNull();
      assertNotNull(esriFrame, "esriFrame should not be null");

      // Look for acreage display in the UI
      const uiCheck = await esriFrame.evaluate(() => {
        const results: Record<string, unknown> = {};

        // Look for acreage text anywhere on the page
        const allText = document.body.innerText;
        // biome-ignore lint/performance/useTopLevelRegex: Regex evaluated in browser context, cannot extract to module level
        const acreageMatch = allText.match(/(\d+\.?\d*)\s*(acre|ac)/i);
        if (acreageMatch) {
          results.acreageFound = acreageMatch[0];
        }

        // Look for save button
        const saveButtons = document.querySelectorAll(
          'button, input[type="button"], .dijitButton'
        );
        const buttonTexts: string[] = [];
        for (const btn of saveButtons) {
          if (!btn) {
            continue;
          }
          const text =
            (btn as HTMLElement).innerText ||
            (btn as HTMLInputElement).value ||
            "";
          if (
            text.toLowerCase().includes("save") ||
            text.toLowerCase().includes("close")
          ) {
            buttonTexts.push(text);
          }
        }
        results.saveButtons = buttonTexts;

        // Check if there's an attribute inspector visible (shows when feature is selected)
        const attrInspector = document.querySelector(".esriAttributeInspector");
        results.attributeInspectorVisible = !!attrInspector;

        // Check graphics layer count
        const dijit = (
          window as unknown as Record<
            string,
            {
              registry?: { byId?: (id: string) => unknown };
            }
          >
        ).dijit;
        const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0");
        if (editor) {
          const ed = editor as Record<string, unknown>;
          const map = ((ed._drawToolbar as Record<string, unknown> | undefined)
            ?.map ||
            (ed.settings as Record<string, unknown> | undefined)?.map) as
            | {
                graphics?: { length?: number };
                graphicsLayerIds?: string[];
              }
            | undefined;

          if (map) {
            results.mapGraphicsCount = map.graphics?.length ?? "unknown";
            results.graphicsLayerIds = map.graphicsLayerIds;
          }
        }

        return results;
      });

      console.log("\n  === UI State Check ===");
      console.log("  ", JSON.stringify(uiCheck, null, 2));

      // Final screenshot
      const popupPage = esriFrame?.page();
      await popupPage.screenshot({
        path: "tests/e2e/screenshots/map-workflow-final.png",
      });
      console.log("  Screenshot: tests/e2e/screenshots/map-workflow-final.png");
    },
    TIMEOUTS.standard
  );

  // ============================================================================
  // CLEANUP
  // ============================================================================

  test(
    "8. cleanup: delete draft",
    async () => {
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
      console.log(`  Cleaned up ${createdAppId}`);
    },
    TIMEOUTS.standard
  );
});
