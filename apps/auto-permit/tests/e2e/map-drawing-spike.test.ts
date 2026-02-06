/**
 * Map Drawing Spike Test
 *
 * Validates core assumptions for coordinate-based polygon drawing:
 * 1. Can we discover the ESRI MapView global object?
 * 2. Can we call view.toScreen() to convert coordinates?
 * 3. Can we draw a polygon via JS injection or mouse clicks?
 *
 * Run with: bun test tests/e2e/screenshots/map-drawing-spike.test.ts
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
  switchToAerialBasemap,
} from "@/portal/create/fill/page2/map";
import { deleteByApplicationId } from "@/portal/delete";
import { sleep } from "@/portal/utils/helpers";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

// Test config - spike tests only run when explicitly requested
const COMPANY_NAME = "Sundt Construction Inc";
const COPY_FROM_APP = process.env.COPY_FROM_APP_NUMBER || "D0062461";
const RUN_SPIKE = process.env.RUN_MAP_SPIKE === "true";

// Test location: Phoenix area (adjust as needed)
const TEST_LOCATION = {
  lat: 33.4484,
  lng: -112.074,
  address: "2901 W Durango St, Phoenix, AZ",
};

const harness = new PortalHarness();
let createdAppId: string | null = null;
let esriFrame: Frame | null = null;

/**
 * Wait for ESRI map to fully initialize (not just iframe load).
 * Polls for map canvas and view readiness.
 */
async function waitForMapReady(
  frame: Frame,
  maxWaitMs = 60_000
): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 2000;

  while (Date.now() - startTime < maxWaitMs) {
    const status = await frame
      .evaluate(() => {
        // Check for map canvas (indicates map has rendered)
        const canvas = document.querySelector("#map_container canvas");
        const hasCanvas = !!canvas;

        // Check for search input (indicates widgets loaded)
        const searchInput = document.querySelector(
          "#esri_dijit_Search_0_input"
        );
        const hasSearch = !!searchInput;

        // Check for any ESRI view object
        const viewCandidates = ["view", "mapView", "jimuMapView"];
        let viewFound = false;
        let viewReady = false;

        for (const name of viewCandidates) {
          try {
            const obj = (window as unknown as Record<string, unknown>)[name];
            if (obj && typeof obj === "object") {
              viewFound = true;
              // Check if view has ready property
              const r = (obj as { ready?: boolean }).ready;
              if (r === true) {
                viewReady = true;
              }
              // Check for jimuMapView.view pattern
              const inner = (obj as { view?: { ready?: boolean } }).view;
              if (inner?.ready === true) {
                viewReady = true;
              }
            }
          } catch {
            // Ignore cross-origin errors
          }
        }

        return { hasCanvas, hasSearch, viewFound, viewReady };
      })
      .catch(() => ({
        hasCanvas: false,
        hasSearch: false,
        viewFound: false,
        viewReady: false,
      }));

    console.log(
      `    canvas=${status.hasCanvas}, search=${status.hasSearch}, view=${status.viewFound}, ready=${status.viewReady}`
    );

    // Consider ready if we have canvas + search OR view is ready
    if ((status.hasCanvas && status.hasSearch) || status.viewReady) {
      return true;
    }

    await sleep(pollInterval);
  }

  return false;
}

const describeSuite = RUN_SPIKE ? describe : describe.skip;

describeSuite("Map Drawing Spike", () => {
  afterAll(async () => {
    await harness.teardown();
  });

  // ============================================================================
  // SETUP: Get to the map popup with drawing mode active
  // ============================================================================

  test(
    "1. setup: login, create app, open map popup",
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

      // Wait for map to actually load (not just the iframe)
      console.log("  Waiting for ESRI map to fully load...");
      const mapLoaded = await waitForMapReady(esriFrame, 60_000);
      console.log(`  Map loaded: ${mapLoaded}`);

      if (!mapLoaded) {
        // Take screenshot to see current state
        await mapPopup?.screenshot({
          path: "tests/e2e/screenshots/map-drawing-spike-not-loaded.png",
        });
        console.log(
          "  ⚠ Screenshot saved: tests/e2e/screenshots/map-drawing-spike-not-loaded.png"
        );
      }

      // Search for location to center the map
      await searchLocation(esriFrame, null, TEST_LOCATION.address);

      // Switch to aerial
      await switchToAerialBasemap(esriFrame);

      // Activate drawing mode
      await activateDrawingMode(esriFrame);

      console.log("  ✓ Setup complete - ready for spike tests");
    },
    TIMEOUTS.extended
  );

  // ============================================================================
  // SPIKE 1: Discover MapView global object
  // ============================================================================

  test(
    "2. spike: discover ArcGIS 3.x map object",
    async () => {
      expect(esriFrame).not.toBeNull();

      const discovery = await esriFrame?.evaluate(() => {
        const results: Record<string, unknown> = {};

        // ArcGIS 3.x: Map is typically accessed via dijit registry or global
        // Check dijit registry for map widgets
        try {
          const dijit = (
            window as unknown as Record<
              string,
              {
                registry?: {
                  toArray?: () => unknown[];
                  byId?: (id: string) => unknown;
                };
              }
            >
          ).dijit;

          if (dijit?.registry) {
            // Find all widgets
            const widgets = dijit.registry.toArray?.() || [];
            const widgetInfo = (
              widgets as { declaredClass?: string; id?: string }[]
            )
              .map((w) => ({ id: w.id, class: w.declaredClass }))
              .filter(
                (w) =>
                  w.class?.includes("esri") ||
                  w.id?.includes("map") ||
                  w.id?.includes("Map")
              );
            results["dijit.registry.widgets"] = widgetInfo;

            // Try to get map by common IDs
            const mapIds = ["map", "mapDiv", "map_container"];
            for (const id of mapIds) {
              const widget = dijit.registry.byId?.(id);
              if (widget) {
                const w = widget as {
                  declaredClass?: string;
                  extent?: unknown;
                  toScreen?: unknown;
                  toMap?: unknown;
                  graphics?: unknown;
                };
                results[`dijit.byId("${id}")`] = {
                  exists: true,
                  class: w.declaredClass,
                  hasExtent: !!w.extent,
                  hasToScreen: typeof w.toScreen === "function",
                  hasToMap: typeof w.toMap === "function",
                  hasGraphics: !!w.graphics,
                };
              }
            }
          }
        } catch (e) {
          results["dijit.registry"] = { error: String(e) };
        }

        // Check for global esri namespace (ArcGIS 3.x)
        try {
          const esri = (window as unknown as Record<string, unknown>).esri;
          if (esri) {
            results["window.esri"] = {
              exists: true,
              type: typeof esri,
              hasMap: !!(esri as { Map?: unknown }).Map,
              hasGraphic: !!(esri as { Graphic?: unknown }).Graphic,
              hasToolbars: !!(esri as { toolbars?: unknown }).toolbars,
            };
          }
        } catch (e) {
          results["window.esri"] = { error: String(e) };
        }

        // Check for map div with esri classes
        try {
          const mapContainer =
            document.getElementById("map_container") ||
            document.getElementById("map") ||
            document.querySelector(".esriMapContainer");
          if (mapContainer) {
            results.mapContainer = {
              id: mapContainer.id,
              className: mapContainer.className,
              hasCanvas: !!mapContainer.querySelector("canvas"),
              hasSvg: !!mapContainer.querySelector("svg"),
              childCount: mapContainer.children.length,
            };
          }
        } catch (e) {
          results.mapContainer = { error: String(e) };
        }

        // Try require to get map module (ArcGIS 3.x AMD pattern)
        try {
          const require = (window as unknown as Record<string, unknown>)
            .require as
            | ((deps: string[], cb: (...args: unknown[]) => void) => void)
            | undefined;

          if (typeof require === "function") {
            results.require = { exists: true, type: "AMD loader" };

            // Note: We can't synchronously get modules via require
            // But we can check if the map is available on a global
          }
        } catch {
          // Ignore
        }

        // Probe the Editor widget to find map reference
        try {
          const dijit = (
            window as unknown as Record<
              string,
              {
                registry?: {
                  byId?: (id: string) => unknown;
                };
              }
            >
          ).dijit;

          const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0");
          if (editor) {
            // Log all editor properties to understand its structure
            const editorProps = Object.keys(editor as object).slice(0, 30);
            results["editorWidget.keys"] = editorProps;

            // Check for map in various ways
            const ed = editor as Record<string, unknown>;
            results["editorWidget.map"] = {
              hasMap: "map" in ed,
              mapType: typeof ed.map,
              mapKeys: (() => {
                if (!ed.map) {
                  return null;
                }
                if (typeof ed.map === "object") {
                  return Object.keys(ed.map as object).slice(0, 20);
                }
                return String(ed.map);
              })(),
            };

            // If editor.map exists, check if it has toScreen
            if (ed.map && typeof ed.map === "object") {
              const mapObj = ed.map as Record<string, unknown>;
              results["editorWidget.map.methods"] = {
                hasToScreen: typeof mapObj.toScreen === "function",
                hasToMap: typeof mapObj.toMap === "function",
                hasGraphics: "graphics" in mapObj,
                hasExtent: "extent" in mapObj,
                declaredClass: mapObj.declaredClass,
              };
            }

            // Check _drawToolbar.map (Draw toolbar often holds map reference)
            if (ed._drawToolbar) {
              const toolbar = ed._drawToolbar as Record<string, unknown>;
              results["editorWidget._drawToolbar"] = {
                type: typeof toolbar,
                hasMap: "map" in toolbar,
                keys: Object.keys(toolbar).slice(0, 15),
              };
              if (toolbar.map && typeof toolbar.map === "object") {
                const toolbarMap = toolbar.map as Record<string, unknown>;
                results["editorWidget._drawToolbar.map"] = {
                  type: typeof toolbarMap,
                  hasToScreen: typeof toolbarMap.toScreen === "function",
                  hasGraphics: "graphics" in toolbarMap,
                  declaredClass: toolbarMap.declaredClass,
                };
              }
            }

            // Check settings.map
            if (ed.settings && typeof ed.settings === "object") {
              const settings = ed.settings as Record<string, unknown>;
              results["editorWidget.settings.keys"] = Object.keys(
                settings
              ).slice(0, 15);
              if (settings.map && typeof settings.map === "object") {
                const settingsMap = settings.map as Record<string, unknown>;
                results["editorWidget.settings.map"] = {
                  type: typeof settingsMap,
                  hasToScreen: typeof settingsMap.toScreen === "function",
                  hasGraphics: "graphics" in settingsMap,
                  declaredClass: settingsMap.declaredClass,
                };
              }
            }

            // Check for editLayers which often have _map reference
            if (ed.editLayers) {
              const layers = ed.editLayers as unknown[];
              results["editorWidget.editLayers.count"] = layers.length;
              if (layers.length > 0) {
                const layer = layers[0] as Record<string, unknown>;
                results["editorWidget.editLayers[0].keys"] = Object.keys(
                  layer
                ).slice(0, 20);
                results["editorWidget.editLayers[0]._map"] = {
                  has_map: "_map" in layer,
                  _mapType: typeof layer._map,
                };
                // The layer's _map is often the actual map
                if (layer._map && typeof layer._map === "object") {
                  const layerMap = layer._map as Record<string, unknown>;
                  results["editLayers[0]._map.methods"] = {
                    hasToScreen: typeof layerMap.toScreen === "function",
                    hasGraphics: "graphics" in layerMap,
                    declaredClass: layerMap.declaredClass,
                  };
                }
              }
            }
          }
        } catch (e) {
          results["editorWidget.error"] = String(e);
        }

        // Look for jimuMapView (Experience Builder pattern)
        try {
          const jimuMapView = (
            window as unknown as Record<
              string,
              {
                view?: { map?: unknown };
                jimuMapView?: unknown;
              }
            >
          ).jimuMapView;
          if (jimuMapView) {
            results.jimuMapView = {
              exists: true,
              hasView: !!jimuMapView.view,
              hasMap: !!jimuMapView.view?.map,
            };
          }
        } catch {
          // Ignore
        }

        return results;
      });

      console.log("\n  === ArcGIS 3.x Map Discovery Results ===");
      const discoveryObj = discovery ?? {};
      for (const [name, info] of Object.entries(discoveryObj)) {
        console.log(`  ${name}:`, JSON.stringify(info, null, 2));
      }

      // Check if we found a usable map object
      const hasMap = Object.entries(discoveryObj).some(
        ([_, info]) => (info as { hasToScreen?: boolean }).hasToScreen
      );
      if (hasMap) {
        console.log("\n  ✓ Found map object with toScreen()");
      } else {
        console.log(
          "\n  ⚠ No map.toScreen() found - will need async require() or different approach"
        );
      }
    },
    TIMEOUTS.standard
  );

  // ============================================================================
  // SPIKE 2: Test coordinate conversion (toScreen)
  // ============================================================================

  test(
    "3. spike: test coordinate conversion (ArcGIS 3.x)",
    async () => {
      expect(esriFrame).not.toBeNull();

      const conversionResult = await esriFrame?.evaluate(({ lat, lng }) => {
        // ArcGIS 3.x: Find map via dijit registry
        const dijit = (
          window as unknown as Record<
            string,
            {
              registry?: { byId?: (id: string) => unknown };
            }
          >
        ).dijit;

        if (!dijit?.registry?.byId) {
          return { success: false, error: "dijit.registry not available" };
        }

        // Try common map container IDs
        interface MapType {
          toScreen?: (p: unknown) => { x: number; y: number };
          extent?: { spatialReference?: { wkid?: number } };
          spatialReference?: { wkid?: number };
        }
        const mapIds = ["map", "mapDiv", "map_container", "esri_dijit_Map_0"];
        let map: MapType | null = null;

        for (const id of mapIds) {
          const widget = dijit.registry.byId(id);
          if (
            widget &&
            typeof (widget as { toScreen?: unknown }).toScreen === "function"
          ) {
            map = widget as MapType;
            break;
          }
        }

        // Try getting map from Editor widget via _drawToolbar.map or settings.map
        if (!map) {
          try {
            const editor = dijit.registry.byId?.("esri_dijit_editing_Editor_0");
            if (editor) {
              const ed = editor as Record<string, unknown>;

              // Check _drawToolbar.map (primary path)
              const drawToolbar = ed._drawToolbar as
                | Record<string, unknown>
                | undefined;
              if (
                drawToolbar?.map &&
                typeof (drawToolbar.map as { toScreen?: unknown }).toScreen ===
                  "function"
              ) {
                map = drawToolbar.map as MapType;
              }

              // Fallback: settings.map
              if (!map) {
                const settings = ed.settings as
                  | Record<string, unknown>
                  | undefined;
                if (
                  settings?.map &&
                  typeof (settings.map as { toScreen?: unknown }).toScreen ===
                    "function"
                ) {
                  map = settings.map as MapType;
                }
              }
            }
          } catch {
            // Ignore
          }
        }

        if (!map?.toScreen) {
          return {
            success: false,
            error:
              "Map with toScreen() not found via editor._drawToolbar.map or settings.map",
          };
        }

        try {
          // Get the map's spatial reference
          const mapWithExtent = map as {
            extent?: { spatialReference?: { wkid?: number } };
            spatialReference?: { wkid?: number };
            toScreen: (p: unknown) => { x: number; y: number };
          };
          const spatialRef =
            mapWithExtent.extent?.spatialReference ||
            mapWithExtent.spatialReference;
          const wkid = spatialRef?.wkid || 102_100; // Default to Web Mercator

          // Convert lat/lng to Web Mercator
          const webMercatorX = (lng * 20_037_508.34) / 180;
          const webMercatorY =
            Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) *
            (20_037_508.34 / Math.PI);

          // ArcGIS 3.x Point constructor (if available) or plain object
          const esri = (
            window as unknown as Record<
              string,
              {
                geometry?: {
                  Point?: new (x: number, y: number, sr: unknown) => unknown;
                };
              }
            >
          ).esri;
          let point: unknown;

          if (esri?.geometry?.Point) {
            point = new esri.geometry.Point(webMercatorX, webMercatorY, {
              wkid,
            });
          } else {
            // Plain object fallback
            point = {
              x: webMercatorX,
              y: webMercatorY,
              spatialReference: { wkid },
              type: "point",
            };
          }

          const screenPoint = mapWithExtent.toScreen(point);

          return {
            success: true,
            input: { lat, lng },
            webMercator: { x: webMercatorX, y: webMercatorY },
            screen: { x: screenPoint.x, y: screenPoint.y },
            mapWkid: wkid,
          };
        } catch (err) {
          return {
            success: false,
            error: String(err),
          };
        }
      }, TEST_LOCATION);

      console.log("\n  === Coordinate Conversion Results (ArcGIS 3.x) ===");
      console.log("  ", JSON.stringify(conversionResult, null, 2));

      if (conversionResult?.success) {
        console.log("\n  ✓ Coordinate conversion works!");
        console.log(`    lat/lng: ${TEST_LOCATION.lat}, ${TEST_LOCATION.lng}`);
        const result = conversionResult as { screen: { x: number; y: number } };
        console.log(
          `    screen:  ${result.screen.x.toFixed(0)}, ${result.screen.y.toFixed(0)}`
        );
      }
    },
    TIMEOUTS.standard
  );

  // ============================================================================
  // SPIKE 3: Attempt polygon drawing via mouse clicks
  // ============================================================================

  test(
    "4. spike: attempt polygon drawing via mouse (ArcGIS 3.x)",
    async () => {
      expect(esriFrame).not.toBeNull();

      // Get the iframe's bounding box for coordinate offset
      const frameElement = await esriFrame?.frameElement();
      const boundingBox = await frameElement?.boundingBox();

      console.log("\n  === Iframe Bounding Box ===");
      console.log("  ", boundingBox);

      if (!boundingBox) {
        console.log("  ⚠ Could not get iframe bounding box");
        return;
      }

      // Get current map center in screen coordinates (ArcGIS 3.x)
      const mapInfo = await esriFrame?.evaluate(() => {
        const dijit = (
          window as unknown as Record<
            string,
            {
              registry?: {
                byId?: (id: string) => unknown;
                toArray?: () => unknown[];
              };
            }
          >
        ).dijit;

        if (!dijit?.registry) {
          return { error: "dijit.registry not available" };
        }

        // Find map
        interface MapInfoType {
          toScreen?: (p: unknown) => { x: number; y: number };
          extent?: { getCenter?: () => unknown };
          width?: number;
          height?: number;
        }
        const mapIds = ["map", "mapDiv", "map_container"];
        let map: MapInfoType | null = null;

        for (const id of mapIds) {
          const widget = dijit.registry.byId?.(id);
          if (
            widget &&
            typeof (widget as { toScreen?: unknown }).toScreen === "function"
          ) {
            map = widget as MapInfoType;
            break;
          }
        }

        // Try getting map from Editor widget via _drawToolbar.map or settings.map
        if (!map) {
          const editor = dijit.registry.byId?.("esri_dijit_editing_Editor_0");
          if (editor) {
            const ed = editor as Record<string, unknown>;

            // Check _drawToolbar.map (primary path)
            const drawToolbar = ed._drawToolbar as
              | Record<string, unknown>
              | undefined;
            if (
              drawToolbar?.map &&
              typeof (drawToolbar.map as { toScreen?: unknown }).toScreen ===
                "function"
            ) {
              map = drawToolbar.map as MapInfoType;
            }

            // Fallback: settings.map
            if (!map) {
              const settings = ed.settings as
                | Record<string, unknown>
                | undefined;
              if (
                settings?.map &&
                typeof (settings.map as { toScreen?: unknown }).toScreen ===
                  "function"
              ) {
                map = settings.map as MapInfoType;
              }
            }
          }
        }

        if (!(map?.toScreen && map?.extent?.getCenter)) {
          // Fallback: just return map dimensions for center calculation
          const container =
            document.getElementById("map_container") ||
            document.querySelector(".esriMapContainer");
          if (container) {
            const rect = container.getBoundingClientRect();
            return {
              fallback: true,
              width: rect.width,
              height: rect.height,
              center: { x: rect.width / 2, y: rect.height / 2 },
            };
          }
          return { error: "Map not found" };
        }

        try {
          const mapWithMethods = map as {
            extent: { getCenter: () => unknown };
            toScreen: (p: unknown) => { x: number; y: number };
            width?: number;
            height?: number;
          };
          const center = mapWithMethods.extent.getCenter();
          const screenCenter = mapWithMethods.toScreen(center);
          return {
            center: { x: screenCenter.x, y: screenCenter.y },
            width: mapWithMethods.width,
            height: mapWithMethods.height,
          };
        } catch (err) {
          return { error: String(err) };
        }
      });

      console.log("\n  === Map Info (ArcGIS 3.x) ===");
      console.log("  ", mapInfo);

      // Use center from map or fallback to iframe center
      let centerX: number;
      let centerY: number;

      if (mapInfo && "center" in mapInfo && mapInfo.center) {
        centerX = mapInfo.center.x;
        centerY = mapInfo.center.y;
      } else {
        // Fallback to iframe center
        centerX = boundingBox.width / 2;
        centerY = boundingBox.height / 2;
        console.log("  Using iframe center as fallback");
      }

      // Draw a small triangle around the center
      const offsetX = boundingBox.x;
      const offsetY = boundingBox.y;

      const vertices = [
        { x: centerX, y: centerY - 50 }, // Top
        { x: centerX - 50, y: centerY + 50 }, // Bottom left
        { x: centerX + 50, y: centerY + 50 }, // Bottom right
      ];

      console.log("\n  === Drawing Triangle ===");
      console.log("  Center:", { x: centerX, y: centerY });
      console.log("  Vertices (screen):", vertices);

      // Get the popup page (parent of the frame)
      const popupPage = esriFrame?.page();
      if (!popupPage) {
        throw new Error("popupPage is undefined");
      }

      // Click each vertex with delays
      for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        if (!v) {
          throw new Error(`Vertex at index ${i} is undefined`);
        }
        const pageX = offsetX + v.x;
        const pageY = offsetY + v.y;

        console.log(
          `  Click ${i + 1}: (${pageX.toFixed(0)}, ${pageY.toFixed(0)})`
        );
        await popupPage.mouse.click(pageX, pageY);
        await sleep(800);
      }

      // Double-click to complete the polygon
      const firstVertex = vertices[0];
      if (!firstVertex) {
        throw new Error("First vertex is undefined");
      }
      const closeX = offsetX + firstVertex.x;
      const closeY = offsetY + firstVertex.y;

      console.log(
        `  Double-click to close: (${closeX.toFixed(0)}, ${closeY.toFixed(0)})`
      );
      await popupPage.mouse.dblclick(closeX, closeY);
      await sleep(1500);

      // Check if a graphic was added (ArcGIS 3.x)
      const graphicCheck = await esriFrame?.evaluate(() => {
        const dijit = (
          window as unknown as Record<
            string,
            {
              registry?: {
                byId?: (id: string) => unknown;
                toArray?: () => unknown[];
              };
            }
          >
        ).dijit;

        if (!dijit?.registry) {
          return { error: "dijit.registry not available" };
        }

        // Find map and check graphics
        const mapIds = ["map", "mapDiv", "map_container"];
        for (const id of mapIds) {
          const widget = dijit.registry.byId?.(id);
          if (widget) {
            const map = widget as {
              graphics?: { length?: number };
              graphicsLayerIds?: string[];
            };
            if (map.graphics) {
              return {
                found: true,
                graphicsCount: map.graphics.length ?? 0,
                graphicsLayerIds: map.graphicsLayerIds,
              };
            }
          }
        }

        // Check for any graphics layers
        const widgets = dijit.registry.toArray?.() || [];
        const graphicsLayers = (
          widgets as { declaredClass?: string; graphics?: { length: number } }[]
        )
          .filter((w) => w.declaredClass?.includes("Graphics"))
          .map((w) => ({ class: w.declaredClass, count: w.graphics?.length }));

        return {
          found: graphicsLayers.length > 0,
          graphicsLayers,
        };
      });

      console.log("\n  === Graphics Check (ArcGIS 3.x) ===");
      console.log("  ", graphicCheck);

      // Take a screenshot for visual verification
      await popupPage.screenshot({
        path: "tests/e2e/screenshots/map-drawing-spike-result.png",
      });
      console.log(
        "\n  Screenshot saved: tests/e2e/screenshots/map-drawing-spike-result.png"
      );
    },
    TIMEOUTS.extended
  );

  // ============================================================================
  // SPIKE 4: Attempt polygon drawing via JS injection (ESRI Draw API)
  // ============================================================================

  test(
    "5. spike: attempt polygon via JS injection (ArcGIS 3.x)",
    async () => {
      expect(esriFrame).not.toBeNull();

      const drawResult = await esriFrame?.evaluate(() => {
        try {
          const dijit = (
            window as unknown as Record<
              string,
              {
                registry?: {
                  byId?: (id: string) => unknown;
                  toArray?: () => unknown[];
                };
              }
            >
          ).dijit;

          const esriGlobal = (
            window as unknown as Record<
              string,
              {
                Graphic?: new (geometry: unknown, symbol: unknown) => unknown;
                geometry?: {
                  Polygon?: new (
                    sr: unknown
                  ) => { addRing: (ring: number[][]) => void };
                };
                symbol?: {
                  SimpleFillSymbol?: new () => {
                    setColor: (c: unknown) => void;
                    setOutline: (o: unknown) => void;
                  };
                };
                Color?: new (c: number[]) => unknown;
                symbols?: {
                  SimpleLineSymbol?: new () => {
                    setColor: (c: unknown) => void;
                    setWidth: (w: number) => void;
                  };
                };
              }
            >
          ).esri;

          if (!(dijit?.registry && esriGlobal)) {
            return {
              success: false,
              error: "dijit.registry or esri global not available",
            };
          }

          // Find map
          interface DrawMapType {
            graphics?: { add: (g: unknown) => void; length?: number };
            extent?: {
              getCenter?: () => { x: number; y: number };
              spatialReference?: unknown;
            };
            spatialReference?: unknown;
          }
          const mapIds = ["map", "mapDiv", "map_container"];
          let map: DrawMapType | null = null;

          for (const id of mapIds) {
            const widget = dijit.registry.byId?.(id);
            if (widget && (widget as { graphics?: unknown }).graphics) {
              map = widget as DrawMapType;
              break;
            }
          }

          // Try getting map from Editor widget via _drawToolbar.map or settings.map
          if (!map) {
            const editor = dijit.registry.byId?.("esri_dijit_editing_Editor_0");
            if (editor) {
              const ed = editor as Record<string, unknown>;

              // Check _drawToolbar.map (primary path)
              const drawToolbar = ed._drawToolbar as
                | Record<string, unknown>
                | undefined;
              if (drawToolbar?.map) {
                const tbMap = drawToolbar.map as DrawMapType | null;
                if (tbMap?.graphics) {
                  map = tbMap;
                }
              }

              // Fallback: settings.map
              if (!map) {
                const settings = ed.settings as
                  | Record<string, unknown>
                  | undefined;
                if (settings?.map) {
                  const sMap = settings.map as DrawMapType | null;
                  if (sMap?.graphics) {
                    map = sMap;
                  }
                }
              }
            }
          }

          if (!map?.graphics) {
            return {
              success: false,
              error:
                "Map graphics layer not found via editor._drawToolbar.map or settings.map",
            };
          }

          // Get map center and spatial reference
          const mapWithExtent = map as {
            graphics: { add: (g: unknown) => void; length?: number };
            extent?: {
              getCenter?: () => { x: number; y: number };
              spatialReference?: unknown;
            };
            spatialReference?: unknown;
          };
          const center = mapWithExtent.extent?.getCenter?.();
          const spatialRef =
            mapWithExtent.extent?.spatialReference ||
            mapWithExtent.spatialReference;

          if (!center) {
            return { success: false, error: "Could not get map center" };
          }

          // Create a small triangle polygon around center (in map units - Web Mercator meters)
          const offset = 200; // meters
          const ring = [
            [center.x, center.y + offset], // Top
            [center.x - offset, center.y - offset], // Bottom left
            [center.x + offset, center.y - offset], // Bottom right
            [center.x, center.y + offset], // Close the ring
          ];

          // Try to create graphic using ESRI constructors if available
          let graphic: unknown;

          if (esriGlobal.Graphic && esriGlobal.geometry?.Polygon) {
            // Use proper ESRI constructors
            const polygon = new esriGlobal.geometry.Polygon(spatialRef);
            polygon.addRing(ring);

            // Create symbol
            let symbol: unknown;
            if (esriGlobal.symbol?.SimpleFillSymbol && esriGlobal.Color) {
              const fillSymbol = new esriGlobal.symbol.SimpleFillSymbol();
              fillSymbol.setColor(new esriGlobal.Color([255, 0, 0, 0.5]));
              if (esriGlobal.symbols?.SimpleLineSymbol) {
                const outline = new esriGlobal.symbols.SimpleLineSymbol();
                outline.setColor(new esriGlobal.Color([255, 0, 0]));
                outline.setWidth(2);
                fillSymbol.setOutline(outline);
              }
              symbol = fillSymbol;
            } else {
              // Fallback symbol object
              symbol = {
                type: "esriSFS",
                style: "esriSFSSolid",
                color: [255, 0, 0, 128],
                outline: {
                  type: "esriSLS",
                  style: "esriSLSSolid",
                  color: [255, 0, 0, 255],
                  width: 2,
                },
              };
            }

            graphic = new esriGlobal.Graphic(polygon, symbol);
          } else {
            // Fallback: plain object (may not work)
            graphic = {
              geometry: {
                type: "polygon",
                rings: [ring],
                spatialReference: spatialRef,
              },
              symbol: {
                type: "esriSFS",
                style: "esriSFSSolid",
                color: [255, 0, 0, 128],
                outline: {
                  type: "esriSLS",
                  style: "esriSLSSolid",
                  color: [255, 0, 0, 255],
                  width: 2,
                },
              },
            };
          }

          // Add graphic to map
          mapWithExtent.graphics.add(graphic);

          return {
            success: true,
            method: "map.graphics.add",
            center: { x: center.x, y: center.y },
            graphicsCount: mapWithExtent.graphics.length ?? "unknown",
            usedConstructors: !!esriGlobal.Graphic,
          };
        } catch (err) {
          return {
            success: false,
            error: String(err),
          };
        }
      });

      console.log("\n  === JS Injection Draw Results (ArcGIS 3.x) ===");
      console.log("  ", JSON.stringify(drawResult, null, 2));

      if (drawResult?.success) {
        console.log("\n  ✓ JS injection drawing works!");
      } else {
        console.log("\n  ⚠ JS injection failed:", drawResult?.error);
      }

      // Screenshot after JS injection attempt
      const popupPage = esriFrame?.page();
      if (!popupPage) {
        throw new Error("popupPage is undefined");
      }
      await sleep(1000); // Wait for graphic to render
      await popupPage.screenshot({
        path: "tests/e2e/screenshots/map-drawing-spike-js-result.png",
      });
      console.log(
        "  Screenshot saved: tests/e2e/screenshots/map-drawing-spike-js-result.png"
      );
    },
    TIMEOUTS.standard
  );

  // ============================================================================
  // CLEANUP
  // ============================================================================

  test(
    "6. cleanup: delete draft",
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
