/**
 * Map Feature Reading Spike Test
 *
 * Explores whether we can read existing polygon/point features from a permit's map.
 * Uses the REVISE workflow to open an Active permit for editing, then reads map data.
 *
 * Run with: HEADLESS=false REVISE_PERMIT_ID=D0062964 bun test tests/e2e/map-read-features-spike.test.ts
 */

import { afterAll, describe, expect, test } from "bun:test";
import type { Frame, Page } from "playwright";

import {
  createReviseApplication,
  getCurrentPage,
  goToPage,
  isOnDustAppsPage,
} from "@/portal/create";
import { findEsriFrame } from "@/portal/create/fill/page2/map";
import { deleteByApplicationId } from "@/portal/delete";
import {
  clickInFrames,
  findFrameWithSelector,
  setCheckbox,
  sleep,
  waitForPopup,
} from "@/portal/utils/helpers";
import { PortalHarness } from "./utils/harness";
import { TIMEOUTS } from "./utils/timeouts";

// =============================================================================
// CONFIG
// =============================================================================

const TEST_PERMIT_ID = process.env.REVISE_PERMIT_ID ?? "";
const RUN_SPIKE = TEST_PERMIT_ID !== "";

// =============================================================================
// TYPES
// =============================================================================

interface MapFeature {
  attributes?: Record<string, unknown>;
  coordinates: { lat: number; lng: number }[];
  source: string;
  type: "polygon" | "point" | "polyline" | "unknown";
}

interface MapFeaturesResult {
  debug?: unknown;
  error?: string;
  features: MapFeature[];
  success: boolean;
}

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

/**
 * Wait for Editor widget to be fully loaded.
 * Copied from map-full-workflow.test.ts
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
 * Convert Web Mercator coordinates to WGS84 (lat/lng).
 */
function webMercatorToLatLng(
  x: number,
  y: number
): { lat: number; lng: number } {
  const lng = (x * 180) / 20_037_508.34;
  const lat =
    (Math.atan(Math.exp((y * Math.PI) / 20_037_508.34)) * 360) / Math.PI - 90;
  return { lat, lng };
}

/**
 * Read all features from the map's graphics layers.
 * Uses map._layers instead of getLayer() since getLayer() throws in this ESRI version.
 */
async function readMapFeatures(frame: Frame): Promise<MapFeaturesResult> {
  console.log("\n[READ MAP FEATURES]");

  const result = await frame
    .evaluate(() => {
      const { dijit } = window as unknown as Record<
        string,
        {
          registry?: { byId?: (id: string) => unknown };
        }
      >;

      const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0");
      if (!editor) {
        return {
          error: "Editor widget not found",
          features: [],
          success: false,
        };
      }

      const ed = editor as Record<string, unknown>;
      const map = ((ed._drawToolbar as Record<string, unknown>)?.map ||
        (ed.settings as Record<string, unknown>)?.map) as
        | Record<string, unknown>
        | undefined;

      if (!map) {
        return { error: "Map not found", features: [], success: false };
      }

      const allFeatures: {
        type: string;
        coordinates: Array<{ x: number; y: number }>;
        attributes?: Record<string, unknown>;
        source: string;
      }[] = [];

      // Access layers via _layers (getLayer() throws in this ESRI version)
      const _layers = map._layers as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (!_layers) {
        return { error: "No _layers found", features: [], success: false };
      }

      const layerKeys = Object.keys(_layers);
      const layerStats: Record<string, number> = {};
      const rawGraphicsDebug: {
        layerId: string;
        geomType: string | null;
        geomKeys: string[];
        hasRings: boolean;
        ringCount?: number;
        firstRingLength?: number;
        rawCoords?: unknown;
        hasPaths?: boolean;
        pathCount?: number;
        pointX?: number;
        pointY?: number;
        spatialRef?: unknown;
        graphicKeys?: string[];
        attributes?: unknown;
        symbol?: string[] | null;
      }[] = [];

      for (const layerId of layerKeys) {
        const layer = _layers[layerId];
        if (!layer) {
          continue;
        }

        const graphics = layer.graphics as
          | Record<string, unknown>[]
          | undefined;
        if (!(graphics && Array.isArray(graphics))) {
          continue;
        }

        layerStats[layerId] = graphics.length;

        for (const graphic of graphics) {
          const geom = graphic.geometry as Record<string, unknown> | undefined;
          if (!geom) {
            continue;
          }

          // Debug: capture raw geometry info
          const geomKeys = Object.keys(geom);
          const rings = geom.rings as unknown[][] | undefined;
          const paths = geom.paths as unknown[][] | undefined;
          rawGraphicsDebug.push({
            layerId,
            geomType: (geom.type as string) || null,
            geomKeys,
            hasRings: !!rings,
            ringCount: rings?.length,
            firstRingLength: rings?.[0]?.length,
            rawCoords: rings?.[0]?.slice(0, 3), // First 3 coords of first ring
            hasPaths: !!paths,
            pathCount: paths?.length,
            // For point geometry, capture actual x/y
            pointX: geom.x as number | undefined,
            pointY: geom.y as number | undefined,
            spatialRef: (geom.spatialReference as Record<string, unknown>)
              ?.wkid,
            // Also capture the full graphic info
            graphicKeys: Object.keys(graphic),
            attributes: graphic.attributes,
            symbol: graphic.symbol
              ? Object.keys(graphic.symbol as object)
              : null,
          });

          const geomType = geom.type as string | undefined;
          if (geomType === "polygon" && geom.rings) {
            const rings = geom.rings as number[][][];
            for (const ring of rings) {
              const coords = ring
                .filter((pt): pt is [number, number] => pt.length >= 2)
                .map(([x, y]) => ({ x, y }));
              allFeatures.push({
                attributes: graphic.attributes as
                  | Record<string, unknown>
                  | undefined,
                coordinates: coords,
                source: layerId,
                type: "polygon",
              });
            }
          } else if (geomType === "point" && geom.x !== undefined) {
            allFeatures.push({
              attributes: graphic.attributes as
                | Record<string, unknown>
                | undefined,
              coordinates: [{ x: geom.x as number, y: geom.y as number }],
              source: layerId,
              type: "point",
            });
          } else if (geomType === "polyline" && geom.paths) {
            const paths = geom.paths as number[][][];
            for (const path of paths) {
              const coords = path
                .filter((pt): pt is [number, number] => pt.length >= 2)
                .map(([x, y]) => ({ x, y }));
              allFeatures.push({
                attributes: graphic.attributes as
                  | Record<string, unknown>
                  | undefined,
                coordinates: coords,
                source: layerId,
                type: "polyline",
              });
            }
          }
        }
      }

      // Also check if there's a map.graphics object (sometimes polygons go here)
      const mapGraphicsObj = map.graphics as
        | Record<string, unknown>
        | undefined;
      let mapGraphicsInfo: { count: number; types: string[] } | null = null;
      if (mapGraphicsObj) {
        const graphicsArr = (
          mapGraphicsObj as unknown as { graphics?: unknown[] }
        ).graphics;
        if (graphicsArr && Array.isArray(graphicsArr)) {
          mapGraphicsInfo = {
            count: graphicsArr.length,
            types: graphicsArr.map((g) => {
              const geom = (g as Record<string, unknown>).geometry as Record<
                string,
                unknown
              >;
              return (geom?.type as string) || "no geometry";
            }),
          };
        }
      }

      return {
        debug: {
          layerKeys,
          layerStats,
          rawGraphicsDebug,
          mapGraphicsInfo,
        },
        features: allFeatures,
        success: true,
      };
    })
    .catch((error) => ({
      success: false,
      error: String(error),
      features: [],
    }));

  if (!result.success) {
    console.log(`  ✗ ${result.error}`);
    return { error: result.error, features: [], success: false };
  }

  // Convert Web Mercator to lat/lng
  const rawFeatures = result.features as {
    type: string;
    coordinates: Array<{ x: number; y: number }>;
    attributes?: Record<string, unknown>;
    source: string;
  }[];

  const features: MapFeature[] = rawFeatures.map((f) => ({
    attributes: f.attributes,
    coordinates: f.coordinates.map((c) => webMercatorToLatLng(c.x, c.y)),
    source: f.source,
    type: f.type as MapFeature["type"],
  }));

  console.log(`  Found ${features.length} features`);
  console.log("  Debug:", (result as { debug?: unknown }).debug);

  return {
    debug: (result as { debug?: unknown }).debug,
    features,
    success: true,
  };
}

/**
 * Query the ArcGIS REST API directly to get all features for a permit.
 * This is the reliable way to read polygon data regardless of map extent.
 */
async function queryPermitFeaturesFromREST(
  frame: Frame,
  permitId: string
): Promise<MapFeaturesResult> {
  console.log(`\n[QUERY REST API FOR ${permitId}]`);

  const baseUrl =
    "https://gis.maricopa.gov/arcgis/rest/services/AQD/DustControl/FeatureServer";

  const result = await frame.evaluate(
    async (args: { baseUrl: string; permitId: string }) => {
      const { baseUrl, permitId } = args;
      const allFeatures: {
        type: string;
        coordinates: Array<{ x: number; y: number }>;
        attributes?: Record<string, unknown>;
        source: string;
        layerIndex: number;
      }[] = [];

      const layerStats: Record<string, number> = {};

      for (let layerIndex = 0; layerIndex <= 5; layerIndex++) {
        try {
          const queryUrl = `${baseUrl}/${layerIndex}/query?where=ImpactID%3D%27${permitId}%27&outFields=*&returnGeometry=true&f=json`;
          const response = await fetch(queryUrl);
          const data = (await response.json()) as {
            features?: {
              geometry?: {
                rings?: number[][][];
                paths?: number[][][];
                x?: number;
                y?: number;
              };
              attributes?: Record<string, unknown>;
            }[];
            error?: { message: string };
            geometryType?: string;
          };

          if (data.error) {
            layerStats[`layer${layerIndex}`] = 0;
            continue;
          }

          layerStats[`layer${layerIndex}`] = data.features?.length ?? 0;

          for (const feature of data.features ?? []) {
            const geom = feature.geometry;
            if (!geom) {
              continue;
            }

            if (geom.rings) {
              // Polygon
              for (const ring of geom.rings) {
                const coords = ring.map((coord) => ({
                  x: coord[0] ?? 0,
                  y: coord[1] ?? 0,
                }));
                allFeatures.push({
                  attributes: feature.attributes,
                  coordinates: coords,
                  layerIndex,
                  source: `REST/layer${layerIndex}`,
                  type: "polygon",
                });
              }
            } else if (geom.paths) {
              // Polyline
              for (const path of geom.paths) {
                const coords = path.map((coord) => ({
                  x: coord[0] ?? 0,
                  y: coord[1] ?? 0,
                }));
                allFeatures.push({
                  attributes: feature.attributes,
                  coordinates: coords,
                  layerIndex,
                  source: `REST/layer${layerIndex}`,
                  type: "polyline",
                });
              }
            } else if (geom.x !== undefined && geom.y !== undefined) {
              // Point
              allFeatures.push({
                attributes: feature.attributes,
                coordinates: [{ x: geom.x, y: geom.y }],
                layerIndex,
                source: `REST/layer${layerIndex}`,
                type: "point",
              });
            }
          }
        } catch {
          layerStats[`layer${layerIndex}`] = -1;
        }
      }

      return { features: allFeatures, layerStats };
    },
    { baseUrl, permitId }
  );

  // Convert Web Mercator to lat/lng
  const features: MapFeature[] = result.features.map((f) => ({
    attributes: f.attributes,
    coordinates: f.coordinates.map((c) => webMercatorToLatLng(c.x, c.y)),
    source: f.source,
    type: f.type as MapFeature["type"],
  }));

  console.log(`  Layer stats: ${JSON.stringify(result.layerStats)}`);
  console.log(`  Total features found: ${features.length}`);

  return {
    debug: result.layerStats,
    features,
    success: true,
  };
}

/**
 * Check what feature services the map is configured to use.
 */
async function checkFeatureServiceUrls(frame: Frame): Promise<void> {
  console.log("\n[CHECK FEATURE SERVICE URLS]");

  const serviceInfo = await frame.evaluate(() => {
    const { dijit } = window as unknown as Record<
      string,
      {
        registry?: { byId?: (id: string) => unknown };
      }
    >;

    const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0");
    if (!editor) {
      return { error: "No editor" };
    }

    const ed = editor as Record<string, unknown>;
    const map = ((ed._drawToolbar as Record<string, unknown>)?.map ||
      (ed.settings as Record<string, unknown>)?.map) as
      | Record<string, unknown>
      | undefined;

    if (!map) {
      return { error: "No map" };
    }

    const _layers = map._layers as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (!_layers) {
      return { error: "No _layers" };
    }

    const featureLayerInfo: {
      id: string;
      url?: string;
      mode?: unknown;
      objectIdField?: string;
      capabilities?: string;
      hasEditingCapability?: boolean;
    }[] = [];

    for (const [id, layer] of Object.entries(_layers)) {
      if (layer.declaredClass === "esri.layers.FeatureLayer") {
        featureLayerInfo.push({
          capabilities: layer.capabilities as string | undefined,
          hasEditingCapability: !!(layer.capabilities as string)?.includes(
            "Editing"
          ),
          id,
          mode: layer.mode,
          objectIdField: layer.objectIdField as string | undefined,
          url: layer.url as string | undefined,
        });
      }
    }

    // Also check editor settings for configured layers
    const editorSettings = ed.settings as Record<string, unknown> | undefined;
    const editorLayersRaw = editorSettings?.layers as unknown[] | undefined;
    const configuredLayers = editorLayersRaw?.map((l) => {
      const layer = l as Record<string, unknown>;
      return {
        declaredClass: layer.declaredClass,
        id: layer.id,
        url: layer.url,
      };
    });

    return {
      configuredLayers,
      editorSettingsKeys: editorSettings ? Object.keys(editorSettings) : [],
      featureLayerInfo,
    };
  });

  console.log("  Service info:", JSON.stringify(serviceInfo, null, 2));
}

/**
 * Wait for FeatureLayer data to load.
 * Polls the graphics count in FeatureLayers until non-zero or timeout.
 */
async function waitForFeatureData(
  frame: Frame,
  maxWaitMs = 30_000
): Promise<{ loaded: boolean; layerCounts: Record<string, number> }> {
  console.log("\n[WAITING FOR FEATURE DATA]");
  const startTime = Date.now();
  const pollInterval = 2000;

  while (Date.now() - startTime < maxWaitMs) {
    const counts = await frame
      .evaluate(() => {
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
          | Record<string, unknown>
          | undefined;

        if (!map) {
          return null;
        }

        const _layers = map._layers as
          | Record<string, Record<string, unknown>>
          | undefined;
        if (!_layers) {
          return null;
        }

        const counts: Record<string, number> = {};
        for (const [id, layer] of Object.entries(_layers)) {
          const graphics = layer.graphics as unknown[] | undefined;
          if (graphics && Array.isArray(graphics)) {
            counts[id] = graphics.length;
          }
        }
        return counts;
      })
      .catch(() => null);

    if (!counts) {
      await sleep(pollInterval);
      continue;
    }

    // Check if any FeatureLayer (graphicsLayer1-6) has data
    const featureLayerIds = Object.keys(counts).filter((id) =>
      id.startsWith("graphicsLayer")
    );
    const totalFeatureGraphics = featureLayerIds.reduce(
      (sum, id) => sum + (counts[id] ?? 0),
      0
    );

    const elapsed = Date.now() - startTime;
    console.log(
      `  ${elapsed}ms: map_graphics=${counts.map_graphics ?? 0}, featureLayers=${totalFeatureGraphics}`
    );

    if (totalFeatureGraphics > 0) {
      console.log("  ✓ Feature data loaded!");
      return { layerCounts: counts, loaded: true };
    }

    await sleep(pollInterval);
  }

  console.log("  ⚠ Timeout waiting for feature data");
  return { layerCounts: {}, loaded: false };
}

/**
 * Deep exploration of the map object to understand layer access.
 */
async function exploreMapInternals(frame: Frame): Promise<void> {
  console.log("\n[EXPLORE MAP INTERNALS]");

  const internals = await frame.evaluate(() => {
    const { dijit } = window as unknown as Record<
      string,
      {
        registry?: { byId?: (id: string) => unknown };
      }
    >;

    const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0");
    if (!editor) {
      return { error: "No editor" };
    }

    const ed = editor as Record<string, unknown>;
    const map = ((ed._drawToolbar as Record<string, unknown>)?.map ||
      (ed.settings as Record<string, unknown>)?.map) as
      | Record<string, unknown>
      | undefined;

    if (!map) {
      return { error: "No map" };
    }

    // Get all property names on the map object
    const mapProps = Object.keys(map).filter(
      (k) =>
        k.includes("layer") ||
        k.includes("Layer") ||
        k.includes("graphic") ||
        k.includes("Graphic") ||
        k === "_layers" ||
        k === "layers"
    );

    // Check for _layers object
    const _layers = map._layers as Record<string, unknown> | undefined;
    const _layerKeys = _layers ? Object.keys(_layers) : [];

    // Try to access layers via _layers
    const layerInfoVia_layers: {
      id: string;
      type: string;
      graphicsCount: number;
      hasGraphics: boolean;
    }[] = [];

    if (_layers) {
      for (const key of _layerKeys) {
        const layer = _layers[key] as Record<string, unknown>;
        if (layer) {
          const graphics = layer.graphics as unknown[] | undefined;
          layerInfoVia_layers.push({
            graphicsCount: graphics?.length ?? -1,
            hasGraphics: !!graphics,
            id: key,
            type: (layer.declaredClass as string) || "unknown",
          });
        }
      }
    }

    // Check the graphics property directly on map
    const mapGraphics = map.graphics as Record<string, unknown> | undefined;
    const mapGraphicsInfo = mapGraphics
      ? {
          isArray: Array.isArray(mapGraphics),
          keys: Object.keys(mapGraphics).slice(0, 10),
          length: Array.isArray(mapGraphics) ? mapGraphics.length : undefined,
          type: typeof mapGraphics,
        }
      : null;

    // Check for FeatureLayer instances in the editor's settings
    const editorSettings = ed.settings as Record<string, unknown> | undefined;
    const editorLayers = editorSettings?.layers as unknown[] | undefined;
    const editorLayerInfo = editorLayers?.map((l) => {
      const layer = l as Record<string, unknown>;
      return {
        graphicsCount: (layer.graphics as unknown[])?.length ?? -1,
        id: layer.id,
        type: layer.declaredClass,
      };
    });

    return {
      _layerKeys,
      editorLayerInfo,
      graphicsLayerIds: map.graphicsLayerIds,
      hasGetLayer: typeof map.getLayer === "function",
      layerIds: map.layerIds,
      layerInfoVia_layers,
      mapGraphicsInfo,
      mapProps,
    };
  });

  console.log("  Internals:", JSON.stringify(internals, null, 2));
}

/**
 * Explore the map structure.
 */
async function exploreMapStructure(frame: Frame): Promise<void> {
  console.log("\n[EXPLORE MAP STRUCTURE]");

  const structure = await frame.evaluate(() => {
    const { dijit } = window as unknown as Record<
      string,
      {
        registry?: {
          byId?: (id: string) => unknown;
          toArray?: () => Array<{ id: string; declaredClass?: string }>;
        };
      }
    >;

    const allWidgets = dijit?.registry?.toArray?.() || [];
    const relevantWidgets = allWidgets
      .filter(
        (w) =>
          w.declaredClass?.includes("Edit") ||
          w.declaredClass?.includes("Draw") ||
          w.declaredClass?.includes("Layer") ||
          w.declaredClass?.includes("Template")
      )
      .map((w) => ({ class: w.declaredClass, id: w.id }));

    const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0");
    if (!editor) {
      return { error: "No editor", relevantWidgets };
    }

    const ed = editor as Record<string, unknown>;
    const map = ((ed._drawToolbar as Record<string, unknown>)?.map ||
      (ed.settings as Record<string, unknown>)?.map) as
      | Record<string, unknown>
      | undefined;

    if (!map) {
      return { error: "No map", relevantWidgets };
    }

    const graphicsLayerIds = (map.graphicsLayerIds as string[]) || [];
    const layerIds = (map.layerIds as string[]) || [];

    const layerDetails: {
      id: string;
      type: string;
      graphicsCount: number;
    }[] = [];

    for (const id of [...graphicsLayerIds, ...layerIds]) {
      try {
        const getLayer = map.getLayer as
          | ((id: string) => Record<string, unknown> | undefined)
          | undefined;
        const layer = getLayer?.(id);
        if (layer) {
          const graphics = (layer.graphics as unknown[]) || [];
          layerDetails.push({
            graphicsCount: graphics.length,
            id,
            type: graphicsLayerIds.includes(id)
              ? "GraphicsLayer"
              : "FeatureLayer",
          });
        }
      } catch {
        // Layer access failed - skip this layer
        layerDetails.push({
          graphicsCount: -1,
          id,
          type: "error",
        });
      }
    }

    return { graphicsLayerIds, layerDetails, layerIds, relevantWidgets };
  });

  console.log("  Structure:", JSON.stringify(structure, null, 2));
}

// =============================================================================
// TEST - Following revise.test.ts pattern
// =============================================================================

const harness = new PortalHarness();
let createdRevisionId: string | null = null;
let confirmationPopup: Page | null = null;
let mapPopup: Page | null = null;
let esriFrame: Frame | null = null;

const describeSuite = RUN_SPIKE ? describe : describe.skip;

describeSuite("Map Feature Reading Spike", () => {
  afterAll(async () => {
    await harness.teardown();
  });

  // ---------------------------------------------------------------------------
  // STEP 1: Login and navigate to My Dust Apps
  // ---------------------------------------------------------------------------
  test(
    "1. login and navigate to My Dust Apps",
    async () => {
      console.log("\n=== STEP 1: Setup ===");

      await harness.setup();
      const success = await harness.navigateToDustApps();
      expect(success).toBe(true);

      const hasNewBtn = await isOnDustAppsPage(harness.page);
      expect(hasNewBtn).toBe(true);
      console.log("  ✓ On My Dust Apps page");
    },
    TIMEOUTS.complex
  );

  // ---------------------------------------------------------------------------
  // STEP 2: Start revision via popup
  // ---------------------------------------------------------------------------
  test(
    "2. start revision of active permit",
    async () => {
      console.log("\n=== STEP 2: Create Revision ===");
      console.log(`  Revising permit: ${TEST_PERMIT_ID}`);

      const { page, context } = harness;

      const result = await createReviseApplication(
        page,
        context,
        TEST_PERMIT_ID,
        "Spike test: Reading map features"
      );

      expect(result.success).toBe(true);
      createdRevisionId = result.applicationId;
      console.log(`  ✓ Created revision: ${createdRevisionId}`);
    },
    TIMEOUTS.complex
  );

  // ---------------------------------------------------------------------------
  // STEP 3: Navigate to Page 2 and open map popup
  // ---------------------------------------------------------------------------
  test(
    "3. navigate to page 2 and open map",
    async () => {
      console.log("\n=== STEP 3: Open Map ===");

      const { page, context } = harness;

      // Go to page 2
      await goToPage(page, 2);
      expect(await getCurrentPage(page)).toBe(2);
      console.log("  ✓ On Page 2");

      // Check which button is present - Edit (has map) vs Add (no map)
      const { portal } = await import("@/portal/utils/selectors");
      const hasEditBtn =
        (await page.locator(portal.page2.editSiteDrawingBtn).count()) > 0;
      const hasAddBtn =
        (await page.locator(portal.page2.addSiteDrawingBtn).count()) > 0;
      console.log(`  Edit Site Drawing button present: ${hasEditBtn}`);
      console.log(`  Add Site Drawing button present: ${hasAddBtn}`);

      if (!hasEditBtn && hasAddBtn) {
        console.log(
          "  ⚠ No existing map data - revision did not carry over map. Need to use a permit with map data."
        );
      }

      // Open map popup - use Edit if available, otherwise Add
      if (hasEditBtn) {
        console.log("  Clicking Edit Site Drawing...");
        await page.locator(portal.page2.editSiteDrawingBtn).click();
      } else {
        console.log("  Clicking Add Site Drawing (no existing map)...");
        await page.locator(portal.page2.addSiteDrawingBtn).click();
      }

      // Wait for first popup (confirmation for revisions)
      const firstPopup = await waitForPopup(context);
      expect(firstPopup).not.toBeNull();
      assertNotNull(firstPopup, "firstPopup should not be null");
      await firstPopup.waitForLoadState("domcontentloaded");
      await sleep(2000);

      // Find the confirmation popup frame using proper helper
      const confirmFrame = await findFrameWithSelector(
        firstPopup,
        portal.siteDrawingPopup.createBtn
      );

      if (confirmFrame) {
        console.log("  Found site drawing confirmation popup");

        // Screenshot BEFORE any action
        await firstPopup.screenshot({
          path: "tests/e2e/screenshots/read-features-1-confirm-popup.png",
        });
        console.log("  Screenshot: confirm popup before action");

        // Check checkbox using proper helper
        console.log("  Setting 'Copy site drawing' checkbox...");
        await setCheckbox(
          confirmFrame,
          portal.siteDrawingPopup.copyCheckbox,
          true
        );

        // Verify checkbox state
        const isChecked = await confirmFrame
          .locator(portal.siteDrawingPopup.copyCheckbox)
          .isChecked();
        console.log(`  Checkbox checked: ${isChecked}`);
        expect(isChecked).toBe(true);

        // Screenshot AFTER checkbox
        await firstPopup.screenshot({
          path: "tests/e2e/screenshots/read-features-2-checkbox-checked.png",
        });

        // Debug: Log available window functions
        const debugInfo = await confirmFrame.evaluate(() => {
          const win = window as unknown as Record<string, unknown>;
          return {
            btnOnclick: document
              .querySelector<HTMLAnchorElement>(
                '[id="newRevisionSiteDrawing:createNewRevisionSiteDrawing"]'
              )
              ?.getAttribute("onclick"),
            formAction: (document.getElementById("_idJsp3") as HTMLFormElement)
              ?.action,
            formExists: !!document.getElementById("_idJsp3"),
            hasSubmitForm: typeof win.submitForm === "function",
          };
        });
        console.log(`  Debug: ${JSON.stringify(debugInfo)}`);

        // Log current pages before any action
        console.log(`  Pages before Create: ${context.pages().length} windows`);
        for (let i = 0; i < context.pages().length; i++) {
          try {
            console.log(`    Page ${i}: ${context.pages()[i]?.url()}`);
          } catch {
            console.log(`    Page ${i}: (not accessible)`);
          }
        }

        // ADF Confirmation Popup Pattern:
        // Click the action button (Create), then click Cancel to dismiss popup
        // See CLAUDE.md "ADF Confirmation Popup Pattern (CRITICAL)"
        console.log("  Step 1: Click Create button...");

        // Set up a listener for any NEW popup that might open
        const newPopupPromise = context
          .waitForEvent("page", { timeout: 10_000 })
          .catch(() => null);

        const createClicked = await clickInFrames(
          firstPopup,
          portal.siteDrawingPopup.createBtn
        );
        console.log(`  Create clicked: ${createClicked}`);

        // Wait for server to process the action
        console.log("  Waiting for server to process...");
        await sleep(3000);

        // Check if a new popup appeared
        console.log(`  Pages after Create: ${context.pages().length} windows`);
        for (let i = 0; i < context.pages().length; i++) {
          try {
            console.log(`    Page ${i}: ${context.pages()[i]?.url()}`);
          } catch {
            console.log(`    Page ${i}: (not accessible)`);
          }
        }

        // Screenshot after Create click
        try {
          await firstPopup.screenshot({
            path: "tests/e2e/screenshots/read-features-3-after-create-click.png",
          });
        } catch {
          console.log("  Screenshot failed - popup may have closed");
        }

        // Check if the Create action already triggered a new popup (map window)
        const newPopupAfterCreate = await Promise.race([
          newPopupPromise,
          sleep(1000).then(() => null),
        ]);

        if (newPopupAfterCreate) {
          console.log("  ✓ New popup appeared after Create - this is the map!");
          await newPopupAfterCreate.waitForLoadState("domcontentloaded");
          mapPopup = newPopupAfterCreate;

          // NOTE: Don't close the confirmation popup here!
          // ADF links the popups - closing the confirmation popup invalidates the map popup.
          // The confirmation popup will be closed during cleanup.
          console.log(
            "  (Keeping confirmation popup open - will close during cleanup)"
          );
          confirmationPopup = firstPopup;
        } else {
          // Step 2: Click Cancel to dismiss the popup (ADF pattern)
          console.log("  Step 2: Click Cancel to dismiss popup...");

          // Set up listener for popup that might appear after Cancel
          const popupAfterCancelPromise = context
            .waitForEvent("page", { timeout: 10_000 })
            .catch(() => null);

          const cancelClicked = await clickInFrames(
            firstPopup,
            portal.siteDrawingPopup.cancelBtn
          );
          console.log(`  Cancel clicked: ${cancelClicked}`);

          // Wait for popup to dismiss and map to start loading
          console.log("  Waiting for popup to dismiss and map to load...");
          await sleep(3000);

          // Check pages after Cancel
          console.log(
            `  Pages after Cancel: ${context.pages().length} windows`
          );
          for (let i = 0; i < context.pages().length; i++) {
            try {
              console.log(`    Page ${i}: ${context.pages()[i]?.url()}`);
            } catch {
              console.log(`    Page ${i}: (not accessible)`);
            }
          }

          // Check for new popup after Cancel
          const popupAfterCancel = await Promise.race([
            popupAfterCancelPromise,
            sleep(1000).then(() => null),
          ]);

          if (popupAfterCancel) {
            console.log(
              "  ✓ New popup appeared after Cancel - this is the map!"
            );
            await popupAfterCancel.waitForLoadState("domcontentloaded");
            mapPopup = popupAfterCancel;
          } else {
            // Check if firstPopup is still valid and now shows map content
            try {
              const stillValid = await firstPopup
                .evaluate(() => true)
                .catch(() => false);
              if (stillValid) {
                console.log(
                  "  Confirmation popup still valid, checking for map content..."
                );
                // Check frames for ESRI content
                for (const frame of firstPopup.frames()) {
                  try {
                    const url = await frame.evaluate(
                      () => window.location.href
                    );
                    const hasGis = url.includes("gis.maricopa.gov");
                    console.log(
                      `    ${url.slice(0, 60)}... ${hasGis ? "✓ GIS!" : ""}`
                    );
                  } catch {
                    // Ignore inaccessible frames
                  }
                }
                mapPopup = firstPopup;
              } else {
                console.log(
                  "  Confirmation popup closed. Checking remaining pages..."
                );
                // The map might now be visible in a different existing page
                const pages = context.pages();
                for (let i = 0; i < pages.length; i++) {
                  const p = pages[i];
                  if (!p) {
                    continue;
                  }
                  try {
                    const url = p.url();
                    console.log(`    Checking page ${i}: ${url}`);
                    // Check if this page has the ESRI iframe
                    const hasEsri = await findEsriFrame(p, 2000);
                    if (hasEsri) {
                      console.log(`    ✓ Found ESRI content in page ${i}`);
                      mapPopup = p;
                      break;
                    }
                  } catch {
                    console.log(`    Page ${i}: (not accessible)`);
                  }
                }
              }
            } catch {
              console.log("  Confirmation popup not accessible anymore");
            }
          }
        }
      } else {
        // No confirmation popup - map opened directly
        console.log("  No confirmation popup - map opened directly");
        mapPopup = firstPopup;
      }

      expect(mapPopup).not.toBeNull();
      assertNotNull(mapPopup, "mapPopup should not be null");
      await mapPopup.waitForLoadState("domcontentloaded");
      await sleep(3000);
      console.log("  ✓ Map popup opened");

      // Explore all frames in the popup
      console.log("  Exploring frame structure...");
      const allFrames = mapPopup.frames();
      for (let i = 0; i < allFrames.length; i++) {
        const frame = allFrames[i];
        if (!frame) {
          continue;
        }
        try {
          const url = await frame.evaluate(() => window.location.href);
          const hasEditor = await frame
            .evaluate(() => {
              const { dijit } = window as unknown as Record<string, unknown>;
              return !!(dijit as Record<string, unknown>)?.registry;
            })
            .catch(() => false);
          console.log(
            `    Frame ${i}: ${url.slice(0, 80)}... (dijit: ${hasEditor})`
          );

          // Check for nested iframes
          const nestedIframes = await frame
            .evaluate(() => {
              const iframes = document.querySelectorAll("iframe");
              return [...iframes].map((f) => ({
                id: f.id || "(no id)",
                src: f.src || f.getAttribute("src") || "(no src)",
              }));
            })
            .catch(() => []);
          if (nestedIframes.length > 0) {
            console.log(
              `      Nested iframes: ${JSON.stringify(nestedIframes)}`
            );
          }
        } catch {
          console.log(`    Frame ${i}: (not accessible)`);
        }
      }

      // Also check for iframes directly in the popup page
      const popupIframes = await mapPopup
        .evaluate(() => {
          const iframes = document.querySelectorAll("iframe");
          return [...iframes].map((f) => ({
            id: f.id || "(no id)",
            src: f.src || f.getAttribute("src") || "(no src)",
          }));
        })
        .catch(() => []);
      console.log(`  Popup page iframes: ${JSON.stringify(popupIframes)}`);

      // Get detailed structure from Frame 1
      const frame1 = allFrames[1];
      if (frame1) {
        // Scan for ALL iframes (including nested)
        const frameInfo = await frame1
          .evaluate(() => {
            const iframes = document.querySelectorAll("iframe");
            const iframeData = [...iframes].map((f) => ({
              height: f.height,
              id: f.id,
              src: f.src,
              style: f.getAttribute("style")?.substring(0, 100),
              width: f.width,
            }));

            // Look for map-related elements
            const mapElements = {
              hasCanvas: !!document.querySelector("canvas"),
              hasDijit: !!(window as unknown as Record<string, unknown>).dijit,
              hasEsri: !!(window as unknown as Record<string, unknown>).esri,
              hasMapContainer: !!document.querySelector('[id*="map"]'),
            };

            // Get all element IDs that might be map-related
            const allIds = [...document.querySelectorAll("[id]")]
              .map((el) => el.id)
              .filter(
                (id) =>
                  id.toLowerCase().includes("map") ||
                  id.toLowerCase().includes("esri") ||
                  id.toLowerCase().includes("gis") ||
                  id.toLowerCase().includes("site") ||
                  id.toLowerCase().includes("draw")
              );

            // Get all iframes in the entire document tree
            const allIframesDeep: string[] = [];
            const walker = document.createTreeWalker(
              document,
              NodeFilter.SHOW_ELEMENT
            );
            for (
              let node = walker.nextNode();
              node !== null;
              node = walker.nextNode()
            ) {
              if ((node as Element).tagName === "IFRAME") {
                const iframe = node as HTMLIFrameElement;
                allIframesDeep.push(
                  `${iframe.id || "(no id)"}: ${iframe.src || "(no src)"}`
                );
              }
            }

            return {
              allIframesDeep,
              iframeData,
              mapElements,
              mapRelatedIds: allIds.slice(0, 20),
            };
          })
          .catch(() => ({ error: "evaluate failed" }));

        console.log("  Frame 1 structure:", JSON.stringify(frameInfo, null, 2));
      }

      // Find ESRI iframe - try gis.maricopa.gov first, then check for dijit registry
      esriFrame = await findEsriFrame(mapPopup, 30_000);

      // If not found by URL, try to find frame with dijit registry
      if (!esriFrame) {
        console.log("  Trying to find frame with dijit registry...");
        for (const frame of mapPopup.frames()) {
          try {
            const hasEditor = await frame.evaluate(() => {
              const { dijit } = window as unknown as Record<
                string,
                { registry?: { byId?: (id: string) => unknown } }
              >;
              const editor = dijit?.registry?.byId?.(
                "esri_dijit_editing_Editor_0"
              );
              return !!editor;
            });
            if (hasEditor) {
              console.log("  ✓ Found frame with Editor widget");
              esriFrame = frame;
              break;
            }
          } catch {
            // Continue
          }
        }
      }

      // RECIPE: Debug dump if iframe not found
      if (!esriFrame) {
        console.log("\n  === DEBUG: ESRI iframe not found ===");

        // Screenshot
        await mapPopup.screenshot({
          path: "tests/e2e/screenshots/read-features-DEBUG-no-iframe.png",
        });
        console.log(
          "  Screenshot: tests/e2e/screenshots/read-features-DEBUG-no-iframe.png"
        );

        // Full HTML dump
        const html = await mapPopup.content();
        const fs = await import("node:fs");
        await fs.promises.writeFile(
          "tests/e2e/screenshots/read-features-DEBUG-no-iframe.html",
          html
        );
        console.log(
          "  HTML dump: tests/e2e/screenshots/read-features-DEBUG-no-iframe.html"
        );

        // Frame URLs
        console.log("  All frame URLs:");
        for (let i = 0; i < mapPopup.frames().length; i++) {
          const frame = mapPopup.frames()[i];
          try {
            const url =
              (await frame?.evaluate(() => window.location.href)) ?? "(no url)";
            console.log(`    Frame ${i}: ${url}`);
          } catch {
            console.log(`    Frame ${i}: (not accessible)`);
          }
        }
      }

      expect(esriFrame).not.toBeNull();
      assertNotNull(esriFrame, "esriFrame should not be null");
      console.log("  ✓ ESRI iframe found");

      // Wait for Editor widget
      console.log("  Waiting for Editor widget...");
      const editorReady = await waitForEditor(esriFrame, 60_000);
      expect(editorReady).toBe(true);
      console.log("  ✓ Editor widget ready");

      // Screenshot
      await mapPopup.screenshot({
        path: "tests/e2e/screenshots/read-features-1-map-open.png",
      });
    },
    TIMEOUTS.extended
  );

  // ---------------------------------------------------------------------------
  // STEP 4: Explore map structure
  // ---------------------------------------------------------------------------
  test(
    "4. explore map structure",
    async () => {
      console.log("\n=== STEP 4: Explore Map Structure ===");
      expect(esriFrame).not.toBeNull();
      assertNotNull(esriFrame, "esriFrame should not be null");

      await exploreMapStructure(esriFrame);
      await exploreMapInternals(esriFrame);
      await checkFeatureServiceUrls(esriFrame);

      // Check what fields the feature layers have
      const layerFields = await esriFrame.evaluate(() => {
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

        const _layers = map._layers as
          | Record<string, Record<string, unknown>>
          | undefined;
        if (!_layers) {
          return null;
        }

        const layerFieldInfo: Record<string, string[]> = {};
        for (const [id, layer] of Object.entries(_layers)) {
          if (layer.declaredClass === "esri.layers.FeatureLayer") {
            const fields = layer.fields as Array<{ name: string }> | undefined;
            layerFieldInfo[id] = fields?.map((f) => f.name) ?? [];
          }
        }
        return layerFieldInfo;
      });
      console.log("\n[FEATURE LAYER FIELDS]");
      console.log(JSON.stringify(layerFields, null, 2));

      // Query feature service directly to see if D0062964 has polygon data
      await queryPermitFeaturesFromREST(esriFrame, "D0062964");
      if (createdRevisionId) {
        await queryPermitFeaturesFromREST(esriFrame, createdRevisionId);
      }

      // Check definition expressions on the FeatureLayers
      const layerDefinitions = await esriFrame.evaluate(() => {
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

        const _layers = map._layers as
          | Record<string, Record<string, unknown>>
          | undefined;
        if (!_layers) {
          return null;
        }

        const layerDefs: Record<
          string,
          { definitionExpression?: string; url?: string; mode?: number }
        > = {};
        for (const [id, layer] of Object.entries(_layers)) {
          if (layer.declaredClass === "esri.layers.FeatureLayer") {
            layerDefs[id] = {
              definitionExpression: layer.definitionExpression as
                | string
                | undefined,
              mode: layer.mode as number | undefined,
              url: layer.url as string | undefined,
            };
          }
        }
        return layerDefs;
      });
      console.log("\n[FEATURE LAYER DEFINITIONS]");
      console.log(JSON.stringify(layerDefinitions, null, 2));

      // Check the map extent
      const mapExtent = await esriFrame.evaluate(() => {
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

        const extent = map.extent as Record<string, unknown> | undefined;
        return {
          spatialRef: (extent?.spatialReference as Record<string, unknown>)
            ?.wkid,
          xmax: extent?.xmax,
          xmin: extent?.xmin,
          ymax: extent?.ymax,
          ymin: extent?.ymin,
        };
      });
      console.log("\n[MAP EXTENT]");
      console.log(JSON.stringify(mapExtent, null, 2));

      // Also check if we can get the feature locations from the REST API
      console.log("\n[FEATURE GEOMETRY FROM REST]");
      const featureGeom = await esriFrame.evaluate(async () => {
        const baseUrl =
          "https://gis.maricopa.gov/arcgis/rest/services/AQD/DustControl/FeatureServer";
        try {
          // Query layer 3 (polygon) for D0062964
          const response = await fetch(
            `${baseUrl}/3/query?where=ImpactID%3D%27D0062964%27&outFields=*&returnGeometry=true&f=json`
          );
          const data = await response.json();
          if (data.features?.length > 0) {
            const geom = data.features[0].geometry;
            if (geom?.rings) {
              // Return first few coords of first ring
              return {
                firstRingCoords: geom.rings[0]?.slice(0, 3),
                ringCount: geom.rings.length,
                type: "polygon",
              };
            }
          }
          return { data, error: "No polygon found" };
        } catch (error) {
          return { error: String(error) };
        }
      });
      console.log(JSON.stringify(featureGeom, null, 2));

      if (mapPopup) {
        await mapPopup.screenshot({
          path: "tests/e2e/screenshots/read-features-2-structure.png",
        });
      }
    },
    TIMEOUTS.standard
  );

  // ---------------------------------------------------------------------------
  // STEP 5: Read existing features
  // ---------------------------------------------------------------------------
  test(
    "5. read existing features",
    async () => {
      console.log("\n=== STEP 5: Read Existing Features ===");
      expect(esriFrame).not.toBeNull();
      assertNotNull(esriFrame, "esriFrame should not be null");

      // Method 1: Query REST API directly (reliable, works regardless of map extent)
      console.log("\n--- Method 1: REST API Query ---");
      const restResult = await queryPermitFeaturesFromREST(
        esriFrame,
        createdRevisionId ?? "D0062964"
      );

      // Method 2: Try to read from map graphics layers (less reliable, depends on extent)
      console.log("\n--- Method 2: Map Graphics Layers ---");
      // Wait for FeatureLayer data to load from server (unlikely to work due to extent)
      const { loaded, layerCounts } = await waitForFeatureData(esriFrame, 5000); // Short timeout
      console.log(`  Feature data loaded: ${loaded}`);
      console.log(`  Layer counts: ${JSON.stringify(layerCounts)}`);

      const _mapResult = await readMapFeatures(esriFrame);

      // Use REST result as the primary result
      const result = restResult;

      console.log("\n  === RESULTS ===");
      console.log(`  Success: ${result.success}`);
      console.log(`  Features found: ${result.features.length}`);

      if (result.features.length > 0) {
        for (let i = 0; i < result.features.length; i++) {
          const feature = result.features[i];
          if (!feature) {
            continue;
          }
          console.log(`\n  Feature ${i + 1}:`);
          console.log(`    Type: ${feature.type}`);
          console.log(`    Source: ${feature.source}`);
          console.log(`    Coordinates: ${feature.coordinates.length} points`);

          if (feature.coordinates.length <= 10) {
            for (const coord of feature.coordinates) {
              console.log(
                `      (${coord.lat.toFixed(6)}, ${coord.lng.toFixed(6)})`
              );
            }
          } else {
            const first3 = feature.coordinates.slice(0, 3);
            const last3 = feature.coordinates.slice(-3);
            for (const coord of first3) {
              console.log(
                `      (${coord.lat.toFixed(6)}, ${coord.lng.toFixed(6)})`
              );
            }
            console.log(`      ... ${feature.coordinates.length - 6} more ...`);
            for (const coord of last3) {
              console.log(
                `      (${coord.lat.toFixed(6)}, ${coord.lng.toFixed(6)})`
              );
            }
          }

          if (
            feature.attributes &&
            Object.keys(feature.attributes).length > 0
          ) {
            console.log(
              `    Attributes: ${JSON.stringify(feature.attributes)}`
            );
          }
        }
      } else {
        console.log("\n  ⚠ No features found in graphics layers.");
        console.log(
          "    This permit may not have map data, or features load differently."
        );
      }

      if (mapPopup) {
        await mapPopup.screenshot({
          path: "tests/e2e/screenshots/read-features-3-final.png",
        });
      }

      expect(result.success).toBe(true);
    },
    TIMEOUTS.standard
  );

  // ---------------------------------------------------------------------------
  // STEP 6: Cleanup
  // ---------------------------------------------------------------------------
  test(
    "6. cleanup: delete revision draft",
    async () => {
      console.log("\n=== STEP 6: Cleanup ===");

      // Close map popup first
      if (mapPopup) {
        try {
          await mapPopup.close();
          console.log("  ✓ Closed map popup");
        } catch {
          // Already closed
        }
      }

      // Then close confirmation popup
      if (confirmationPopup) {
        try {
          await confirmationPopup.close();
          console.log("  ✓ Closed confirmation popup");
        } catch {
          // Already closed
        }
      }

      // Delete revision draft
      if (createdRevisionId) {
        const { page, context } = harness;
        const deleted = await deleteByApplicationId(
          page,
          context,
          createdRevisionId
        );
        expect(deleted).toBe(true);
        console.log(`  ✓ Deleted revision ${createdRevisionId}`);
      }
    },
    TIMEOUTS.standard
  );
});
