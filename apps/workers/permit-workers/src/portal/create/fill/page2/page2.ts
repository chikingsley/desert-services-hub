/**
 * Fill Page 2 - Project Location
 *
 * Page 2 contains the site map and location selection. Two modes:
 *
 * 1. **Simple mode** (default): Select existing location and click Next.
 *    Used when location data is copied from a source application.
 *
 * 2. **Full mode**: Open map popup, search location, draw boundaries.
 *    Used when creating a new application that needs map entry.
 */

import type { BrowserContext, Frame, Page } from "playwright";
import type { MapFeature, PermitMapData } from "@/lib/dust-features";
import { clickNext, clickRadio, sleep } from "@/portal/utils/helpers";
import { portal } from "@/portal/utils/selectors";
import {
  activateAccessPointTemplate,
  activateDisturbedAreaTemplate,
  drawPoint,
  drawPolygon,
  findEsriFrame,
  getScreenCoords,
  handleMapPopup,
  isDrawingModeActive,
  type MapSearchData,
  openMapPopup,
  saveAndCloseMapPopup,
  waitForEditor,
  zoomToPolygonExtent,
} from "./map";

/**
 * Fill Page 2 - Project Location (simple mode).
 *
 * Selects the first location if available and clicks Next.
 * Use this when location data was copied from a source application.
 *
 * @param page - Playwright Page instance
 * @returns True if page was handled and Next was clicked successfully
 */
export async function fillPage2(page: Page): Promise<boolean> {
  console.log("\n[FILL PAGE 2 - Project Location]");
  try {
    // Select first location if available (copied from source app)
    if ((await page.locator(portal.page2.selectFirstLocation).count()) > 0) {
      await clickRadio(page, portal.page2.selectFirstLocation);
      console.log("  Selected first location");
    }

    console.log("  Page 2 complete, clicking Next...");
    return await clickNext(page);
  } catch (e) {
    console.log(`  fillPage2 failed: ${e}`);
    return false;
  }
}

/**
 * Fill Page 2 - Project Location (renewal mode).
 *
 * For renewals, location data is copied from the source permit.
 * Opens the map popup with copied data, then saves and closes.
 *
 * The portal copies map data when the popup is opened with the copyId URL param.
 * Since renewals copy from an existing permit, the map should have data.
 *
 * @param page - Playwright Page instance
 * @param context - Browser context for popup handling
 * @returns True if page was handled and Next was clicked successfully
 */
export async function fillPage2Renew(
  page: Page,
  context: BrowserContext
): Promise<boolean> {
  console.log("\n[FILL PAGE 2 RENEW - Project Location]");

  try {
    // Select first location if available (copied from source permit)
    const hasLocation =
      (await page.locator(portal.page2.selectFirstLocation).count()) > 0;
    if (hasLocation) {
      await clickRadio(page, portal.page2.selectFirstLocation);
      console.log("  ✓ Selected first location (copied from source)");
    } else {
      console.log("  ⚠ No location found - may need to add manually");
    }

    // Check for existing map data via Edit button
    const hasEditBtn =
      (await page.locator(portal.page2.editSiteDrawingBtn).count()) > 0;
    if (hasEditBtn) {
      console.log("  ✓ Map data exists (Edit button present)");
    } else {
      // No existing map data - open map popup and save
      // This handles the case where map data needs to be created
      console.log("  Opening map popup to initialize site drawing...");
      const mapPopup = await openMapPopup(page, context);
      if (mapPopup) {
        console.log("  ✓ Map popup opened");

        // Import and use saveAndCloseMapPopup
        const { saveAndCloseMapPopup } = await import("./map");
        const saved = await saveAndCloseMapPopup(mapPopup);
        if (saved) {
          console.log("  ✓ Map saved and closed");
        } else {
          console.log("  ⚠ Could not save map - continuing anyway");
        }

        // Wait for popup to close
        await page.waitForTimeout(2000);
      } else {
        console.log("  ⚠ Could not open map popup - continuing anyway");
      }
    }

    console.log("  Page 2 complete, clicking Next...");
    return await clickNext(page);
  } catch (e) {
    console.log(`  fillPage2Renew failed: ${e}`);
    return false;
  }
}

/**
 * Fill Page 2 - Project Location (full mode with map).
 *
 * Opens the map popup, handles location search, basemap switching,
 * and drawing mode activation. Does NOT draw the polygon yet.
 *
 * Use this when creating a new application that needs fresh map entry.
 *
 * @param page - Playwright Page instance
 * @param context - Browser context for popup handling
 * @param projectData - Location search data (parcel and/or address)
 * @returns True if map was handled successfully
 */
export async function fillPage2Full(
  page: Page,
  context: BrowserContext,
  projectData: MapSearchData
): Promise<boolean> {
  console.log("\n[FILL PAGE 2 FULL - Project Location with Map]");

  try {
    // Open map popup
    const mapPopup = await openMapPopup(page, context);
    if (!mapPopup) {
      console.log("  ✗ Failed to open map popup");
      return false;
    }

    // Handle map (search, basemap, draw mode)
    const result = await handleMapPopup(mapPopup, projectData);
    if (!result.success) {
      console.log("  ✗ Map handling failed");
      return false;
    }

    console.log("  Map handling complete:");
    console.log(`    - Searched by: ${result.searchedBy || "none"}`);
    console.log(`    - Basemap changed: ${result.basemapChanged}`);
    console.log(`    - Drawing complete: ${result.drawingComplete}`);

    // TODO: Implement polygon drawing here
    // For now, we stop at "ready to draw" state

    // NOTE: Not saving yet since drawing is not implemented
    // When drawing is ready, uncomment:
    // await saveAndCloseMapPopup(mapPopup);

    return result.success;
  } catch (e) {
    console.log(`  fillPage2Full failed: ${e}`);
    return false;
  }
}

// ============================================================================
// Helper: Draw Access Points
// ============================================================================

/**
 * Draw access points on the map.
 * Extracted to reduce cognitive complexity of fillPage2WithMapData.
 */
async function drawAccessPoints(
  mapPopup: Page,
  esriFrame: Frame,
  frameBox: { x: number; y: number },
  accessPoints: MapFeature[]
): Promise<void> {
  if (accessPoints.length === 0) {
    return;
  }

  console.log(`  Drawing ${accessPoints.length} access point(s)...`);

  for (const accessPoint of accessPoints) {
    // Select Access Point template
    const pointTemplateSelected = await activateAccessPointTemplate(esriFrame);
    if (!pointTemplateSelected) {
      console.log("  ⚠ Failed to select Access Point template");
      continue;
    }

    // Verify drawing mode is point
    const pointDrawMode = await isDrawingModeActive(esriFrame);
    if (pointDrawMode !== "point") {
      console.log(`  ⚠ Expected point mode, got: ${pointDrawMode}`);
      continue;
    }

    // Convert access point coordinate to screen
    const pointLatLng = accessPoint.latLngCoordinates[0];
    if (!pointLatLng) {
      continue;
    }
    const pointScreenResult = await getScreenCoords(esriFrame, [pointLatLng]);
    if (!pointScreenResult?.coords[0]) {
      console.log("  ⚠ Failed to convert access point coordinate");
      continue;
    }

    // Draw the point
    await drawPoint(mapPopup, frameBox, pointScreenResult.coords[0]);
    console.log("  ✓ Access point drawn");
    await sleep(500);
  }
}

// ============================================================================
// Fill Page 2 With Map Data
// ============================================================================

/**
 * Fill Page 2 with map data from an existing permit.
 *
 * Used for renewals where we need to redraw the map using coordinates
 * fetched from the FeatureServer API. Draws the disturbed area polygon
 * and any access points.
 *
 * @param page - Playwright Page instance
 * @param context - Browser context for popup handling
 * @param mapData - Map data from queryPermitMapFeatures()
 * @returns True if map was drawn and saved successfully
 */
export async function fillPage2WithMapData(
  page: Page,
  context: BrowserContext,
  mapData: PermitMapData
): Promise<boolean> {
  console.log("\n[FILL PAGE 2 WITH MAP DATA]");

  // Check if we have map data to draw
  if (!mapData.disturbedArea) {
    console.log("  ✗ No disturbed area polygon in map data");
    return false;
  }

  // Open map popup
  console.log("  Opening map popup...");
  const mapPopup = await openMapPopup(page, context);
  if (!mapPopup) {
    console.log("  ✗ Failed to open map popup");
    return false;
  }
  console.log("  ✓ Map popup opened");

  // Find ESRI iframe
  const esriFrame = await findEsriFrame(mapPopup);
  if (!esriFrame) {
    console.log("  ✗ Failed to find ESRI iframe");
    return false;
  }
  console.log("  ✓ ESRI iframe found");

  // Wait for Editor widget to be ready
  const editorReady = await waitForEditor(esriFrame);
  if (!editorReady) {
    console.log("  ✗ Editor widget not ready");
    return false;
  }

  // Prepare the map view
  const polygon = mapData.disturbedArea;
  const latLngCoords = polygon.latLngCoordinates;

  console.log("  Zooming to polygon extent...");
  const zoomed = await zoomToPolygonExtent(esriFrame, polygon.coordinates);
  if (!zoomed && mapData.centroid) {
    console.log("  Falling back to centroid pan...");
    const { panToCoordinates } = await import("./map");
    await panToCoordinates(
      esriFrame,
      mapData.centroid.lat,
      mapData.centroid.lng,
      17
    );
  }
  await sleep(2000);

  // Close any open dropdowns
  console.log("  Closing any open dropdowns...");
  await esriFrame.evaluate(() => {
    const mapContainer = document.querySelector("#map_container");
    if (mapContainer) {
      mapContainer.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    }
  });
  await sleep(500);

  // Draw the polygon
  console.log("  Selecting 'Disturbed Area' template...");
  const templateSelected = await activateDisturbedAreaTemplate(esriFrame);
  if (!templateSelected) {
    console.log("  ✗ Failed to select Disturbed Area template");
    return false;
  }

  const drawMode = await isDrawingModeActive(esriFrame);
  console.log(`  Drawing mode: ${drawMode}`);
  if (drawMode !== "polygon") {
    console.log(`  ✗ Expected polygon mode, got: ${drawMode}`);
    return false;
  }

  // Get frame bounding box
  const frameElement = await esriFrame.frameElement();
  const box = frameElement ? await frameElement.boundingBox() : null;
  if (!box) {
    console.log("  ✗ Could not get frame bounding box");
    return false;
  }

  // Convert coordinates
  const screenResult = await getScreenCoords(esriFrame, latLngCoords);
  if (!screenResult) {
    console.log("  ✗ Failed to convert coordinates to screen");
    return false;
  }

  const frameBox = {
    x: box.x + screenResult.mapOffset.x,
    y: box.y + screenResult.mapOffset.y,
  };

  console.log(
    `  Drawing polygon with ${screenResult.coords.length} vertices...`
  );
  await drawPolygon(mapPopup, frameBox, screenResult.coords);
  console.log("  ✓ Polygon drawn");
  await sleep(1500);

  // Draw access points
  await drawAccessPoints(mapPopup, esriFrame, frameBox, mapData.accessPoints);

  // Save and close
  console.log("  Saving and closing map...");
  const saved = await saveAndCloseMapPopup(mapPopup);
  if (!saved) {
    console.log("  ⚠ Could not save map");
    return false;
  }
  console.log("  ✓ Map saved and closed");
  await sleep(2000);

  // After map popup closes, ADF doesn't always refresh the location table.
  // Re-navigate to Page 2 via sidebar to force a fresh render.
  console.log("  Refreshing Page 2 to load location table...");
  const { goToPage } = await import("../../navigation");
  await goToPage(page, 2);
  await sleep(1000);

  // Select the location radio button (required before Next works)
  const locationRadio = page.locator(portal.page2.selectFirstLocation);
  try {
    await locationRadio.waitFor({ state: "visible", timeout: 10_000 });
    await clickRadio(page, portal.page2.selectFirstLocation);
    console.log("  ✓ Selected first location");
  } catch {
    console.log("  ⚠ No location radio found after refresh");
    await page
      .screenshot({
        path: "tests/e2e/screenshots/DEBUG-page2-no-location.png",
      })
      .catch(() => undefined);
  }

  console.log("  Page 2 complete, clicking Next...");
  return await clickNext(page);
}
