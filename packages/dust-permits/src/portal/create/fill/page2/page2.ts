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
import type { MapSearchData } from "./map";
import {
  activateAccessPointTemplate,
  activateDisturbedAreaTemplate,
  drawPoint,
  drawPolygon,
  findEsriFrame,
  getScreenCoords,
  handleMapPopup,
  isDrawingModeActive,
  openMapPopup,
  saveAndCloseMapPopup,
  waitForEditor,
  zoomToPolygonExtent,
} from "./map";

const LOCATION_SELECT_RADIO_ID_RE = /locations:(\d+):selectRadio/;

// ============================================================================
// Location Table: Parse & Select by Parcel
// ============================================================================

/** A single row from the Page 2 locations table */
interface LocationRow {
  index: number;
  radioSelector: string;
  address: string;
  city: string;
  zip: string;
  parcel: string;
  latitude: string;
  longitude: string;
}

function pickFallbackLocationRow(
  rows: LocationRow[],
  targetParcel: string
): LocationRow | null {
  if (rows.length === 0) {
    return null;
  }

  const targetPrefix = targetParcel
    .split("-")
    .slice(0, 2)
    .join("-")
    .trim()
    .toLowerCase();

  const prefixMatches = targetPrefix
    ? rows.filter((row) =>
        row.parcel.trim().toLowerCase().startsWith(targetPrefix)
      )
    : [];

  const candidates = prefixMatches.length > 0 ? prefixMatches : rows;
  const withAddress =
    candidates.find((row) => row.address.trim().length > 0) ?? candidates[0];
  return withAddress ?? null;
}

/**
 * Wait for the locations table to load after map save.
 *
 * The portal shows "Loading project site drawing data" while computing
 * parcel intersections. We poll until that message disappears and
 * radio buttons appear.
 *
 * @returns Number of location rows found, or 0 if timeout
 */
async function waitForLocationsTable(
  page: Page,
  timeoutMs = 60_000
): Promise<number> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const loading = await page
      .locator('text="Loading project site drawing data"')
      .count();
    const radioCount = await page
      .locator('input[type="radio"][id*="locations"]')
      .count();

    if (loading === 0 && radioCount > 0) {
      return radioCount;
    }
    await sleep(2000);
  }
  return 0;
}

/**
 * Parse all rows from the Page 2 locations table.
 *
 * ADF nests the radio button inside: data-TR > TD > TABLE > TR > TD > SPAN > INPUT
 * So `radio.closest("tr")` finds the inner wrapper TR (1 child, empty text),
 * not the outer data TR (10 children, has all cell data).
 *
 * We walk up from each radio to find the TR with multiple children (the data row).
 *
 * Columns: Select | Address | City | County | State | Zip | Parcel | Lat | Lng | MCR#
 */
async function parseLocationsTable(page: Page): Promise<LocationRow[]> {
  return await page.evaluate((selectRadioReSource) => {
    const selectRadioRe = new RegExp(selectRadioReSource);

    const rows: {
      index: number;
      radioSelector: string;
      address: string;
      city: string;
      zip: string;
      parcel: string;
      latitude: string;
      longitude: string;
    }[] = [];

    const radios = document.querySelectorAll<HTMLInputElement>(
      'input[type="radio"][id*="locations"][id*="selectRadio"]'
    );

    for (const radio of radios) {
      const match = radio.id.match(selectRadioRe);
      if (!match) {
        continue;
      }
      const index = Number.parseInt(match[1], 10);

      // Walk up to find the data row TR (the one with multiple TD children)
      let el: HTMLElement | null = radio;
      let dataRow: HTMLElement | null = null;
      while (el) {
        el = el.parentElement;
        if (el?.tagName === "TR" && el.children.length >= 5) {
          dataRow = el;
          break;
        }
      }

      if (!dataRow) {
        continue;
      }

      // Extract text from each direct TD child
      const cells = dataRow.querySelectorAll(":scope > td");
      const cellTexts: string[] = [];
      for (const cell of cells) {
        cellTexts.push((cell as HTMLElement).textContent?.trim() ?? "");
      }

      // Columns: [0]=Select [1]=Address [2]=City [3]=County [4]=State [5]=Zip [6]=Parcel [7]=Lat [8]=Lng [9]=MCR#
      rows.push({
        address: cellTexts[1] ?? "",
        city: cellTexts[2] ?? "",
        index,
        latitude: cellTexts[7] ?? "",
        longitude: cellTexts[8] ?? "",
        parcel: cellTexts[6] ?? "",
        radioSelector: `[id="${radio.id}"]`,
        zip: cellTexts[5] ?? "",
      });
    }

    return rows;
  }, LOCATION_SELECT_RADIO_ID_RE.source);
}

/**
 * Select a location by parcel number (APN).
 *
 * Waits for the locations table to load, parses all rows, finds the
 * row matching the target parcel, and clicks its radio button.
 *
 * @param page - Playwright Page instance
 * @param targetParcel - APN to match (e.g., "141-58-015")
 * @returns Object with success flag, matched row info, and all available rows
 */
export async function selectLocationByParcel(
  page: Page,
  targetParcel: string
): Promise<{
  success: boolean;
  matched?: LocationRow;
  allRows: LocationRow[];
  error?: string;
}> {
  console.log(`  Selecting location by parcel: ${targetParcel}`);

  // Wait for the locations table to load
  const radioCount = await waitForLocationsTable(page);
  if (radioCount === 0) {
    return {
      allRows: [],
      error: "Locations table did not load (no radio buttons found)",
      success: false,
    };
  }
  console.log(`  Found ${radioCount} location rows`);

  // Parse all rows
  const rows = await parseLocationsTable(page);
  if (rows.length === 0) {
    return {
      allRows: [],
      error: "Could not parse location rows from table",
      success: false,
    };
  }

  // Log all available options
  for (const row of rows) {
    console.log(
      `    [${row.index}] ${row.parcel} - ${row.address || "(no address)"}, ${row.city} ${row.zip}`
    );
  }

  // Find matching parcel (normalize both sides: trim, case-insensitive)
  const normalized = targetParcel.trim().toLowerCase();
  const match = rows.find((r) => r.parcel.trim().toLowerCase() === normalized);

  if (!match) {
    return {
      allRows: rows,
      error: `Parcel "${targetParcel}" not found in ${rows.length} location rows`,
      success: false,
    };
  }

  console.log(
    `  ✓ Matched row ${match.index}: ${match.parcel} - ${match.address || "(no address)"}, ${match.city} ${match.zip}`
  );

  // Click the matching radio button
  await clickRadio(page, match.radioSelector);
  console.log(`  ✓ Selected location ${match.index} (${match.parcel})`);

  return { allRows: rows, matched: match, success: true };
}

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
  } catch (error) {
    console.log(`  fillPage2 failed: ${error}`);
    return false;
  }
}

/**
 * Fill Page 2 - Project Location (renewal mode).
 *
 * For renewals (re-applications), the portal copies form data (Pages 1, 3, 4)
 * but does NOT copy map/site drawing data. We must fetch the original polygon
 * from the FeatureServer API and redraw it on the new application's map.
 *
 * Flow:
 * 1. If Edit button exists → map data already present, skip
 * 2. Otherwise fetch polygon from FeatureServer for the source permit
 * 3. Use fillPage2WithMapData() to draw the polygon on the map
 * 4. Verify location is present, click Next
 *
 * @param page - Playwright Page instance
 * @param context - Browser context for popup handling
 * @param sourcePermitId - Optional source permit ID for FeatureServer lookup
 * @returns True if location/map data confirmed and Next clicked successfully
 */
export async function fillPage2Renew(
  page: Page,
  context: BrowserContext,
  sourcePermitId?: string,
  targetParcel?: string
): Promise<boolean> {
  console.log("\n[FILL PAGE 2 RENEW - Project Location]");
  if (targetParcel) {
    console.log(`  Target parcel: ${targetParcel}`);
  }

  try {
    // Check for existing map data via Edit button
    const hasEditBtn =
      (await page.locator(portal.page2.editSiteDrawingBtn).count()) > 0;
    if (hasEditBtn) {
      console.log("  ✓ Map data already exists (Edit button present)");
    } else if (sourcePermitId) {
      // Fetch polygon from FeatureServer and draw it
      console.log(
        `  No map data found. Fetching from FeatureServer for ${sourcePermitId}...`
      );
      const { queryPermitMapFeatures } = await import("@/lib/dust-features");
      const mapData = await queryPermitMapFeatures(sourcePermitId);

      if (!mapData.disturbedArea) {
        console.log(
          `  ✗ No polygon data on FeatureServer for ${sourcePermitId} - FAILING`
        );
        return false;
      }

      console.log(
        `  ✓ Found polygon: ${mapData.disturbedArea.latLngCoordinates.length} vertices, ` +
          `${mapData.accessPoints.length} access points, ` +
          `${mapData.acreage?.toFixed(2) ?? "?"} acres`
      );

      // Draw the polygon on the map
      // fillPage2WithMapData handles: draw, save, select location, click Next
      const drawSuccess = await fillPage2WithMapData(
        page,
        context,
        mapData,
        targetParcel
      );
      if (!drawSuccess) {
        console.log("  ✗ Failed to draw map data - FAILING");
        return false;
      }
      console.log("  ✓ Map data drawn and Page 2 completed via FeatureServer");
      return true;
    } else {
      console.log(
        "  ✗ No map data and no source permit ID to fetch from - FAILING"
      );
      return false;
    }

    // If Edit button was present, select location and proceed
    await sleep(1000);
    if (targetParcel) {
      const result = await selectLocationByParcel(page, targetParcel);
      if (!result.success) {
        console.log(`  ✗ ${result.error}`);
        return false;
      }
    } else {
      const hasLocation =
        (await page.locator(portal.page2.selectFirstLocation).count()) > 0;
      if (hasLocation) {
        await clickRadio(page, portal.page2.selectFirstLocation);
        console.log("  ⚠ No target parcel - selected first location");
      }
    }

    console.log("  Page 2 complete, clicking Next...");
    return await clickNext(page);
  } catch (error) {
    console.log(`  fillPage2Renew failed: ${error}`);
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
  } catch (error) {
    console.log(`  fillPage2Full failed: ${error}`);
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
  mapData: PermitMapData,
  targetParcel?: string
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

  // Select the correct location radio button
  if (targetParcel) {
    const result = await selectLocationByParcel(page, targetParcel);
    if (!result.success) {
      console.log(`  ✗ Location selection failed: ${result.error}`);
      console.log("  Available parcels:");
      for (const row of result.allRows) {
        console.log(`    [${row.index}] ${row.parcel} - ${row.address}`);
      }

      const fallback = pickFallbackLocationRow(result.allRows, targetParcel);
      if (!fallback) {
        await page
          .screenshot({
            path: "tests/e2e/screenshots/DEBUG-page2-parcel-mismatch.png",
          })
          .catch(() => {});
        return false;
      }

      console.log(
        `  ⚠ Falling back to row ${fallback.index}: ${fallback.parcel} - ${fallback.address || "(no address)"}`
      );
      await clickRadio(page, fallback.radioSelector);
    }
  } else {
    // No target parcel — fall back to first location with warning
    const radioCount = await waitForLocationsTable(page);
    if (radioCount > 0) {
      await clickRadio(page, portal.page2.selectFirstLocation);
      console.log(
        `  ⚠ No target parcel specified - selected first of ${radioCount} locations`
      );
    } else {
      console.log("  ✗ No locations found after map save");
      await page
        .screenshot({
          path: "tests/e2e/screenshots/DEBUG-page2-no-location.png",
        })
        .catch(() => {});
      return false;
    }
  }

  console.log("  Page 2 complete, clicking Next...");
  return await clickNext(page);
}
