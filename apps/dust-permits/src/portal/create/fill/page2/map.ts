/**
 * Map Popup Handling for Page 2 - Project Location
 *
 * Functions to interact with the ESRI GIS map popup for drawing project boundaries.
 *
 * The map popup contains an ESRI iframe from gis.maricopa.gov that requires
 * direct frame interactions (Playwright locators) since cross-origin iframes
 * cannot be accessed via standard page methods.
 *
 * Workflow:
 * 1. Click "Add Site Drawing" button on page 2
 * 2. Wait for map popup to open
 * 3. Find ESRI iframe inside popup
 * 4. Search for location (parcel or address)
 * 5. Switch basemap to aerial photography
 * 6. Activate drawing mode
 * 7. Draw polygon (TODO)
 * 8. Save and close
 */

import type { BrowserContext, Frame, Page } from "playwright";
import { goToPage } from "@/portal/create/navigation";
import {
  clickNext,
  getCurrentPage,
  sleep,
  waitForElement,
  waitForPopup,
} from "@/portal/utils/helpers";
import { portal } from "@/portal/utils/selectors";
import { esriMap, mapPopup } from "@/portal/utils/selectors/page2";

// ============================================================================
// Types
// ============================================================================

export interface MapResult {
  basemapChanged: boolean;
  drawingComplete: boolean;
  searchedBy: "parcel" | "address" | null;
  success: boolean;
}

export interface MapSearchData {
  address?: string | null;
  parcelNumber?: string | null;
}

// ============================================================================
// Map Popup Functions
// ============================================================================

/**
 * Ensure we are on Page 2 (Project Location).
 */
async function hasSiteDrawingAction(page: Page): Promise<boolean> {
  const addVisible = await page
    .locator(portal.page2.addSiteDrawingBtn)
    .isVisible()
    .catch(() => false);
  const editVisible = await page
    .locator(portal.page2.editSiteDrawingBtn)
    .isVisible()
    .catch(() => false);
  return addVisible || editVisible;
}

async function waitForSiteDrawingAction(
  page: Page,
  timeoutMs = 8_000
): Promise<boolean> {
  const perButtonTimeout = Math.max(3_000, Math.floor(timeoutMs / 2));
  if (
    await waitForElement(
      page,
      portal.page2.editSiteDrawingBtn,
      perButtonTimeout
    )
  ) {
    return true;
  }
  return await waitForElement(
    page,
    portal.page2.addSiteDrawingBtn,
    perButtonTimeout
  );
}

async function ensureOnProjectLocationPage(page: Page): Promise<boolean> {
  if (await hasSiteDrawingAction(page)) {
    return true;
  }

  if (await waitForSiteDrawingAction(page)) {
    console.log("  ✓ Page 2 controls appeared after settling");
    return true;
  }

  console.log("  Navigating to Page 2 (Project Location)...");
  const navigation = await goToPage(page, 2);
  if (!navigation.success) {
    console.log(`    ✗ ${navigation.debug}`);

    const currentPage = await getCurrentPage(page);
    if (currentPage === 1) {
      console.log("    Retrying via Next button from Page 1...");
      const advanced = await clickNext(page);
      if (advanced) {
        if (await waitForSiteDrawingAction(page, 10_000)) {
          console.log("    ✓ Reached Page 2 via Next button fallback");
          return true;
        }
      }
    }

    return false;
  }
  return await waitForSiteDrawingAction(page);
}

/**
 * Click the site drawing action button.
 */
async function clickSiteDrawingButton(page: Page): Promise<boolean> {
  const actions = [
    {
      label: "Edit Site Drawing",
      selector: portal.page2.editSiteDrawingBtn,
    },
    {
      label: "Add Site Drawing",
      selector: portal.page2.addSiteDrawingBtn,
    },
  ] as const;

  for (const action of actions) {
    console.log(`  Waiting for '${action.label}' button...`);
    const buttonFound = await waitForElement(page, action.selector, 3_000);
    if (!buttonFound) {
      continue;
    }
    console.log(`    ✓ ${action.label} button found`);

    console.log(`  Clicking '${action.label}' button...`);
    const clicked = await page
      .locator(action.selector)
      .first()
      .click()
      .then(() => true)
      .catch(() => false);

    if (!clicked) {
      console.log(`    ✗ ${action.label} click failed`);
      continue;
    }
    console.log(`    ✓ Clicked ${action.label}`);
    return true;
  }

  console.log("    ✗ No site drawing action button found on Page 2");
  return false;
}

/**
 * Navigate to Page 2 and open the map popup.
 *
 * If already on the application detail page, navigates to Project Location
 * and clicks the available site drawing action ("Edit" or "Add").
 *
 * @param page - Main Playwright page
 * @param context - Browser context for popup detection
 * @returns Map popup page or null if failed
 */
export async function openMapPopup(
  page: Page,
  context: BrowserContext
): Promise<Page | null> {
  console.log("\n[OPEN MAP POPUP]");

  // Wait for page to settle
  console.log("  Waiting for page to settle...");
  await sleep(2000);

  // 1. Ensure on Page 2
  const onPage2 = await ensureOnProjectLocationPage(page);
  if (!onPage2) {
    return null;
  }

  // 2. Click site drawing action
  const popupPromise = page
    .waitForEvent("popup", { timeout: 20_000 })
    .catch(() => null);
  const clicked = await clickSiteDrawingButton(page);
  if (!clicked) {
    return null;
  }

  // 3. Wait for popup
  console.log("  Waiting for map popup...");
  let mapPopup = await popupPromise;
  if (!mapPopup) {
    mapPopup = (await waitForPopup(context)) ?? null;
  }
  if (!mapPopup) {
    console.log("    ✗ Map popup did not open");
    return null;
  }

  await mapPopup.waitForLoadState("domcontentloaded");
  console.log("    ✓ Map popup opened!");

  // Wait for ESRI iframe to load
  await sleep(3000);

  return mapPopup;
}

/**
 * Find the ESRI iframe inside the map popup.
 *
 * The ESRI map is nested inside an iframe from gis.maricopa.gov.
 * The iframe may take time to load, so we poll for it.
 */
export async function findEsriFrame(
  popupPage: Page,
  maxWaitMs = 15_000
): Promise<Frame | null> {
  const startTime = Date.now();
  const pollInterval = 1000;

  while (Date.now() - startTime < maxWaitMs) {
    const frames = popupPage.frames();
    console.log(`  Searching ${frames.length} frames for ESRI iframe...`);

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      if (!frame) {
        continue;
      }

      try {
        const frameUrl = await frame.evaluate(() => window.location.href);
        console.log(`    Frame ${i}: ${frameUrl.slice(0, 60)}...`);

        if (frameUrl.includes("gis.maricopa.gov")) {
          console.log(`    ✓ Found ESRI iframe at frame ${i}`);
          return frame;
        }
      } catch {
        console.log(`    Frame ${i}: (not accessible)`);
      }
    }

    console.log(`  ESRI iframe not found yet, waiting ${pollInterval}ms...`);
    await sleep(pollInterval);
  }

  console.log("    ✗ ESRI iframe not found after timeout");
  return null;
}

/**
 * Wait for ESRI map widgets to be fully loaded.
 */
async function waitForEsriWidgetsReady(
  esriFrame: Frame,
  maxWaitMs = 15_000
): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 500;

  while (Date.now() - startTime < maxWaitMs) {
    const ready = await esriFrame
      .evaluate(
        ({ searchSel, mapSel, basemapSel }) => {
          const searchInput = !!document.querySelector(searchSel);
          const mapContainer = !!document.querySelector(mapSel);
          const basemapBtn = !!document.querySelector(basemapSel);
          return {
            basemapBtn,
            mapContainer,
            ready: searchInput && mapContainer,
            searchInput,
          };
        },
        {
          basemapSel: esriMap.basemapBtn,
          mapSel: esriMap.mapContainer,
          searchSel: esriMap.searchInput,
        }
      )
      .catch(() => ({
        basemapBtn: false,
        mapContainer: false,
        ready: false,
        searchInput: false,
      }));

    if (ready.ready) {
      console.log(
        `    Widgets ready: search=${ready.searchInput}, map=${ready.mapContainer}, basemap=${ready.basemapBtn}`
      );
      return true;
    }

    console.log(
      `    Waiting for widgets: search=${ready.searchInput}, map=${ready.mapContainer}, basemap=${ready.basemapBtn}`
    );
    await sleep(pollInterval);
  }

  return false;
}

/**
 * Search for a location in the ESRI map.
 * Tries parcel number first (no dashes/spaces), then address.
 */
export async function searchLocation(
  esriFrame: Frame,
  parcelNumber: string | null,
  address: string | null
): Promise<{ success: boolean; searchedBy: "parcel" | "address" | null }> {
  console.log("  Searching for location...");

  // Format parcel number (remove dashes and spaces)
  const cleanParcel = parcelNumber?.replaceAll(/[-\s]/g, "") || null;

  // Try parcel first
  if (cleanParcel) {
    console.log(`    Trying parcel: ${cleanParcel}`);

    const typed = await esriFrame
      .evaluate(
        ({ selector, value }) => {
          const input = document.querySelector(selector) as HTMLInputElement;
          if (!input) {
            return false;
          }

          input.focus();
          input.value = value;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        },
        { selector: esriMap.searchInput, value: cleanParcel }
      )
      .catch(() => false);

    if (typed) {
      console.log(`    ✓ Typed parcel: ${cleanParcel}`);
      await sleep(1500); // Wait for autocomplete dropdown

      // Click first search result
      const clicked = await esriFrame
        .evaluate((): { success: boolean; resultText?: string } => {
          const suggestions = document.querySelectorAll(
            ".searchMenu .suggestionsMenu div, " +
              ".esri-search__suggestions-list li, " +
              ".esri-search__suggestion, " +
              "[class*='suggest'] li, " +
              "[class*='search-result'], " +
              ".searchInputGroup .esriSearch div"
          );

          if (suggestions.length > 0) {
            const first = suggestions[0] as HTMLElement;
            first.click();
            return { resultText: first.textContent?.trim(), success: true };
          }

          // Fallback: press Enter
          const input = document.querySelector(
            "#esri_dijit_Search_0_input"
          ) as HTMLInputElement;
          if (input) {
            const enterEvent = new KeyboardEvent("keydown", {
              bubbles: true,
              code: "Enter",
              key: "Enter",
              keyCode: 13,
            });
            input.dispatchEvent(enterEvent);
            return { resultText: "(pressed Enter)", success: true };
          }

          return { success: false };
        })
        .catch((): { success: boolean; resultText?: string } => ({
          success: false,
        }));

      if (clicked.success) {
        console.log(`    ✓ Clicked result: ${clicked.resultText ?? "unknown"}`);
        await sleep(2000);
        return { searchedBy: "parcel", success: true };
      }
    }
  }

  // Try address
  if (address) {
    console.log(`    Trying address: ${address}`);

    const typed = await esriFrame
      .evaluate(
        ({ selector, value }) => {
          const input = document.querySelector(selector) as HTMLInputElement;
          if (!input) {
            return false;
          }

          input.focus();
          input.value = value;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        },
        { selector: esriMap.searchInput, value: address }
      )
      .catch(() => false);

    if (typed) {
      console.log(`    ✓ Typed address: ${address}`);
      await sleep(1500);

      const clicked = await esriFrame
        .evaluate((): { success: boolean; resultText?: string } => {
          const suggestions = document.querySelectorAll(
            ".searchMenu .suggestionsMenu div, " +
              ".esri-search__suggestions-list li, " +
              ".esri-search__suggestion, " +
              "[class*='suggest'] li, " +
              "[class*='search-result'], " +
              ".searchInputGroup .esriSearch div"
          );

          if (suggestions.length > 0) {
            const first = suggestions[0] as HTMLElement;
            first.click();
            return { resultText: first.textContent?.trim(), success: true };
          }

          const input = document.querySelector(
            "#esri_dijit_Search_0_input"
          ) as HTMLInputElement;
          if (input) {
            const enterEvent = new KeyboardEvent("keydown", {
              bubbles: true,
              code: "Enter",
              key: "Enter",
              keyCode: 13,
            });
            input.dispatchEvent(enterEvent);
            return { resultText: "(pressed Enter)", success: true };
          }

          return { success: false };
        })
        .catch((): { success: boolean; resultText?: string } => ({
          success: false,
        }));

      if (clicked.success) {
        console.log(`    ✓ Clicked result: ${clicked.resultText ?? "unknown"}`);
        await sleep(2000);
        return { searchedBy: "address", success: true };
      }
    }
  }

  console.log("    ✗ No parcel or address to search");
  return { searchedBy: null, success: false };
}

/**
 * Switch basemap to County Aerial Photography.
 */
export async function switchToAerialBasemap(
  esriFrame: Frame
): Promise<boolean> {
  console.log("  Switching to County Aerial Photography...");

  // Click basemap button to open gallery
  const openedGallery = await esriFrame
    .evaluate(
      ({ primary, alt }): { success: boolean; method?: string } => {
        // Try primary selector
        let btn = document.querySelector(primary);
        if (btn) {
          (btn as HTMLElement).click();
          return { method: "primary", success: true };
        }

        // Try alt selector
        btn = document.querySelector(alt);
        if (btn) {
          (btn as HTMLElement).click();
          return { method: "alt", success: true };
        }

        // Try BoxController toolbar
        btn = document.querySelector(
          "#widgets_BoxController_Widget_66 .jimu-widget-onscreen-icon"
        );
        if (btn) {
          (btn as HTMLElement).click();
          return { method: "boxController", success: true };
        }

        // Look for any basemap-related button
        const basemapBtns = [
          ...document.querySelectorAll(
            "[class*='basemap'], [title*='Basemap'], [aria-label*='Basemap']"
          ),
        ];
        if (basemapBtns.length > 0) {
          (basemapBtns[0] as HTMLElement).click();
          return { method: "fuzzy", success: true };
        }

        return { success: false };
      },
      {
        alt: esriMap.basemapBtnAlt,
        primary: esriMap.basemapBtn,
      }
    )
    .catch((): { success: boolean; method?: string } => ({ success: false }));

  if (!openedGallery.success) {
    console.log("    ✗ Could not open basemap gallery");
    return false;
  }
  console.log(
    `    ✓ Opened basemap gallery (via ${openedGallery.method ?? "unknown"})`
  );
  await sleep(2500);

  // Select County Aerial Photography
  const selectedAerial = await esriFrame
    .evaluate(
      ({
        imagery,
        aerial,
        county,
      }): { success: boolean; selectedTitle?: string } => {
        // Try County Aerial first
        let option = document.querySelector(county);
        if (option) {
          (option as HTMLElement).click();
          return { selectedTitle: "County Aerial", success: true };
        }

        // Try Imagery
        option = document.querySelector(imagery);
        if (option) {
          (option as HTMLElement).click();
          return { selectedTitle: "Imagery", success: true };
        }

        // Try generic Aerial
        option = document.querySelector(aerial);
        if (option) {
          (option as HTMLElement).click();
          return { selectedTitle: "Aerial", success: true };
        }

        // Fallback: Look for any node with aerial/imagery in title or text
        const allNodes = [
          ...document.querySelectorAll(
            ".basemapGalleryNode, .esri-basemap-gallery__item, [class*='basemap-item'], .dijitMenuItem"
          ),
        ];
        for (const node of allNodes) {
          const title = (node.getAttribute("title") || "").toLowerCase();
          const text = (node.textContent || "").toLowerCase();
          if (
            title.includes("county") ||
            title.includes("aerial") ||
            title.includes("imagery") ||
            text.includes("county") ||
            text.includes("aerial") ||
            text.includes("imagery")
          ) {
            (node as HTMLElement).click();
            return {
              selectedTitle:
                node.getAttribute("title") ||
                node.textContent?.trim() ||
                "unknown",
              success: true,
            };
          }
        }

        return { success: false };
      },
      {
        aerial: esriMap.aerialOption,
        county: esriMap.countyAerialOption,
        imagery: esriMap.imageryOption,
      }
    )
    .catch((): { success: boolean; selectedTitle?: string } => ({
      success: false,
    }));

  if (selectedAerial.success) {
    console.log(
      `    ✓ Selected basemap: ${selectedAerial.selectedTitle ?? "unknown"}`
    );
    await sleep(2000);
    return true;
  }

  console.log("    ✗ Could not find aerial/imagery basemap option");
  return false;
}

/**
 * Activate the drawing/edit tool.
 */
export async function activateDrawingMode(esriFrame: Frame): Promise<boolean> {
  console.log("  Activating drawing mode...");

  const activated = await esriFrame
    .evaluate((selector) => {
      // Try Disturbed Area template first
      const disturbedArea = document.querySelector(selector);
      if (disturbedArea) {
        (disturbedArea as HTMLElement).click();
        return true;
      }

      // Try any edit button
      const editBtns = [
        ...document.querySelectorAll(
          '[id*="Edit"], [class*="edit"], .sketchtool'
        ),
      ];
      for (const el of editBtns) {
        const btn = el as HTMLElement;
        if (btn.offsetParent !== null && btn.click) {
          btn.click();
          return true;
        }
      }
      return false;
    }, esriMap.disturbedAreaTool)
    .catch(() => false);

  if (activated) {
    console.log("    ✓ Drawing mode activated");
    await sleep(500);
    return true;
  }

  console.log("    ✗ Could not activate drawing mode");
  return false;
}

/**
 * Main handler for the map popup.
 * Orchestrates: search → basemap → draw mode → (drawing) → save
 */
export async function handleMapPopup(
  popupPage: Page,
  projectData: MapSearchData
): Promise<MapResult> {
  console.log("\n[HANDLE MAP POPUP]");

  const result: MapResult = {
    basemapChanged: false,
    drawingComplete: false,
    searchedBy: null,
    success: false,
  };

  // Wait for popup to fully load
  console.log("  Waiting for popup to load...");
  try {
    await popupPage.waitForLoadState("domcontentloaded");
  } catch {
    // Continue anyway
  }
  await sleep(2000);

  // Step 1: Find ESRI iframe
  console.log("  Step 1: Finding ESRI iframe...");
  const esriFrame = await findEsriFrame(popupPage, 20_000);
  if (!esriFrame) {
    console.log("  ✗ ESRI iframe not found - cannot proceed");
    return result;
  }

  // Wait for ESRI widgets to be fully initialized
  console.log("  Waiting for ESRI widgets to initialize...");
  const widgetsReady = await waitForEsriWidgetsReady(esriFrame, 15_000);
  if (!widgetsReady) {
    console.log("  ⚠ Widgets not fully ready, but continuing...");
  }
  console.log("  ✓ ESRI iframe found and loaded");

  await sleep(2000);

  // Step 2: Switch to aerial basemap
  console.log("  Step 2: Switching basemap...");
  result.basemapChanged = await switchToAerialBasemap(esriFrame);

  // Step 2.5: Go back to Edit tab after basemap change
  console.log("  Step 2.5: Clicking Edit tab...");
  const editClicked = await esriFrame
    .evaluate(() => {
      const editSelectors = [
        "#widgets_Edit_Widget_62",
        ".jimu-widget-edit",
        "[data-widget-name='Edit']",
        "#tpick-surface-30",
        "[id*='Edit']",
      ];

      for (const selector of editSelectors) {
        const el = document.querySelector(selector) as HTMLElement;
        if (el) {
          el.click();
          return { selector, success: true };
        }
      }
      return { selector: null, success: false };
    })
    .catch(() => ({ selector: null, success: false }));

  if (editClicked.success) {
    console.log(`    ✓ Clicked Edit tab (${editClicked.selector})`);
    await sleep(1000);
  } else {
    console.log("    ⚠ Could not find Edit tab, continuing...");
  }

  // Step 3: Search for location
  console.log("  Step 3: Searching for location...");
  const searchResult = await searchLocation(
    esriFrame,
    projectData.parcelNumber || null,
    projectData.address || null
  );
  result.searchedBy = searchResult.searchedBy;
  if (!searchResult.success) {
    console.log("    ⚠ Search failed, but continuing...");
  }

  // Step 4: Activate drawing mode
  console.log("  Step 4: Activating drawing mode...");
  const drawingActive = await activateDrawingMode(esriFrame);
  await sleep(2000);

  if (drawingActive) {
    console.log("\n  ========================================");
    console.log("  🎯 READY TO DRAW!");
    console.log("  Map is positioned and drawing mode is active.");
    console.log("  Next step: Implement polygon drawing logic.");
    console.log("  ========================================\n");
  }

  // Pause for visual inspection
  console.log("  Pausing 5 seconds for visual inspection...");
  await sleep(5000);

  result.drawingComplete = false;
  result.success = true;
  return result;
}

/**
 * Save and close the map popup.
 */
export async function saveAndCloseMapPopup(popupPage: Page): Promise<boolean> {
  console.log("\n[SAVE MAP POPUP]");

  const saveImgSelector = mapPopup.saveAndCloseBtn;

  // Try clicking directly on the page
  const imgBtn = await popupPage.$(saveImgSelector);
  if (imgBtn) {
    await imgBtn.click();
    console.log("  ✓ Clicked Save and Close");
    await sleep(2000);
    return true;
  }

  // Try in all frames
  for (const frame of popupPage.frames()) {
    try {
      const frameImgBtn = await frame.$(saveImgSelector);
      if (frameImgBtn) {
        await frameImgBtn.click();
        console.log("  ✓ Clicked Save and Close (in frame)");
        await sleep(2000);
        return true;
      }
    } catch {
      // Continue to next frame
    }
  }

  // Fallback: look for any save-related buttons in the page
  const clicked = await popupPage.evaluate(() => {
    const imgs = document.querySelectorAll('img[alt*="Save"]');
    for (const img of imgs) {
      (img as HTMLElement).click();
      return true;
    }
    return false;
  });

  if (clicked) {
    console.log("  ✓ Clicked Save (fallback)");
    await sleep(2000);
    return true;
  }

  console.log("  ✗ Could not find Save and Close button");
  return false;
}

// ============================================================================
// Drawing Functions
// ============================================================================

/**
 * Wait for the ESRI Editor widget to be fully ready.
 * The editor must have its _drawToolbar available for drawing operations.
 */
export async function waitForEditor(
  frame: Frame,
  maxAttempts = 10
): Promise<boolean> {
  console.log("  Waiting for Editor widget...");
  for (let i = 0; i < maxAttempts; i++) {
    const ready = await frame
      .evaluate(() => {
        const { dijit } = window as unknown as Record<
          string,
          { registry?: { byId?: (id: string) => unknown } }
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
      console.log("  ✓ Editor widget ready");
      return true;
    }
    await sleep(1500);
  }
  console.log("  ✗ Editor widget not ready after timeout");
  return false;
}

/**
 * Check if drawing mode is active and return the geometry type.
 * Returns "polygon", "point", "polyline", "none", "no-editor", or "error".
 */
export function isDrawingModeActive(frame: Frame): Promise<string> {
  return frame
    .evaluate(() => {
      const { dijit } = window as unknown as Record<
        string,
        { registry?: { byId?: (id: string) => unknown } }
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
 * Pan the map to the specified coordinates.
 *
 * @param frame - ESRI iframe
 * @param lat - Latitude (WGS84)
 * @param lng - Longitude (WGS84)
 * @param zoomLevel - Zoom level (default 18 for parcel detail)
 */
export async function panToCoordinates(
  frame: Frame,
  lat: number,
  lng: number,
  zoomLevel = 18
): Promise<boolean> {
  console.log(
    `  Panning to: ${lat.toFixed(6)}, ${lng.toFixed(6)} at zoom ${zoomLevel}`
  );
  const result = await frame
    .evaluate(
      ({ lat, lng, zoom }) => {
        const { dijit } = window as unknown as Record<
          string,
          { registry?: { byId?: (id: string) => unknown } }
        >;
        const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0");
        if (!editor) {
          return { error: "no editor", success: false };
        }

        const ed = editor as Record<string, unknown>;
        const map = ((ed._drawToolbar as Record<string, unknown>)?.map ||
          (ed.settings as Record<string, unknown>)?.map) as
          | Record<string, unknown>
          | undefined;
        if (!map) {
          return { error: "no map", success: false };
        }

        const toWebMercator = (lat: number, lng: number) => ({
          spatialReference: (map.spatialReference as Record<
            string,
            unknown
          >) || { wkid: 102_100 },
          x: (lng * 20_037_508.34) / 180,
          y:
            Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) *
            (20_037_508.34 / Math.PI),
        });

        const point = toWebMercator(lat, lng);
        if (map.centerAndZoom) {
          (map.centerAndZoom as (pt: unknown, zoom: number) => void)(
            point,
            zoom
          );
          return { success: true };
        }
        return { error: "no centerAndZoom", success: false };
      },
      { lat, lng, zoom: zoomLevel }
    )
    .catch(() => ({ error: "exception", success: false }));

  if (result.success) {
    console.log("  ✓ Map panned to coordinates");
  } else {
    console.log(`  ✗ Pan failed: ${result.error}`);
  }
  return result.success;
}

/**
 * Zoom the map to fit a polygon extent with padding.
 *
 * @param frame - ESRI iframe
 * @param coords - Array of Web Mercator coordinates
 */
export async function zoomToPolygonExtent(
  frame: Frame,
  coords: { x: number; y: number }[]
): Promise<boolean> {
  const result = await frame
    .evaluate(
      ({ coords }) => {
        const { dijit } = window as unknown as Record<
          string,
          { registry?: { byId?: (id: string) => unknown } }
        >;
        const { esri } = window as unknown as Record<
          string,
          { geometry?: { Extent?: unknown } }
        >;
        const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0");
        if (!editor) {
          return { error: "no editor", success: false };
        }

        const ed = editor as Record<string, unknown>;
        const map = ((ed._drawToolbar as Record<string, unknown>)?.map ||
          (ed.settings as Record<string, unknown>)?.map) as
          | Record<string, unknown>
          | undefined;
        if (!map) {
          return { error: "no map", success: false };
        }

        // Calculate extent using Math.min/max for simpler logic
        const xValues = coords.map((c) => c.x);
        const yValues = coords.map((c) => c.y);
        const rawMinX = Math.min(...xValues);
        const rawMaxX = Math.max(...xValues);
        const rawMinY = Math.min(...yValues);
        const rawMaxY = Math.max(...yValues);

        // Add 20% padding
        const padX = (rawMaxX - rawMinX) * 0.2;
        const padY = (rawMaxY - rawMinY) * 0.2;
        const minX = rawMinX - padX;
        const minY = rawMinY - padY;
        const maxX = rawMaxX + padX;
        const maxY = rawMaxY + padY;

        // Get spatial reference from map
        const spatialRef = (map.spatialReference as Record<
          string,
          unknown
        >) || { wkid: 102_100 };

        // Try to create extent using ESRI constructor
        let extent: unknown;
        if (esri?.geometry?.Extent) {
          extent = new (
            esri.geometry.Extent as new (
              ...args: unknown[]
            ) => unknown
          )(minX, minY, maxX, maxY, spatialRef);
        } else {
          // Plain object fallback
          extent = {
            spatialReference: spatialRef,
            xmax: maxX,
            xmin: minX,
            ymax: maxY,
            ymin: minY,
          };
        }

        if (map.setExtent) {
          (map.setExtent as (ext: unknown, fit?: boolean) => void)(
            extent,
            true
          );
          return {
            extent: { minX, minY, maxX, maxY },
            success: true,
            usedConstructor: !!esri?.geometry?.Extent,
          };
        }
        return {
          error: "no setExtent",
          hasMethod: typeof map.setExtent,
          success: false,
        };
      },
      { coords }
    )
    .catch((error) => ({ success: false, error: `exception: ${error}` }));

  if (result.success) {
    console.log("  ✓ Zoomed to polygon extent");
  } else {
    console.log(`  ✗ zoomToPolygonExtent failed: ${JSON.stringify(result)}`);
  }
  return result.success;
}

// ============================================================================
// Template Selection
// ============================================================================

type TemplateElementLookup =
  | {
      found: false;
    }
  | {
      found: true;
      id: string;
      text: string;
      rect: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    };

/**
 * Activate "Disturbed Area" template by simulating full mouse events.
 * This triggers all the dojo/dijit event handlers properly.
 */
export async function activateDisturbedAreaTemplate(
  frame: Frame
): Promise<boolean> {
  // First, find the Disturbed Area template element
  const templateElement = await frame.evaluate<TemplateElementLookup>(() => {
    const tpicks = document.querySelectorAll("[id^='tpick-surface-']");
    for (const tpick of tpicks) {
      const text = tpick.textContent?.trim() || "";
      if (text.toLowerCase().includes("disturbed area")) {
        // Get element info for clicking
        const rect = (tpick as HTMLElement).getBoundingClientRect();
        return {
          found: true,
          id: tpick.id,
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          text: text.substring(0, 50),
        };
      }
    }
    return { found: false };
  });

  if (!(templateElement.found && "rect" in templateElement)) {
    console.log("    ✗ Disturbed Area element not found in DOM");
    return false;
  }
  const templateId = templateElement.id;
  if (!templateId) {
    console.log("    ✗ Disturbed Area element missing id");
    return false;
  }

  console.log(`    Found element: ${templateId}`);

  // Simulate full mouse events on the element
  const result = await frame.evaluate(
    ({ elementId }) => {
      const el = document.querySelector(`#${elementId}`);
      if (!el) {
        return { error: "element not found", success: false };
      }

      // Create and dispatch mousedown, mouseup, click events
      const rect = el.getBoundingClientRect();
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;

      const eventOptions = {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: centerX,
        clientY: centerY,
        view: window,
      };

      // Simulate mouseover/mouseenter first (dojo often needs these)
      el.dispatchEvent(new MouseEvent("mouseover", eventOptions));
      el.dispatchEvent(new MouseEvent("mouseenter", eventOptions));

      // Then mouse sequence
      el.dispatchEvent(new MouseEvent("mousedown", eventOptions));
      el.dispatchEvent(new MouseEvent("mouseup", eventOptions));
      el.dispatchEvent(new MouseEvent("click", eventOptions));

      // Check if selection changed
      const { dijit } = window as unknown as Record<
        string,
        { registry?: { byId?: (id: string) => unknown } }
      >;
      const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0") as
        | Record<string, unknown>
        | undefined;
      if (!editor) {
        return { error: "no editor after click", success: false };
      }

      const tp = editor.templatePicker as
        | { getSelected?: () => unknown }
        | undefined;
      const selected = tp?.getSelected ? tp.getSelected() : null;
      const drawToolbar = editor._drawToolbar as
        | Record<string, unknown>
        | undefined;

      return {
        geometryType: drawToolbar?._geometryType || "none",
        selected: selected ? "yes" : "no",
        success: true,
      };
    },
    { elementId: templateId }
  );

  if (result.success) {
    console.log(
      `    ✓ Clicked ${templateElement.id}: selected=${result.selected}, geometryType=${result.geometryType}`
    );
    await sleep(500);
    return true;
  }

  console.log(`    ✗ Click failed: ${JSON.stringify(result)}`);
  return false;
}

/**
 * Activate "Access Point" template by simulating full mouse events.
 */
export async function activateAccessPointTemplate(
  frame: Frame
): Promise<boolean> {
  const templateElement = await frame.evaluate<TemplateElementLookup>(() => {
    const tpicks = document.querySelectorAll("[id^='tpick-surface-']");
    for (const tpick of tpicks) {
      const text = tpick.textContent?.trim() || "";
      if (text.toLowerCase().includes("access point")) {
        const rect = (tpick as HTMLElement).getBoundingClientRect();
        return {
          found: true,
          id: tpick.id,
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          text: text.substring(0, 50),
        };
      }
    }
    return { found: false };
  });

  if (!(templateElement.found && "rect" in templateElement)) {
    console.log("    ✗ Access Point element not found in DOM");
    return false;
  }
  const templateId = templateElement.id;
  if (!templateId) {
    console.log("    ✗ Access Point element missing id");
    return false;
  }

  console.log(`    Found element: ${templateId}`);

  const result = await frame.evaluate(
    ({ elementId }) => {
      const el = document.querySelector(`#${elementId}`);
      if (!el) {
        return { error: "element not found", success: false };
      }

      // Clear any existing selection first — the TemplatePicker is a toggle
      // widget, so clicking the same template twice deselects it. Clearing
      // ensures every click is treated as a fresh selection.
      const { dijit } = window as unknown as Record<
        string,
        { registry?: { byId?: (id: string) => unknown } }
      >;
      const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0") as
        | Record<string, unknown>
        | undefined;
      if (editor) {
        const tp = editor.templatePicker as
          | { clearSelection?: () => void; getSelected?: () => unknown }
          | undefined;
        if (tp?.clearSelection) {
          tp.clearSelection();
        }
      }

      const rect = el.getBoundingClientRect();
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;

      const eventOptions = {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        clientX: centerX,
        clientY: centerY,
        view: window,
      };

      el.dispatchEvent(new MouseEvent("mouseover", eventOptions));
      el.dispatchEvent(new MouseEvent("mouseenter", eventOptions));
      el.dispatchEvent(new MouseEvent("mousedown", eventOptions));
      el.dispatchEvent(new MouseEvent("mouseup", eventOptions));
      el.dispatchEvent(new MouseEvent("click", eventOptions));

      if (!editor) {
        return { error: "no editor after click", success: false };
      }

      const tp = editor.templatePicker as
        | { getSelected?: () => unknown }
        | undefined;
      const selected = tp?.getSelected ? tp.getSelected() : null;
      const drawToolbar = editor._drawToolbar as
        | Record<string, unknown>
        | undefined;

      return {
        geometryType: drawToolbar?._geometryType || "none",
        selected: selected ? "yes" : "no",
        success: true,
      };
    },
    { elementId: templateId }
  );

  if (result.success && result.selected === "yes") {
    console.log(
      `    ✓ Clicked ${templateElement.id}: selected=${result.selected}, geometryType=${result.geometryType}`
    );
    await sleep(500);
    return true;
  }

  console.log(
    `    ✗ Click result: selected=${result.selected}, geometryType=${result.geometryType}`
  );
  return false;
}

/**
 * Select a drawing template by label text.
 * Routes to the appropriate template activation function.
 *
 * @param frame - ESRI iframe
 * @param label - Template label (e.g., "Disturbed Area", "Access Point")
 */
export async function selectTemplateByLabel(
  frame: Frame,
  label: string
): Promise<boolean> {
  console.log(`  Selecting template: ${label}`);

  // For Disturbed Area, activate the Disturbed Area layer + polygon mode
  if (label.toLowerCase().includes("disturbed")) {
    return activateDisturbedAreaTemplate(frame);
  }

  // For Access Point, activate the Access Point layer + point mode
  if (label.toLowerCase().includes("access")) {
    return activateAccessPointTemplate(frame);
  }

  // Fallback: try clicking by text content
  const templateInfo = await frame
    .evaluate(
      ({ label }) => {
        const tpicks = document.querySelectorAll("[id^='tpick-surface-']");
        for (const tpick of tpicks) {
          const text = tpick.textContent?.trim() || "";
          if (text.toLowerCase().includes(label.toLowerCase())) {
            return { found: true, id: tpick.id, text: text.slice(0, 40) };
          }
        }
        return { found: false };
      },
      { label }
    )
    .catch(() => ({ found: false }));

  if (templateInfo.found && "id" in templateInfo) {
    try {
      await frame.locator(`#${templateInfo.id}`).click({ timeout: 5000 });
      await sleep(500);
      console.log(
        `    ✓ Clicked template: ${templateInfo.text} (${templateInfo.id})`
      );
      return true;
    } catch (error) {
      console.log(`    ✗ Locator click failed: ${error}`);
    }
  }

  console.log(`    ✗ Template "${label}" not found`);
  return false;
}

// ============================================================================
// Coordinate Conversion & Drawing
// ============================================================================

/**
 * Convert lat/lng polygon coordinates to screen coordinates.
 * Returns coordinates relative to the map canvas, plus the map container offset.
 *
 * @param frame - ESRI iframe
 * @param polygon - Array of lat/lng coordinates
 * @returns Screen coordinates and map offset, or null on error
 */
export async function getScreenCoords(
  frame: Frame,
  polygon: { lat: number; lng: number }[]
): Promise<{
  coords: { x: number; y: number }[];
  mapOffset: { x: number; y: number };
} | null> {
  return await frame
    .evaluate(
      ({ coords }) => {
        const { dijit } = window as unknown as Record<
          string,
          { registry?: { byId?: (id: string) => unknown } }
        >;
        const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0");
        if (!editor) {
          return null;
        }

        const ed = editor as Record<string, unknown>;
        const map = ((ed._drawToolbar as Record<string, unknown>)?.map ||
          (ed.settings as Record<string, unknown>)?.map) as
          | Record<string, unknown>
          | undefined;
        if (!map) {
          return null;
        }

        const toScreen = map.toScreen as
          | ((pt: unknown) => { x: number; y: number })
          | undefined;
        if (!toScreen) {
          return null;
        }

        // Get the map container's position to calculate offset
        const mapContainer = (map.container || map.root || map._container) as
          | HTMLElement
          | undefined;
        let mapOffset = { x: 0, y: 0 };
        if (mapContainer) {
          const rect = mapContainer.getBoundingClientRect();
          mapOffset = { x: rect.x, y: rect.y };
        }

        const toWebMercator = (lat: number, lng: number) => ({
          spatialReference: (map.spatialReference as Record<
            string,
            unknown
          >) || { wkid: 102_100 },
          x: (lng * 20_037_508.34) / 180,
          y:
            Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) *
            (20_037_508.34 / Math.PI),
        });

        const screenPoints: { x: number; y: number }[] = [];
        for (const v of coords) {
          const mapPt = toWebMercator(v.lat, v.lng);
          const screen = toScreen.call(map, mapPt);
          screenPoints.push({ x: screen.x, y: screen.y });
        }

        return { coords: screenPoints, mapOffset };
      },
      { coords: polygon }
    )
    .catch(() => null);
}

/**
 * Draw a polygon on the map using mouse clicks.
 *
 * @param page - Playwright page (for mouse events)
 * @param frameBox - Position of the ESRI iframe in page coordinates
 * @param vertices - Screen coordinates of polygon vertices
 */
export async function drawPolygon(
  page: Page,
  frameBox: { x: number; y: number },
  vertices: { x: number; y: number }[]
): Promise<void> {
  // Check if last vertex is same as first (closing point) - skip it
  const first = vertices[0];
  const last = vertices.at(-1);
  const hasClosingPoint =
    first &&
    last &&
    Math.abs(first.x - last.x) < 5 &&
    Math.abs(first.y - last.y) < 5;

  const vertsToDraw = hasClosingPoint ? vertices.slice(0, -1) : vertices;
  console.log(
    `  Drawing polygon with ${vertsToDraw.length} vertices (original: ${vertices.length}, closing point: ${hasClosingPoint})...`
  );

  for (let i = 0; i < vertsToDraw.length; i++) {
    const v = vertsToDraw[i];
    if (!v) {
      throw new Error(`Vertex ${i} is undefined`);
    }
    const pageX = frameBox.x + v.x;
    const pageY = frameBox.y + v.y;
    console.log(
      `    Click ${i + 1}/${vertsToDraw.length}: (${pageX.toFixed(0)}, ${pageY.toFixed(0)})`
    );
    await page.mouse.click(pageX, pageY);
    await sleep(400);
  }

  // Double-click first vertex to complete
  if (first) {
    const closeX = frameBox.x + first.x;
    const closeY = frameBox.y + first.y;
    console.log(
      `    Double-click to close: (${closeX.toFixed(0)}, ${closeY.toFixed(0)})`
    );
    await page.mouse.dblclick(closeX, closeY);
    console.log("  ✓ Polygon completed");
  }
  await sleep(1000);
}

/**
 * Draw a point on the map using a single mouse click.
 *
 * @param page - Playwright page (for mouse events)
 * @param frameBox - Position of the ESRI iframe in page coordinates
 * @param point - Screen coordinates of the point
 */
export async function drawPoint(
  page: Page,
  frameBox: { x: number; y: number },
  point: { x: number; y: number }
): Promise<void> {
  const pageX = frameBox.x + point.x;
  const pageY = frameBox.y + point.y;
  console.log(`  Drawing point at: (${pageX.toFixed(0)}, ${pageY.toFixed(0)})`);
  await page.mouse.click(pageX, pageY);
  console.log("  ✓ Point placed");
  await sleep(500);
}
