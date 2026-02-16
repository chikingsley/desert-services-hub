# Map Drawing Spike Results

**Date:** 2025-01-25
**Updated:** 2026-02-04
**Status:** COMPLETE - Full end-to-end workflow validated

**See also:**
- `docs/ESRI-MAP-DRAWING-GUIDE.md` - **Primary guide** with all critical fixes (supersedes .planning/research/)
- `tests/e2e/map-read-features-spike.test.ts` - Reading features spike (REST API approach)

## Summary

We validated and implemented the full map drawing workflow on the Maricopa County ESRI map popup. The portal uses ArcGIS 3.x with dijit widgets, and we can:

1. Look up parcel data by address (polygon coordinates, centroid)
2. Open the map popup and access the Editor widget
3. Programmatically pan/zoom to parcel location using `centerAndZoom()`
4. Select drawing templates by label text (IDs are dynamic)
5. Draw polygons using actual parcel coordinates
6. Place access points
7. Save and close the map

## Key Technical Findings

### Map Access Path

```typescript
// The map is NOT directly in dijit registry
// Access via Editor widget's _drawToolbar or settings:
const dijit = window.dijit;
const editor = dijit.registry.byId("esri_dijit_editing_Editor_0");
const map = editor._drawToolbar.map;  // or editor.settings.map

// Map is esri.Map with:
// - map.centerAndZoom(point, level) - pan and zoom
// - map.toScreen(point) - coordinate conversion
// - map.spatialReference.wkid = 102100 (Web Mercator)
```

### Template Selection (IMPORTANT: Use Label, Not ID)

Template IDs are **dynamically assigned** per session (e.g., `tpick-surface-6` in one session, `tpick-surface-18` in another). Always select by label text:

```typescript
// Find template by label text, not hardcoded ID
const tpicks = document.querySelectorAll("[id^='tpick-surface-']");
for (const tpick of tpicks) {
  if (tpick.textContent?.toLowerCase().includes("disturbed area")) {
    tpick.click();
    break;
  }
}

// Verify drawing mode activated:
editor._drawToolbar._geometryType === "polygon"  // or "point" for Access Point
```

### Available Templates

| Label | Geometry | Required |
|-------|----------|----------|
| Disturbed Area | polygon | Yes |
| Access Point | point | Yes |
| Unpaved Parking | polygon | No |
| Storage Pile | polygon | No |
| Dust Control Site | polygon | No |
| Linear Project | polyline | No |

### Map Navigation (Programmatic)

The search box autocomplete is unreliable. Use programmatic pan/zoom instead:

```typescript
// Convert lat/lng (WGS84) to Web Mercator
const toWebMercator = (lat: number, lng: number) => ({
  x: (lng * 20037508.34) / 180,
  y: Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * (20037508.34 / Math.PI),
  spatialReference: { wkid: 102100 },
});

// Pan and zoom to location
const point = toWebMercator(parcelData.centroid.lat, parcelData.centroid.lng);
map.centerAndZoom(point, 18);  // Zoom level 18 for parcel detail
```

### Drawing Workflow

```typescript
// 1. Pan to parcel centroid
map.centerAndZoom(webMercatorPoint, 18);

// 2. Select template by label
selectTemplateByLabel("Disturbed Area");

// 3. Draw vertices with mouse clicks
for (const vertex of screenCoords) {
  await page.mouse.click(frameBox.x + vertex.x, frameBox.y + vertex.y);
  await sleep(400);
}

// 4. Double-click to complete polygon
await page.mouse.dblclick(frameBox.x + first.x, frameBox.y + first.y);

// 5. Portal automatically:
//    - Closes the polygon
//    - Calculates acreage
//    - Creates FeatureLayer entry
```

### Coordinate Conversion

```typescript
// Convert lat/lng (WGS84) to Web Mercator (EPSG:3857)
const toWebMercator = (lat: number, lng: number) => ({
  x: (lng * 20037508.34) / 180,
  y: Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * (20037508.34 / Math.PI),
});

// Convert Web Mercator to screen pixels
const screenPoint = map.toScreen({
  x: webMercatorX,
  y: webMercatorY,
  spatialReference: { wkid: 102100 }
});
```

### Address Lookup

Only use street address for parcel lookup - city/state breaks the search:

```typescript
// CORRECT - street address only
const parcels = await queryParcelsByAddress("4837 N Granite Reef Rd");

// WRONG - includes city/state (returns 0 results)
const parcels = await queryParcelsByAddress("4837 N Granite Reef Rd, Scottsdale, AZ");
```

### Save Button

The save button is an image element:

```typescript
// Save and Close button selector
const saveBtn = page.$('img[alt="Save and Close"]');
await saveBtn.click();
```

## What Works

| Feature | Status | Notes |
|---------|--------|-------|
| Parcel lookup by address | ✅ | Use street address only, no city/state |
| Programmatic map pan/zoom | ✅ | `map.centerAndZoom()` with Web Mercator coords |
| Template selection by label | ✅ | IDs are dynamic, must find by text content |
| Polygon drawing mode | ✅ | `_drawToolbar._geometryType === "polygon"` |
| Point drawing mode | ✅ | `_drawToolbar._geometryType === "point"` |
| Mouse click vertices | ✅ | Works on map area using screen coords |
| Double-click to complete | ✅ | Closes polygon |
| Acreage calculation | ✅ | Portal calculates automatically |
| FeatureLayer persistence | ✅ | Features saved to permit |
| Save and Close | ✅ | `img[alt="Save and Close"]` |

## What Doesn't Work (or Has Caveats)

| Feature | Status | Notes |
|---------|--------|-------|
| Direct `map.graphics.add()` | ❌ | Creates temp graphic, doesn't persist |
| Search box autocomplete | ⚠️ | Unreliable, use programmatic pan instead |
| Address with city/state | ❌ | PHYSICAL_ADDRESS field is street only |
| Template selection by ID | ❌ | IDs are dynamic per session |

## Test Files

- `tests/e2e/map-full-workflow.test.ts` - **Complete end-to-end workflow**
- `tests/e2e/map-drawing-spike.test.ts` - Initial discovery and validation
- `tests/e2e/map-drawing-workflow.test.ts` - Template click + mouse drawing
- `tests/e2e/map-read-features-spike.test.ts` - **Reading polygon data via REST API**
- `tests/e2e/screenshots/full-workflow-*.png` - Visual evidence

## Completed Steps

1. ✅ **Parcel lookup** - `queryParcelsByAddress()` returns polygon coordinates
2. ✅ **Map navigation** - Programmatic `centerAndZoom()` to parcel centroid
3. ✅ **Template selection** - Find by label text (handles dynamic IDs)
4. ✅ **Draw parcel polygon** - Using actual parcel coordinates
5. ✅ **Draw Access Point** - Required for permit
6. ✅ **Save and Close** - Click `img[alt="Save and Close"]`
7. ✅ **Feature persistence** - Confirmed saved to permit

## Key Helper Functions

From `tests/e2e/map-full-workflow.test.ts`:

- `panToCoordinates(frame, lat, lng, zoomLevel)` - Programmatic map navigation
- `selectTemplateByLabel(frame, label)` - Template selection by text
- `getScreenCoords(frame, polygon)` - Convert lat/lng to screen pixels
- `drawPolygon(page, frameBox, vertices)` - Draw polygon via mouse clicks
- `drawPoint(page, frameBox, point)` - Draw point via mouse click
- `clickSaveAndClose(page)` - Click save button

## Integration Notes

For production use:
1. Extract helper functions to `src/portal/create/fill/page2/map.ts`
2. Parcel data comes from `src/lib/assessor.ts`
3. Use `waitForEditor()` to ensure map is ready before operations
4. Always close search dropdowns before template selection
