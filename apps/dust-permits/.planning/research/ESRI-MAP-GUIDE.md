# ESRI ArcGIS Map Automation Guide

> **⚠️ DEPRECATED** - This document has been superseded by `docs/ESRI-MAP-DRAWING-GUIDE.md`
> which includes additional critical fixes discovered during implementation (full mouse event
> simulation for dojo/dijit widgets, map container offset issue). This file is retained for
> historical reference only.

**Last Updated:** 2026-02-04
**Status:** DEPRECATED - See `docs/ESRI-MAP-DRAWING-GUIDE.md`

This document consolidates all findings from spike testing the Maricopa County dust permit map system.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Map Object Access](#map-object-access)
3. [Reading Features (REST API)](#reading-features-rest-api)
4. [Reading Features (Map Layers)](#reading-features-map-layers)
5. [Writing Features (Drawing)](#writing-features-drawing)
6. [Coordinate Systems](#coordinate-systems)
7. [Layer Structure](#layer-structure)
8. [Popup Handling](#popup-handling)
9. [Common Gotchas](#common-gotchas)
10. [Test Files Reference](#test-files-reference)
11. [Gaps and Future Work](#gaps-and-future-work)

---

## Architecture Overview

The Maricopa County portal uses:
- **Oracle ADF Faces 10g** - Main portal framework
- **ESRI ArcGIS 3.x** - Map component (dijit-based)
- **FeatureServer REST API** - Persistent storage for polygon data

```text
Portal Page (ADF)
  └── Map Popup (ADF frameset)
        └── dustSiteLocation.jsf (ADF frame)
              └── ESRI iframe (gis.maricopa.gov)
                    └── ArcGIS 3.x Map
                          ├── Editor widget (drawing tools)
                          ├── FeatureLayers (query from FeatureServer)
                          ├── GraphicsLayers (temporary graphics)
                          └── map_graphics (marker layer)
```

**Key URLs:**
- Portal: `https://dm.maricopa.gov/`
- FeatureServer: `https://gis.maricopa.gov/arcgis/rest/services/AQD/DustControl/FeatureServer`
- Map iframe: `https://gis.maricopa.gov/aqd/impact/dust?recordId=D0XXXXXX&...`

---

## Map Object Access

**CRITICAL**: The map is NOT directly accessible via `dijit.registry.byId("map")`. You must access it through the Editor widget.

### Correct Pattern

```typescript
const dijit = (window as Record<string, {
  registry?: { byId?: (id: string) => unknown }
}>).dijit;

const editor = dijit?.registry?.byId?.("esri_dijit_editing_Editor_0");
if (!editor) throw new Error("Editor widget not found");

const ed = editor as Record<string, unknown>;

// Primary path (most reliable)
const map = (ed._drawToolbar as Record<string, unknown>)?.map;

// Fallback path
const mapFallback = (ed.settings as Record<string, unknown>)?.map;

// Use whichever is available
const finalMap = map || mapFallback;
```

### What the Map Object Provides

```typescript
interface EsriMap {
  // Coordinate conversion
  toScreen(point: MapPoint): ScreenPoint;
  toMap(screenPoint: ScreenPoint): MapPoint;

  // Navigation
  centerAndZoom(point: MapPoint, level: number): void;
  extent: Extent;

  // Graphics (temporary, not persisted)
  graphics: GraphicsLayer;

  // Layer management
  _layers: Record<string, Layer>;  // Use this, NOT getLayer()
  graphicsLayerIds: string[];
  layerIds: string[];

  // Spatial reference
  spatialReference: { wkid: number };  // 102100 = Web Mercator
}
```

---

## Reading Features (REST API)

**RECOMMENDED APPROACH** - Works regardless of map extent or layer state.

### Why REST API?

The FeatureLayers in the map use `mode: 1` (on-demand) which only loads features within the current map extent. If the user hasn't panned to the polygon location, the FeatureLayers will have 0 graphics even though data exists.

The REST API always returns all features for a permit.

### Query Pattern

```typescript
const permitId = "D0062964";
const baseUrl = "https://gis.maricopa.gov/arcgis/rest/services/AQD/DustControl/FeatureServer";

// Query each layer
for (let layerIndex = 0; layerIndex <= 5; layerIndex++) {
  const queryUrl = `${baseUrl}/${layerIndex}/query?` + new URLSearchParams({
    where: `ImpactID='${permitId}'`,
    outFields: "*",
    returnGeometry: "true",
    f: "json"
  });

  const response = await fetch(queryUrl);
  const data = await response.json();

  for (const feature of data.features ?? []) {
    const geom = feature.geometry;

    if (geom.rings) {
      // Polygon - rings is array of rings, each ring is array of [x, y]
      console.log("Polygon:", geom.rings);
    } else if (geom.paths) {
      // Polyline - paths is array of paths
      console.log("Polyline:", geom.paths);
    } else if (geom.x !== undefined) {
      // Point
      console.log("Point:", geom.x, geom.y);
    }
  }
}
```

### Response Structure

```typescript
interface FeatureQueryResponse {
  features: Array<{
    geometry: {
      // For polygons
      rings?: number[][][];  // [[[x,y], [x,y], ...], ...]
      // For polylines
      paths?: number[][][];
      // For points
      x?: number;
      y?: number;
      // All geometries have
      spatialReference: { wkid: number };
    };
    attributes: {
      OBJECTID: number;
      ImpactID: string;  // e.g., "D0062964"
      Shape__Area?: number;
      Shape__Length?: number;
    };
  }>;
  geometryType: "esriGeometryPolygon" | "esriGeometryPoint" | "esriGeometryPolyline";
}
```

---

## Reading Features (Map Layers)

**USE WITH CAUTION** - Only works if features are within current map extent.

### Layer Access

```typescript
// WRONG - throws "Cannot read properties of undefined"
const layer = map.getLayer("graphicsLayer3");

// CORRECT - use _layers directly
const _layers = map._layers as Record<string, Layer>;
const layer = _layers["graphicsLayer3"];

// Access graphics
const graphics = layer.graphics as Array<Graphic>;
for (const graphic of graphics) {
  const geom = graphic.geometry;
  console.log(geom.type, geom.rings || geom.x);
}
```

### Why getLayer() Fails

In this version of ArcGIS 3.x, `map.getLayer()` is defined but throws internal errors when called. The `_layers` internal property provides direct access.

### FeatureLayer Loading Issue

```typescript
// FeatureLayers have mode: 1 (on-demand)
const layer = map._layers["graphicsLayer3"];
console.log(layer.mode);  // 1 = MODE_ONDEMAND

// Graphics only load when extent overlaps feature location
console.log(layer.graphics.length);  // 0 if polygon is outside current view!
```

**Solution**: Use the REST API approach, or pan the map to the feature location first.

---

## Writing Features (Drawing)

### Programmatic Drawing (JS Injection)

```typescript
const esri = (window as Record<string, unknown>).esri as EsriNamespace;

// Create polygon geometry
const polygon = new esri.geometry.Polygon(map.spatialReference);
polygon.addRing([
  [x1, y1],  // Web Mercator coordinates
  [x2, y2],
  [x3, y3],
  [x1, y1]   // Close the ring
]);

// Create symbol
const symbol = new esri.symbol.SimpleFillSymbol();
symbol.setColor(new esri.Color([255, 0, 0, 128]));

// Create and add graphic
const graphic = new esri.Graphic(polygon, symbol);
map.graphics.add(graphic);

// NOTE: This adds to TEMPORARY graphics layer, NOT persisted!
```

### Mouse-Based Drawing (Recommended for Persistence)

```typescript
// 1. Select template by label (IDs are dynamic per session)
const templates = document.querySelectorAll("[id^='tpick-surface-']");
for (const tpl of templates) {
  if (tpl.textContent?.includes("Disturbed Area")) {
    (tpl as HTMLElement).click();
    break;
  }
}

// 2. Wait for drawing mode
await waitFor(() => editor._drawToolbar._geometryType === "polygon");

// 3. Click vertices on the map
const frameBox = await esriFrame.frameElement().boundingBox();
for (const coord of screenCoords) {
  await page.mouse.click(frameBox.x + coord.x, frameBox.y + coord.y);
  await sleep(400);
}

// 4. Double-click to complete polygon
await page.mouse.dblclick(frameBox.x + firstCoord.x, frameBox.y + firstCoord.y);

// 5. Save
await page.click('img[alt="Save and Close"]');
```

### Template Labels

| Template | Geometry | Purpose |
|----------|----------|---------|
| Disturbed Area | polygon | Site boundary (required) |
| Access Point | point | Site access location (required) |
| Unpaved Parking | polygon | Optional |
| Storage Pile | polygon | Optional |
| Dust Control Site | polygon | Optional |
| Linear Project | polyline | Optional |

---

## Coordinate Systems

### Web Mercator (EPSG:3857 / WKID:102100)

This is what the map uses internally.

```typescript
// Lat/Lng (WGS84) → Web Mercator
function toWebMercator(lat: number, lng: number): { x: number; y: number } {
  return {
    x: (lng * 20037508.34) / 180,
    y: Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * (20037508.34 / Math.PI)
  };
}

// Web Mercator → Lat/Lng (WGS84)
function toLatLng(x: number, y: number): { lat: number; lng: number } {
  return {
    lng: (x * 180) / 20037508.34,
    lat: (Math.atan(Math.exp((y * Math.PI) / 20037508.34)) * 360) / Math.PI - 90
  };
}
```

### Screen Coordinates

```typescript
// Map coordinates → Screen pixels
const screenPoint = map.toScreen({
  x: webMercatorX,
  y: webMercatorY,
  spatialReference: { wkid: 102100 }
});

// Screen pixels → Map coordinates
const mapPoint = map.toMap(screenPoint);
```

### For Mouse Clicks

```typescript
// Get iframe position on page
const frameBox = await esriFrame.frameElement().boundingBox();

// Convert map coords to screen coords, then to page coords
const screenCoords = map.toScreen(webMercatorPoint);
const pageX = frameBox.x + screenCoords.x;
const pageY = frameBox.y + screenCoords.y;

await page.mouse.click(pageX, pageY);
```

---

## Layer Structure

### FeatureServer Layers

| Index | Type | Field | Content |
|-------|------|-------|---------|
| 0 | Point | `ImpactID` | Site center markers |
| 1 | Point | `ImpactID` | (unused in observed permits) |
| 2 | Point | `ImpactID` | (unused in observed permits) |
| 3 | Polygon | `ImpactID` | **Site boundaries** |
| 4 | Polyline | `ImpactID` | Access roads/paths |
| 5 | Polygon | `ImpactID` | (unused in observed permits) |

### Map Layer IDs

| ID | Type | Purpose |
|----|------|---------|
| `graphicsLayer1` | FeatureLayer | Maps to FeatureServer/5 |
| `graphicsLayer2` | FeatureLayer | Maps to FeatureServer/3 (polygons) |
| `graphicsLayer3` | FeatureLayer | Maps to FeatureServer/2 |
| `graphicsLayer4` | FeatureLayer | Maps to FeatureServer/1 |
| `graphicsLayer5` | FeatureLayer | Maps to FeatureServer/0 (points) |
| `graphicsLayer6` | GraphicsLayer | Temporary drawing layer |
| `map_graphics` | GraphicsLayer | Default map graphics |
| `StreetWithTerrain_*` | TiledMapServiceLayer | Base map |
| `Parcel_*` | DynamicMapServiceLayer | Parcel boundaries |

---

## Popup Handling

### Site Drawing Popup (Revisions)

When creating a revision and clicking "Add Site Drawing":

```typescript
// 1. A confirmation popup appears first
const confirmPopup = await waitForPopup(context);

// 2. Check "Copy site drawing" checkbox if desired
const frame = await findFrameWithSelector(confirmPopup, portal.siteDrawingPopup.copyCheckbox);
await setCheckbox(frame, portal.siteDrawingPopup.copyCheckbox, true);

// 3. Click Create - this opens a NEW popup with the map
const mapPopupPromise = context.waitForEvent("page");
await clickInFrames(confirmPopup, portal.siteDrawingPopup.createBtn);
const mapPopup = await mapPopupPromise;

// 4. DO NOT close the confirmation popup yet!
// Closing it invalidates the map popup (ADF links them)

// 5. Work with the map...
const esriFrame = await findEsriFrame(mapPopup);

// 6. Cleanup: close map first, then confirmation
await mapPopup.close();
await confirmPopup.close();
```

### Copy Operation

When "Copy site drawing from D0XXXXXX" is checked, the map URL includes `copyId=D0XXXXXX`. The polygon data is copied to the new permit ID in the FeatureServer immediately.

---

## Common Gotchas

### 1. getLayer() Throws

```typescript
// BAD - throws error
const layer = map.getLayer("graphicsLayer3");

// GOOD - direct access
const layer = map._layers["graphicsLayer3"];
```

### 2. FeatureLayers Empty Despite Data Existing

```typescript
// FeatureLayers use on-demand loading (mode=1)
// If polygon is outside current extent, graphics.length === 0

// SOLUTION: Use REST API instead
const response = await fetch(`${featureServerUrl}/3/query?where=ImpactID='${permitId}'...`);
```

### 3. Template IDs Are Dynamic

```typescript
// BAD - ID changes every session
await page.click("#tpick-surface-6");

// GOOD - find by label text
for (const tpl of document.querySelectorAll("[id^='tpick-surface-']")) {
  if (tpl.textContent?.includes("Disturbed Area")) {
    tpl.click();
    break;
  }
}
```

### 4. Closing Confirmation Popup Breaks Map Popup

```typescript
// BAD - closing confirmation immediately breaks map
await clickInFrames(confirmPopup, createBtn);
await confirmPopup.close();  // This kills the map popup too!

// GOOD - keep confirmation open until done with map
await clickInFrames(confirmPopup, createBtn);
const mapPopup = await context.waitForEvent("page");
// ... use map ...
await mapPopup.close();
await confirmPopup.close();  // Now safe to close
```

### 5. Address Search with City/State Fails

```typescript
// BAD - returns 0 results
queryParcelsByAddress("4837 N Granite Reef Rd, Scottsdale, AZ");

// GOOD - street address only
queryParcelsByAddress("4837 N Granite Reef Rd");
```

### 6. map.graphics.add() Doesn't Persist

```typescript
// This creates a TEMPORARY graphic, not saved to FeatureServer
map.graphics.add(graphic);

// For persistence, use mouse-based drawing through the Editor widget
// or submit directly to FeatureServer via REST API
```

---

## Test Files Reference

### Spike Tests

| File | Purpose | Key Findings |
|------|---------|--------------|
| `tests/e2e/map-drawing-spike.test.ts` | Explore drawing capabilities | Discovered Editor widget access, template selection |
| `tests/e2e/map-read-features-spike.test.ts` | Explore reading capabilities | Discovered REST API approach, _layers access |
| `tests/e2e/map-full-workflow.test.ts` | End-to-end drawing workflow | Complete parcel→draw→save workflow |

### Helper Functions

Located in `src/portal/create/fill/page2/map.ts`:

| Function | Purpose |
|----------|---------|
| `findEsriFrame(popup)` | Locate ESRI iframe in popup |
| `waitForEditor(frame)` | Wait for Editor widget ready |
| `searchLocation(frame, popup, address)` | Search box interaction |
| `switchToAerialBasemap(frame)` | Change base map |
| `activateDrawingMode(frame)` | Activate polygon drawing |
| `openMapPopup(page, context)` | Open map popup from Page 2 |

### Documentation

| File | Content |
|------|---------|
| `.planning/phases/02-drawing-engine/SPIKE-RESULTS.md` | Drawing spike detailed results |
| `.planning/research/ESRI-MAP-GUIDE.md` | This file - comprehensive reference |

---

## Gaps and Future Work

### Known Gaps

1. **Direct FeatureServer write**: Currently drawing uses mouse clicks through Editor. Direct REST POST to FeatureServer could be more reliable.

2. **Polygon editing**: Spike tests cover creating new polygons but not editing existing ones.

3. **Polygon deletion**: No testing of removing features from FeatureServer.

4. **Multi-polygon handling**: What happens when a permit has multiple polygons?

5. **Error recovery**: What if map fails to load? What if drawing is interrupted?

### Potential Improvements

1. **REST API for writing**: Instead of mouse clicks, POST geometry directly to FeatureServer:
   ```text
   POST /FeatureServer/3/addFeatures
   Body: { features: [{ geometry: {...}, attributes: { ImpactID: "D0064XXX" }}] }
   ```

2. **Extent management**: Pan map to feature location before reading from FeatureLayers.

3. **Feature validation**: After drawing, query REST API to confirm feature was saved correctly.

---

## Quick Reference

### Read Polygon for Permit

```typescript
const url = `https://gis.maricopa.gov/arcgis/rest/services/AQD/DustControl/FeatureServer/3/query?where=ImpactID='${permitId}'&outFields=*&returnGeometry=true&f=json`;
const data = await (await fetch(url)).json();
const polygon = data.features[0]?.geometry.rings;  // [[x,y], [x,y], ...]
```

### Access Map Object

```typescript
const editor = dijit.registry.byId("esri_dijit_editing_Editor_0");
const map = editor._drawToolbar.map || editor.settings.map;
```

### Convert Coordinates

```typescript
// Lat/Lng → Web Mercator
const x = (lng * 20037508.34) / 180;
const y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * (20037508.34 / Math.PI);

// Web Mercator → Lat/Lng
const lng = (x * 180) / 20037508.34;
const lat = (Math.atan(Math.exp((y * Math.PI) / 20037508.34)) * 360) / Math.PI - 90;
```
