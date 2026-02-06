/**
 * Renewal Flow E2E Test
 *
 * Tests the full renewal workflow:
 * 1. Scrape original permit's location data (APN, address) from portal
 * 2. Query FeatureServer for map geometry (polygon coordinates)
 * 3. Create renewal application
 * 4. Draw map using original coordinates
 * 5. Select location matching original permit
 * 6. Navigate through all pages to Page 5
 *
 * This is Option A: scrape location from original permit FIRST, then create renewal.
 *
 * Run with: bun test tests/e2e/renew.test.ts
 */

import { afterAll, describe, expect, test } from "bun:test";

import {
  type PermitMapData,
  queryPermitMapFeatures,
} from "@/lib/dust-features";
import {
  createRenewApplication,
  getCurrentPage,
  goToPage,
  isOnDustAppsPage,
} from "@/portal/create";
import {
  drawPoint,
  drawPolygon,
  findEsriFrame,
  getScreenCoords,
  isDrawingModeActive,
  openMapPopup,
  panToCoordinates,
  saveAndCloseMapPopup,
  selectTemplateByLabel,
  waitForEditor,
  zoomToPolygonExtent,
} from "@/portal/create/fill/page2/map";
import { deleteByApplicationId } from "@/portal/delete";
import {
  clickApplicationByIndex,
  extractPermitData,
  listApplications,
} from "@/portal/scrape";
import type { PermitLocation } from "@/portal/types";
import {
  clickNext,
  clickRadio,
  DUST_APPLICATION_ID_REGEX,
  navigateToDustSearch,
  navigateToMyDustApps,
  sleep,
} from "@/portal/utils/helpers";
import { searchPermits } from "@/portal/utils/search";
import { portal } from "@/portal/utils/selectors";
import { PortalHarness } from "./utils/harness";
import { getPage2State } from "./utils/page2-state";
import { TIMEOUTS } from "./utils/timeouts";

// =============================================================================
// CONFIG
// =============================================================================

const RENEW_FROM_PERMIT = process.env.RENEW_PERMIT_ID || "D0064518";
const COMPANY_NAME =
  process.env.RENEW_COMPANY_NAME || "Sauers Lopez Construction Inc";

// =============================================================================
// HELPERS
// =============================================================================

function assertNotNull<T>(
  value: T | null | undefined,
  message?: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message || "Expected value to be non-null");
  }
}

// =============================================================================
// TEST
// =============================================================================

const harness = new PortalHarness();
let createdAppId: string | null = null;
let originalMapData: PermitMapData | null = null;
let originalLocation: PermitLocation | null = null;

describe("Renewal Flow - Copy Map Data from Original", () => {
  afterAll(async () => {
    await harness.teardown();
  });

  test(
    "1. login and navigate to My Dust Apps",
    async () => {
      await harness.setup();
      const success = await harness.navigateToDustApps();
      expect(success).toBe(true);
      expect(await isOnDustAppsPage(harness.page)).toBe(true);
    },
    TIMEOUTS.complex
  );

  test(
    "2. scrape original permit's location data from portal",
    async () => {
      const { page } = harness;

      // Navigate to Dust Search
      console.log("  Navigating to Dust Search...");
      await navigateToDustSearch(page);
      await sleep(2000);

      // Search for the original permit
      console.log(`  Searching for ${RENEW_FROM_PERMIT}...`);
      const searchResult = await searchPermits(page, {
        permitId: RENEW_FROM_PERMIT,
      });
      expect(searchResult.success).toBe(true);
      expect(searchResult.permitIds).toContain(RENEW_FROM_PERMIT);

      // Click into the permit detail
      console.log("  Clicking into permit detail...");
      const apps = await listApplications(page);
      const permitIndex = apps.findIndex((a) => a.id === RENEW_FROM_PERMIT);
      expect(permitIndex).toBeGreaterThanOrEqual(0);

      const clickResult = await clickApplicationByIndex(page, permitIndex);
      expect(clickResult.success).toBe(true);

      // Extract permit data (includes location)
      console.log("  Extracting permit data...");
      const permitData = await extractPermitData(page);

      // Store the first selected location (or first location if none selected)
      const selectedLocation = permitData.locations.find((l) => l.isSelected);
      originalLocation = selectedLocation || permitData.locations[0] || null;

      if (originalLocation) {
        console.log("  ✓ Original location scraped:");
        console.log(`    Address: ${originalLocation.address}`);
        console.log(`    City: ${originalLocation.city}`);
        console.log(`    Parcel (APN): ${originalLocation.parcel}`);
        console.log(
          `    Coords: ${originalLocation.latitude}, ${originalLocation.longitude}`
        );
      } else {
        console.log("  ⚠ No location found on original permit");
      }

      expect(originalLocation).not.toBeNull();

      // Navigate back to My Dust Apps
      console.log("  Navigating back to My Dust Apps...");
      await navigateToMyDustApps(page);
      await sleep(2000);
      expect(await isOnDustAppsPage(page)).toBe(true);
    },
    TIMEOUTS.complex
  );

  test(
    "3. query original permit's map geometry via FeatureServer API",
    async () => {
      // Query the REST API using production function
      originalMapData = await queryPermitMapFeatures(RENEW_FROM_PERMIT);

      expect(originalMapData.disturbedArea).not.toBeNull();
      console.log("  ✓ Found disturbed area polygon");

      if (originalMapData.accessPoints.length > 0) {
        console.log(
          `  ✓ Found ${originalMapData.accessPoints.length} access point(s) to copy`
        );
      }
    },
    TIMEOUTS.standard
  );

  test(
    "4. create renewal application",
    async () => {
      const { page, context } = harness;

      const result = await createRenewApplication(
        page,
        context,
        RENEW_FROM_PERMIT,
        COMPANY_NAME
      );

      expect(result.success).toBe(true);
      expect(result.applicationId).toMatch(DUST_APPLICATION_ID_REGEX);
      createdAppId = result.applicationId;
      console.log(`  ✓ Created renewal: ${createdAppId}`);
    },
    TIMEOUTS.complex
  );

  test(
    "5. navigate to Page 2 and draw map",
    async () => {
      const { page, context } = harness;
      assertNotNull(originalMapData, "Original data should exist");
      assertNotNull(
        originalMapData.disturbedArea,
        "Disturbed area should exist"
      );

      // Navigate to Page 2
      const { success } = await goToPage(page, 2);
      expect(success).toBe(true);
      expect(await getCurrentPage(page)).toBe(2);

      // Open map popup
      const mapPopup = await openMapPopup(page, context);
      assertNotNull(mapPopup, "Map popup should open");

      const esriFrame = await findEsriFrame(mapPopup);
      assertNotNull(esriFrame, "ESRI frame should exist");

      const editorReady = await waitForEditor(esriFrame, 30_000);
      expect(editorReady).toBe(true);

      // Get polygon to draw (using production types)
      const polygon = originalMapData.disturbedArea;
      const latLngCoords = polygon.latLngCoordinates;

      // Zoom to fit the polygon extent (not fixed zoom level)
      const zoomed = await zoomToPolygonExtent(esriFrame, polygon.coordinates);
      if (!zoomed && originalMapData.centroid) {
        // Fallback to center pan using centroid from production function
        await panToCoordinates(
          esriFrame,
          originalMapData.centroid.lat,
          originalMapData.centroid.lng,
          17
        );
      }
      await sleep(2000);

      // CRITICAL: Close any open dropdowns/menus by clicking on the map
      // This is essential - without it, dropdowns may cover the template picker
      console.log("  Closing any open dropdowns...");
      await esriFrame.evaluate(() => {
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

      // Screenshot before template selection
      await mapPopup.screenshot({
        path: "tests/e2e/screenshots/renew-1-before-template-select.png",
      });
      console.log("  Screenshot: renew-1-before-template-select.png");

      // Select Disturbed Area template
      console.log("  Selecting 'Disturbed Area' template...");
      const templateSelected = await selectTemplateByLabel(
        esriFrame,
        "Disturbed Area"
      );
      expect(templateSelected).toBe(true);

      // VERIFY DRAWING MODE IS POLYGON
      const drawMode = await isDrawingModeActive(esriFrame);
      console.log(`  Drawing mode after template select: ${drawMode}`);
      expect(drawMode).toBe("polygon");

      // Get frame bounding box
      const frameElement = await esriFrame.frameElement();
      assertNotNull(frameElement, "ESRI iframe element should exist");
      const box = await frameElement.boundingBox();
      assertNotNull(box, "Frame bounding box should exist");
      console.log(
        `  Frame box: ${box.width}x${box.height} at (${box.x}, ${box.y})`
      );

      // Convert to screen coords (relative to map container, not iframe)
      const screenResult = await getScreenCoords(esriFrame, latLngCoords);
      console.log(
        `  Screen coords: ${screenResult ? `${screenResult.coords.length} points` : "null"}`
      );

      // Get the actual map container offset
      const mapOffset = screenResult?.mapOffset || { x: 0, y: 0 };
      console.log(
        `  Map container offset: (${mapOffset.x.toFixed(0)}, ${mapOffset.y.toFixed(0)})`
      );

      const screenCoords = screenResult?.coords || null;

      // Log all screen coords for debugging
      if (screenCoords) {
        console.log("  Screen coord values (relative to map container):");
        for (let i = 0; i < Math.min(screenCoords.length, 4); i++) {
          const c = screenCoords[i];
          if (c) {
            console.log(`    [${i}]: (${c.x.toFixed(0)}, ${c.y.toFixed(0)})`);
          }
        }
      }

      // Get the map container's actual dimensions (not the whole frame)
      const mapContainerSize = await esriFrame.evaluate(() => {
        const mapDiv =
          document.getElementById("map") ||
          document.getElementById("map_root") ||
          document.querySelector("#map_container");
        if (mapDiv) {
          const rect = mapDiv.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            x: rect.x,
            y: rect.y,
          };
        }
        return null;
      });
      console.log(
        `  Map container size: ${mapContainerSize ? `${mapContainerSize.width}x${mapContainerSize.height} at (${mapContainerSize.x}, ${mapContainerSize.y})` : "unknown"}`
      );

      // Check if coords are within the map container bounds (not iframe bounds)
      const mapWidth = mapContainerSize?.width || box.width;
      const mapHeight = mapContainerSize?.height || box.height;
      const coordsValid = screenCoords?.every(
        (p) => p.x >= 0 && p.y >= 0 && p.x <= mapWidth && p.y <= mapHeight
      );

      if (!coordsValid && screenCoords) {
        const outOfBounds = screenCoords.filter(
          (p) => p.x < 0 || p.y < 0 || p.x > mapWidth || p.y > mapHeight
        );
        console.log(`  ⚠ ${outOfBounds.length} coords out of bounds`);
      }

      // Screenshot right before drawing
      await mapPopup.screenshot({
        path: "tests/e2e/screenshots/renew-1b-after-template-select.png",
      });
      console.log("  Screenshot: renew-1b-after-template-select.png");

      // Check current layer and drawing state
      const preDrawState = await esriFrame.evaluate(() => {
        const dijit = (
          window as unknown as Record<
            string,
            { registry?: { byId?: (id: string) => unknown } }
          >
        ).dijit;
        const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0") as
          | Record<string, unknown>
          | undefined;
        if (!editor) {
          return { error: "no editor" };
        }

        const tp = editor.templatePicker as
          | {
              getSelected?: () => {
                featureLayer?: { name?: string };
                template?: { name?: string };
              } | null;
            }
          | undefined;
        const selected = tp?.getSelected ? tp.getSelected() : null;
        const drawToolbar = editor._drawToolbar as
          | Record<string, unknown>
          | undefined;
        const currentLayer = editor._currentFeatureLayer as
          | Record<string, unknown>
          | undefined;

        return {
          selectedLayerName: selected?.featureLayer?.name || "none",
          selectedTemplateName: selected?.template?.name || "none",
          drawGeometryType: drawToolbar?._geometryType || "none",
          currentLayerName: (currentLayer?.name as string) || "none",
          drawActive: !!drawToolbar?._active,
        };
      });
      console.log(`  Pre-draw state: ${JSON.stringify(preDrawState)}`);

      // Calculate the actual click offset:
      // frameBox gives iframe position on page
      // mapOffset gives map container position within iframe
      const clickOffsetX = box.x + (mapContainerSize?.x || 0);
      const clickOffsetY = box.y + (mapContainerSize?.y || 0);
      console.log(
        `  Click offset: (${clickOffsetX.toFixed(0)}, ${clickOffsetY.toFixed(0)})`
      );

      if (coordsValid && screenCoords) {
        console.log("  ✓ Drawing original polygon");
        await drawPolygon(
          mapPopup,
          { x: clickOffsetX, y: clickOffsetY },
          screenCoords
        );
      } else {
        // Fallback: draw a box at center of MAP CONTAINER (not frame)
        console.log("  ⚠ Original coords off-screen, drawing at map center");
        const centerX = (mapContainerSize?.width || box.width) / 2;
        const centerY = (mapContainerSize?.height || box.height) / 2;
        const size = 60;

        await drawPolygon(mapPopup, { x: clickOffsetX, y: clickOffsetY }, [
          { x: centerX - size, y: centerY - size },
          { x: centerX + size, y: centerY - size },
          { x: centerX + size, y: centerY + size },
          { x: centerX - size, y: centerY + size },
        ]);
      }

      // Screenshot after polygon drawing
      await mapPopup.screenshot({
        path: "tests/e2e/screenshots/renew-2-after-polygon.png",
      });
      console.log("  Screenshot: renew-2-after-polygon.png");

      // Draw access point
      // Select Access Point template
      console.log("  Selecting 'Access Point' template...");
      const pointTemplateSelected = await selectTemplateByLabel(
        esriFrame,
        "Access Point"
      );
      if (pointTemplateSelected) {
        const pointMode = await isDrawingModeActive(esriFrame);
        console.log(`    Drawing mode: ${pointMode}`);

        // Draw point at center of MAP CONTAINER
        const pointX = (mapContainerSize?.width || box.width) / 2 + 80;
        const pointY = (mapContainerSize?.height || box.height) / 2;
        await drawPoint(
          mapPopup,
          { x: clickOffsetX, y: clickOffsetY },
          { x: pointX, y: pointY }
        );
      }

      // Screenshot after access point
      await mapPopup.screenshot({
        path: "tests/e2e/screenshots/renew-3-after-access-point.png",
      });
      console.log("  Screenshot: renew-3-after-access-point.png");

      // Save and close
      const saved = await saveAndCloseMapPopup(mapPopup);
      expect(saved).toBe(true);

      // Wait for popup to close
      await sleep(3000);
    },
    TIMEOUTS.extended
  );

  test(
    "6. verify Page 2 data exists",
    async () => {
      const { page } = harness;

      // Should still be on page 2 or need to navigate back
      const currentPage = await getCurrentPage(page);
      if (currentPage !== 2) {
        await goToPage(page, 2);
      }

      // Wait for page to fully load after popup close (can take up to 30s)
      console.log("  Waiting for page to update after save...");
      await sleep(10_000);

      // SCREENSHOT AND HTML DUMP
      const screenshotPath = "tests/e2e/screenshots/renew-page2-after-save.png";
      const htmlPath = "tests/e2e/screenshots/renew-page2-after-save.html";

      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`  Screenshot saved: ${screenshotPath}`);

      const html = await page.content();
      await Bun.write(htmlPath, html);
      console.log(`  HTML dump saved: ${htmlPath}`);

      // Search for the "Project site drawing not found" element and get its selector
      const errorElementInfo = await page.evaluate(() => {
        const searchText = "Project site drawing not found";
        const allElements = document.querySelectorAll("*");

        for (const el of allElements) {
          if (
            el.textContent?.includes(searchText) &&
            el.children.length === 0
          ) {
            // This is a leaf node containing the text
            return {
              found: true,
              id: el.id || null,
              tagName: el.tagName,
              className: el.className || null,
              parentId: el.parentElement?.id || null,
              text: el.textContent?.substring(0, 300),
            };
          }
        }

        // Also check if text exists anywhere
        const bodyText = document.body?.innerText || "";
        return {
          found: false,
          textExistsInBody: bodyText.includes(searchText),
        };
      });

      console.log("\n  Error Element Search:");
      console.log(`    ${JSON.stringify(errorElementInfo, null, 2)}`);

      const state = await getPage2State(page);

      console.log("\n  Page 2 State After Drawing:");
      console.log(`    Disturbed Acreage: "${state.disturbedAcreage}"`);
      console.log(`    Location Count: ${state.locationCount}`);
      console.log(`    Has Map Data: ${state.hasMapData}`);
      console.log(`    Needs Map Data: ${state.needsMapData}`);
      console.log(`    Has No Drawing Error: ${state.hasNoDrawingError}`);

      // Check for error state first
      if (state.hasNoDrawingError) {
        console.log(
          "  ✗ ERROR: 'Project site drawing not found' message detected"
        );
      }

      // Verify data exists
      expect(state.hasNoDrawingError).toBe(false);
      expect(state.hasDisturbedAcreage).toBe(true);
      expect(state.hasMapData).toBe(true);

      // Log original location for comparison
      if (originalLocation) {
        console.log("\n  Original location (scraped from permit):");
        console.log(`    Address: ${originalLocation.address}`);
        console.log(`    Parcel: ${originalLocation.parcel}`);
      }

      // Select the first location (should match original permit)
      console.log("  Selecting first location...");
      await clickRadio(page, portal.page2.selectFirstLocation);
      console.log("  ✓ Location selected");

      // Click Next to go to Page 3
      console.log("  Clicking Next...");
      const nextClicked = await clickNext(page);
      expect(nextClicked).toBe(true);
      await sleep(3000);

      const pageAfterNext = await getCurrentPage(page);
      console.log(`  Now on Page ${pageAfterNext}`);
      expect(pageAfterNext).toBe(3);
    },
    TIMEOUTS.standard
  );

  test(
    "7. navigate through Page 3 and 4 to Page 5",
    async () => {
      const { page } = harness;

      // Page 3 - Project Details (data copied from renewal source)
      console.log("  On Page 3, clicking Next...");
      let nextClicked = await clickNext(page);
      expect(nextClicked).toBe(true);
      await sleep(3000);

      let currentPage = await getCurrentPage(page);
      console.log(`  Now on Page ${currentPage}`);
      expect(currentPage).toBe(4);

      // Page 4 - Dust Control Plan (data copied from renewal source)
      console.log("  On Page 4, clicking Next...");
      nextClicked = await clickNext(page);
      expect(nextClicked).toBe(true);
      await sleep(3000);

      currentPage = await getCurrentPage(page);
      console.log(`  Now on Page ${currentPage}`);
      expect(currentPage).toBe(5);

      console.log("  ✓ Successfully navigated to Page 5 (Submit)");
    },
    TIMEOUTS.standard
  );

  test(
    "8. verify on Page 5 - renewal complete",
    async () => {
      const { page } = harness;

      const currentPage = await getCurrentPage(page);
      expect(currentPage).toBe(5);

      // Check for Submit page indicator
      const submitText = await page.locator("text=Submit Application").count();
      expect(submitText).toBeGreaterThan(0);

      console.log("\n  ✓ RENEWAL FLOW COMPLETE");
      console.log(`    Application: ${createdAppId}`);
      console.log(`    Source Permit: ${RENEW_FROM_PERMIT}`);
      console.log("    Successfully reached Page 5 (Submit)!");
    },
    TIMEOUTS.standard
  );

  test(
    "9. cleanup: delete draft",
    async () => {
      if (!createdAppId) {
        console.log("  No application to clean up");
        return;
      }

      const { page, context } = harness;
      const deleted = await deleteByApplicationId(page, context, createdAppId);
      expect(deleted).toBe(true);
      console.log(`  ✓ Cleaned up ${createdAppId}`);
    },
    TIMEOUTS.standard
  );
});
