# ESRI Map Drawing Guide - Hard-Won Knowledge

> **Date:** February 2026
> **Context:** Renewal workflow - copying map data from original permit to new application
> **Hours of debugging:** Many. Too many.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [The Problem We Were Trying to Solve](#the-problem-we-were-trying-to-solve)
3. [The Failures (What Didn't Work)](#the-failures-what-didnt-work)
4. [The Breakthrough: Full Mouse Event Simulation](#the-breakthrough-full-mouse-event-simulation)
5. [Map Object Access](#map-object-access)
6. [The Complete Working Solution](#the-complete-working-solution)
7. [Layer Structure](#layer-structure)
8. [Popup Handling](#popup-handling)
9. [Coordinate Systems](#coordinate-systems)
10. [Common Gotchas](#common-gotchas)
11. [Debugging Tips](#debugging-tips)
12. [Files Reference](#files-reference)

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

## The Problem We Were Trying to Solve

When renewing a dust permit, the portal's `copyFromApp` parameter only copies **form data**, NOT **map data**. The polygon (disturbed area), access points, parking locations - none of that transfers. We needed to:

1. Query the original permit's map features from the REST API
2. Create a renewal application
3. **Draw the polygon ourselves** using the coordinates from the original

Sounds simple. It was not.

---

## The Failures (What Didn't Work)

### Attempt 1: JavaScript `.click()` on Template Picker

```javascript
// This DOES NOT WORK
const tpick = document.querySelector("[id^='tpick-surface-']");
tpick.click();
```

**What happened:** The click event fired, the function returned success, but the template picker UI showed a DIFFERENT template selected (usually "Unpaved Parking" instead of "Disturbed Area").

**Why it failed:** Dojo/dijit widgets don't respond to simple JavaScript click events. They have complex event handlers that expect the full mouse event sequence.

### Attempt 2: Playwright `frame.locator().click()`

```javascript
await frame.locator("#tpick-surface-6").click();
```

**What happened:** Same result. Playwright's click is still just triggering a click event, not the full mouse interaction sequence that dojo expects.

### Attempt 3: Programmatic Draw Toolbar Activation

```javascript
const drawToolbar = editor._drawToolbar;
drawToolbar.activate("polygon");
```

**What happened:** The draw toolbar activated (`_geometryType` was "polygon"), but when we clicked on the map, it created parking points instead of polygon vertices.

**Why it failed:** The Editor widget needs MORE than just draw toolbar activation. It needs:
- A selected template in the TemplatePicker
- A current feature layer set
- The template's attributes to apply to new features

Just activating the draw toolbar doesn't tell the Editor WHICH LAYER to add the new feature to.

### Attempt 4: Setting Internal State Directly

```javascript
editor._currentFeatureLayer = disturbedAreaLayer;
editor.templatePicker._selectedTemplate = { ... };
editor.templatePicker.onSelectionChange({ ... });
```

**What happened:** The internal state was set, but the UI didn't reflect it. The TemplatePicker showed no selection. Drawing still went to the wrong layer.

**Why it failed:** Dojo widgets have complex internal state management. Setting properties directly doesn't trigger the UI updates or cascading state changes that happen during a real user interaction.

---

## The Breakthrough: Full Mouse Event Simulation

The solution was to simulate the COMPLETE mouse interaction sequence:

```javascript
const el = document.getElementById("tpick-surface-6");
const rect = el.getBoundingClientRect();
const centerX = rect.x + rect.width / 2;
const centerY = rect.y + rect.height / 2;

const eventOptions = {
  bubbles: true,
  cancelable: true,
  view: window,
  clientX: centerX,
  clientY: centerY,
  button: 0,
  buttons: 1,
};

// The FULL sequence matters
el.dispatchEvent(new MouseEvent("mouseover", eventOptions));
el.dispatchEvent(new MouseEvent("mouseenter", eventOptions));
el.dispatchEvent(new MouseEvent("mousedown", eventOptions));
el.dispatchEvent(new MouseEvent("mouseup", eventOptions));
el.dispatchEvent(new MouseEvent("click", eventOptions));
```

**Why this works:** Dojo widgets often attach handlers to mouseover/mouseenter for hover states, mousedown for selection start, etc. The full sequence triggers all the internal state changes properly.

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

  // Layer management - USE _layers, NOT getLayer()!
  _layers: Record<string, Layer>;
  graphicsLayerIds: string[];
  layerIds: string[];

  // Spatial reference
  spatialReference: { wkid: number };  // 102100 = Web Mercator
}
```

---

## The Second Failure: Clicks Landing on Template Picker

After fixing template selection, we had a new problem: polygon clicks were creating parking points. Screenshots revealed the polygon was never drawn.

### The Investigation

```text
Frame box: 1404x804 at (100, 96)
Screen coords: 7 points
  [0]: (297, 442)  <-- This is the problem!
```

We were calculating screen coordinates relative to the **iframe**, but the clicks needed to account for the **map container's position within the iframe**.

### The Discovery

The ESRI map page layout:
```text
|------- IFRAME (1404px wide) -------|
|  TEMPLATE PICKER  |   MAP CANVAS   |
|    (~410px)       |   (~990px)     |
```

The map container starts at x=410 within the iframe. Our screen coordinate (297, 442) was landing IN THE TEMPLATE PICKER PANEL, not on the map!

When you click in the template picker area while in "polygon drawing mode", it selects a new template instead of drawing a vertex.

### The Fix

```javascript
// Get the map container's position
const mapContainer = document.getElementById("map");
const mapRect = mapContainer.getBoundingClientRect();
// mapRect.x = 410 (the offset from iframe left edge)

// Calculate click position correctly
const clickX = frameBox.x + mapRect.x + screenCoord.x;
const clickY = frameBox.y + mapRect.y + screenCoord.y;
```

---

## The Complete Working Solution

### 1. Query Original Permit Data

```typescript
const baseUrl = "https://gis.maricopa.gov/arcgis/rest/services/AQD/DustControl/FeatureServer";

// Query layers 0-5 for the permit's features
for (let layerIndex = 0; layerIndex <= 5; layerIndex++) {
  const queryUrl = `${baseUrl}/${layerIndex}/query?where=ImpactID%3D%27${permitId}%27&outFields=*&returnGeometry=true&f=json`;
  // Layer 3 typically has polygons (disturbed areas)
  // Layer 0 typically has points (access points)
}
```

### 2. Select Template with Full Mouse Events

```typescript
async function activateDisturbedAreaTemplate(frame: Frame): Promise<boolean> {
  // Find the element
  const templateElement = await frame.evaluate(() => {
    const tpicks = document.querySelectorAll("[id^='tpick-surface-']");
    for (const tpick of tpicks) {
      if (tpick.textContent?.toLowerCase().includes("disturbed area")) {
        return { id: tpick.id, found: true };
      }
    }
    return { found: false };
  });

  // Simulate full mouse sequence
  await frame.evaluate(({ elementId }) => {
    const el = document.getElementById(elementId);
    const rect = el.getBoundingClientRect();
    const eventOptions = {
      bubbles: true, cancelable: true, view: window,
      clientX: rect.x + rect.width / 2,
      clientY: rect.y + rect.height / 2,
      button: 0, buttons: 1,
    };

    el.dispatchEvent(new MouseEvent("mouseover", eventOptions));
    el.dispatchEvent(new MouseEvent("mouseenter", eventOptions));
    el.dispatchEvent(new MouseEvent("mousedown", eventOptions));
    el.dispatchEvent(new MouseEvent("mouseup", eventOptions));
    el.dispatchEvent(new MouseEvent("click", eventOptions));
  }, { elementId: templateElement.id });
}
```

### 3. Get Map Container Offset

```typescript
const mapContainerInfo = await esriFrame.evaluate(() => {
  const mapDiv = document.getElementById("map") ||
                 document.getElementById("map_root") ||
                 document.querySelector("#map_container");
  if (mapDiv) {
    const rect = mapDiv.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }
  return null;
});

// Map container is typically at x=410 (after template picker panel)
```

### 4. Convert Coordinates Correctly

```typescript
// REST API returns Web Mercator coordinates
// Convert to lat/lng
function webMercatorToLatLng(x: number, y: number) {
  const lng = (x * 180) / 20_037_508.34;
  const lat = (Math.atan(Math.exp((y * Math.PI) / 20_037_508.34)) * 360) / Math.PI - 90;
  return { lat, lng };
}

// Then use map.toScreen() to get screen coordinates relative to map container
// IMPORTANT: These are relative to the MAP CONTAINER, not the iframe!
```

### 5. Calculate Click Positions

```typescript
// frameBox = iframe position on page (e.g., x=100, y=96)
// mapContainer = map position within iframe (e.g., x=410, y=0)
// screenCoord = coordinate relative to map container

const clickX = frameBox.x + mapContainer.x + screenCoord.x;
const clickY = frameBox.y + mapContainer.y + screenCoord.y;

await page.mouse.click(clickX, clickY);
```

### 6. Draw Polygon

```typescript
// Skip the closing point if polygon is closed (first == last)
const hasClosingPoint =
  Math.abs(vertices[0].x - vertices[vertices.length-1].x) < 5 &&
  Math.abs(vertices[0].y - vertices[vertices.length-1].y) < 5;

const vertsToDraw = hasClosingPoint ? vertices.slice(0, -1) : vertices;

// Click each vertex
for (const v of vertsToDraw) {
  await page.mouse.click(clickOffsetX + v.x, clickOffsetY + v.y);
  await sleep(400); // Give the map time to register each click
}

// Double-click first vertex to close the polygon
await page.mouse.dblclick(clickOffsetX + vertices[0].x, clickOffsetY + vertices[0].y);
```

---

## Layer Structure

### FeatureServer Layers

| Index | Type | Field | Content |
|-------|------|-------|---------|
| 0 | Point | `ImpactID` | Site center markers |
| 1 | Point | `ImpactID` | (unused in observed permits) |
| 2 | Point | `ImpactID` | (unused in observed permits) |
| 3 | Polygon | `ImpactID` | **Site boundaries (Disturbed Areas)** |
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

### Template Labels

| Label | Geometry | Required |
|-------|----------|----------|
| Disturbed Area | polygon | Yes |
| Access Point | point | Yes |
| Unpaved Parking | polygon | No |
| Storage Pile | polygon | No |
| Dust Control Site | polygon | No |
| Linear Project | polyline | No |

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

## Coordinate Systems

### Web Mercator (EPSG:3857 / WKID:102100)

This is what the map and FeatureServer use internally.

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
// Map coordinates → Screen pixels (relative to map container)
const screenPoint = map.toScreen({
  x: webMercatorX,
  y: webMercatorY,
  spatialReference: { wkid: 102100 }
});

// Screen pixels → Map coordinates
const mapPoint = map.toMap(screenPoint);
```

### For Mouse Clicks (Full Calculation)

```typescript
// Get iframe position on page
const frameBox = await esriFrame.frameElement().boundingBox();

// Get map container position within iframe
const mapOffset = await esriFrame.evaluate(() => {
  const mapDiv = document.getElementById("map");
  const rect = mapDiv.getBoundingClientRect();
  return { x: rect.x, y: rect.y };
});

// Convert map coords to screen coords, then to page coords
const screenCoords = map.toScreen(webMercatorPoint);
const pageX = frameBox.x + mapOffset.x + screenCoords.x;
const pageY = frameBox.y + mapOffset.y + screenCoords.y;

await page.mouse.click(pageX, pageY);
```

---

## Common Gotchas

### 1. `getLayer()` Throws - Use `_layers` Instead

```typescript
// BAD - throws "Cannot read properties of undefined"
const layer = map.getLayer("graphicsLayer3");

// GOOD - direct access to internal property
const layer = map._layers["graphicsLayer3"];
```

In this version of ArcGIS 3.x, `map.getLayer()` is defined but throws internal errors when called.

### 2. FeatureLayers Empty Despite Data Existing

```typescript
// FeatureLayers use on-demand loading (mode=1)
// If polygon is outside current extent, graphics.length === 0

// SOLUTION: Use REST API instead - always returns all features
const response = await fetch(`${featureServerUrl}/3/query?where=ImpactID='${permitId}'...`);
```

### 3. Template IDs Are Dynamic Per Session

```typescript
// BAD - ID changes every session
await page.click("#tpick-surface-6");

// GOOD - find by label text
for (const tpl of document.querySelectorAll("[id^='tpick-surface-']")) {
  if (tpl.textContent?.includes("Disturbed Area")) {
    // Use full mouse event simulation here!
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

### 6. `map.graphics.add()` Doesn't Persist

```typescript
// This creates a TEMPORARY graphic, not saved to FeatureServer
map.graphics.add(graphic);

// For persistence, use mouse-based drawing through the Editor widget
// or submit directly to FeatureServer via REST API (addFeatures endpoint)
```

### 7. Simple `.click()` Doesn't Work on Dojo Widgets

```typescript
// BAD - dojo/dijit widgets ignore this
element.click();

// GOOD - full mouse event sequence
el.dispatchEvent(new MouseEvent("mouseover", eventOptions));
el.dispatchEvent(new MouseEvent("mouseenter", eventOptions));
el.dispatchEvent(new MouseEvent("mousedown", eventOptions));
el.dispatchEvent(new MouseEvent("mouseup", eventOptions));
el.dispatchEvent(new MouseEvent("click", eventOptions));
```

---

## Critical Validation Rule

**NO permit in the entire 50,000+ permits database has null or zero acreage.**

If you see "0.0 Acres" after drawing a polygon:
- The polygon drawing FAILED
- The clicks went to the wrong place
- Check the map container offset
- Check template selection actually worked

This is the KEY indicator that something is wrong.

---

## Debugging Tips

### 1. Take Screenshots at Every Step

```typescript
await mapPopup.screenshot({ path: "step-1-before-template.png" });
// ... do template selection ...
await mapPopup.screenshot({ path: "step-2-after-template.png" });
// ... draw polygon ...
await mapPopup.screenshot({ path: "step-3-after-polygon.png" });
```

### 2. Check Template Selection State

```typescript
const state = await frame.evaluate(() => {
  const dijit = window.dijit;
  const editor = dijit.registry.byId("esri_dijit_editing_Editor_0");
  const tp = editor.templatePicker;
  const selected = tp.getSelected ? tp.getSelected() : null;

  return {
    selectedLayerName: selected?.featureLayer?.name || "none",
    selectedTemplateName: selected?.template?.name || "none",
    drawGeometryType: editor._drawToolbar?._geometryType || "none",
  };
});
```

### 3. Log Click Coordinates

Always log where clicks are going:
```typescript
console.log(`Frame box: ${frameBox.x}, ${frameBox.y}`);
console.log(`Map container offset: ${mapOffset.x}, ${mapOffset.y}`);
console.log(`Screen coord: ${screenCoord.x}, ${screenCoord.y}`);
console.log(`Final click: ${pageX}, ${pageY}`);
```

### 4. Verify Drawing Mode

```typescript
const mode = await frame.evaluate(() => {
  const editor = dijit.registry.byId("esri_dijit_editing_Editor_0");
  return editor._drawToolbar?._geometryType || "none";
});
// Should be "polygon" for Disturbed Area
// Should be "point" for Access Point
```

---

## Summary of Key Learnings

1. **Dojo/dijit widgets need full mouse event sequences** - not just click()
2. **Map container offset matters** - template picker takes ~410px on the left
3. **0.0 Acres = something is wrong** - always validate acreage after drawing
4. **Take screenshots** - visual debugging is essential
5. **REST API provides original coordinates** - use FeatureServer query
6. **Template IDs are dynamic** - find by text content, not ID
7. **Web Mercator to lat/lng conversion** - use the standard formulas
8. **Double-click closes polygon** - click vertices, then double-click first vertex
9. **Use `_layers` not `getLayer()`** - the method throws in this ArcGIS version
10. **Don't close confirmation popup early** - it invalidates the map popup

---

## Files Reference

### Test Files

| File | Purpose |
|------|---------|
| `tests/e2e/renew.test.ts` | Full renewal workflow with polygon drawing |
| `tests/e2e/map-full-workflow.test.ts` | End-to-end drawing workflow |
| `tests/e2e/map-drawing-spike.test.ts` | Initial discovery and validation |
| `tests/e2e/map-read-features-spike.test.ts` | Reading polygon data via REST API |

### Source Files

| File | Purpose |
|------|---------|
| `src/portal/create/fill/page2/map.ts` | Map popup handling utilities |
| `tests/e2e/utils/page2-state.ts` | Page 2 state verification |
| `scripts/analyze-permit-coords.ts` | REST API coordinate analysis tool |

### Planning Artifacts

| File | Purpose |
|------|---------|
| `.planning/phases/02-drawing-engine/SPIKE-RESULTS.md` | Historical spike test results |

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

### Full Mouse Event Sequence

```typescript
const eventOptions = {
  bubbles: true, cancelable: true, view: window,
  clientX: rect.x + rect.width / 2,
  clientY: rect.y + rect.height / 2,
  button: 0, buttons: 1,
};
el.dispatchEvent(new MouseEvent("mouseover", eventOptions));
el.dispatchEvent(new MouseEvent("mouseenter", eventOptions));
el.dispatchEvent(new MouseEvent("mousedown", eventOptions));
el.dispatchEvent(new MouseEvent("mouseup", eventOptions));
el.dispatchEvent(new MouseEvent("click", eventOptions));
```
