# Phase 1: Location Pipeline & Coordinate Foundation - Research

**Researched:** 2026-01-24
**Domain:** Geospatial data processing, PDF extraction, coordinate systems
**Confidence:** HIGH

## Summary

Phase 1 establishes the foundation for all subsequent map automation: determining WHERE to draw (consensus location from multiple signals) and HOW to transform coordinates (WGS84 lat/lng to Web Mercator meters to screen pixels). The existing codebase already has working parcel lookup via `src/lib/assessor.ts` and ESRI iframe access patterns in `src/portal/create/fill/page2/map.ts`.

The research confirms the approach outlined in the project SUMMARY.md is sound:
- **Gemini 2.5** for PDF address extraction with structured JSON output using Zod schemas
- **Simple greedy clustering** (not DBSCAN) for location consensus - adequate for 3-10 signals with 500m radius
- **proj4** for coordinate transformation with typed wrappers
- **Haversine formula** (inline implementation) for distance calculations

**Primary recommendation:** Build a pipeline that extracts multiple location signals from PDFs, geocodes all of them, clusters nearby coordinates, scores by source reliability, and returns a consensus location with confidence. Start simple - the clustering algorithm can be naive greedy clustering rather than full DBSCAN, since we typically have <10 signals.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| proj4 | ^2.12.0 | Coordinate transformation WGS84 <-> Web Mercator | Industry standard, predefined EPSG:3857/4326 |
| @google/genai | ^1.34.0 | PDF extraction with Gemini 2.5 | Already in deps, native PDF vision |
| zod | ^4.3.4 | Schema validation for extracted data | Already in deps, native JSON Schema for Gemini |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @turf/centroid | ^7.0.0 | Calculate polygon centroids | When parcel polygons need center point |
| @turf/boolean-point-in-polygon | ^7.0.0 | Check if point inside polygon | Validating location is within parcel |
| haversine-distance | ^1.2.1 | Distance between coordinates | Alternative to inline haversine |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| proj4 | Manual formulas | proj4 handles datum transformations and edge cases |
| density-clustering (DBSCAN) | Simple greedy clustering | DBSCAN overkill for <10 points; greedy is simpler |
| @turf/turf (full) | Individual @turf/* packages | Full package is large; import only what's needed |

**Installation:**
```bash
bun add proj4 @types/proj4 @turf/centroid @turf/boolean-point-in-polygon
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lib/
│   ├── location/
│   │   ├── types.ts           # LocationSignal, GeoCoord, MapCoord, ScreenCoord
│   │   ├── extract.ts         # Gemini PDF extraction
│   │   ├── geocode.ts         # Address/intersection geocoding
│   │   ├── cluster.ts         # Greedy clustering algorithm
│   │   ├── consensus.ts       # Aggregate signals into consensus
│   │   ├── transform.ts       # proj4 coordinate transformation
│   │   └── pipeline.ts        # Orchestrate full pipeline
│   └── assessor.ts            # Existing parcel lookup (keep)
└── portal/
    └── create/fill/page2/
        └── map.ts             # Existing iframe access (keep)
```

### Pattern 1: Typed Coordinate System

**What:** Branded types for coordinate systems to prevent mixing
**When to use:** All coordinate handling code

```typescript
// Source: proj4js patterns + TypeScript branded types
type Brand<K, T> = K & { __brand: T };

export type GeoCoord = Brand<{ lat: number; lng: number }, "WGS84">;
export type MapCoord = Brand<{ x: number; y: number }, "WebMercator">;
export type ScreenCoord = Brand<{ x: number; y: number }, "Screen">;

// Factory functions enforce correct construction
export const geoCoord = (lat: number, lng: number): GeoCoord =>
  ({ lat, lng } as GeoCoord);

export const mapCoord = (x: number, y: number): MapCoord =>
  ({ x, y } as MapCoord);

export const screenCoord = (x: number, y: number): ScreenCoord =>
  ({ x, y } as ScreenCoord);
```

### Pattern 2: Location Signal with Confidence

**What:** Each location source has typed confidence and provenance
**When to use:** All geocoding and aggregation

```typescript
// Source: docs/auto-custom-map-for-dust-permit/TODO-2024-12-27-317pm.md design
export type SignalSource =
  | "address_title_block"    // From PDF title block - highest reliability
  | "address_body"           // From PDF body text
  | "intersection"           // Cross-street geocoding
  | "project_name"           // Project name search
  | "parcel_lookup";         // APN-based lookup

export const SIGNAL_WEIGHTS: Record<SignalSource, number> = {
  address_title_block: 0.95,
  address_body: 0.85,
  intersection: 0.70,
  project_name: 0.60,
  parcel_lookup: 0.95,
} as const;

export interface LocationSignal {
  source: SignalSource;
  query: string;              // What we searched for
  coords: GeoCoord | null;    // Result (null if geocode failed)
  confidence: number;         // 0-1 based on source weight
  rawResponse?: unknown;      // Debug info
}
```

### Pattern 3: Pipeline Result with Confidence Gate

**What:** Pipeline returns structured result with overall confidence score
**When to use:** End of location pipeline

```typescript
export interface LocationPipelineResult {
  // All signals collected
  signals: LocationSignal[];

  // Clustering results
  clusters: LocationCluster[];
  primaryCluster: LocationCluster | null;
  outliers: LocationSignal[];

  // Final consensus
  consensusLocation: GeoCoord | null;
  consensusConfidence: number;  // 0-1, used for auto-commit threshold

  // Parcel data if available
  parcel: ParcelData | null;

  // Debug
  processingLog: string[];
}

export interface LocationCluster {
  centroid: GeoCoord;
  signals: LocationSignal[];
  radiusMeters: number;
  totalConfidence: number;
}
```

### Anti-Patterns to Avoid

- **Raw number coordinates:** Never use `{ x: number, y: number }` without branded type - leads to coordinate system confusion
- **Geocoding in loops without batching:** Each geocode is an API call; batch where possible
- **Ignoring geocode failures:** A failed geocode should reduce confidence, not crash pipeline
- **Single-source location:** Always prefer consensus from multiple signals over trusting one source

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Coordinate projection | Custom math formulas | proj4 | Handles datum shifts, edge cases, all EPSG codes |
| Distance between coordinates | Basic Euclidean | Haversine (inline or package) | Earth is curved; lat/lng are not Cartesian |
| Polygon centroid | Average of vertices | @turf/centroid | Handles complex polygons, weighted centroids |
| JSON Schema from Zod | Manual schema definition | `z.toJSONSchema()` (Zod v4 native) | zod-to-json-schema broken with Zod v4 |
| PDF text extraction | pdf-parse or manual | Gemini vision API | Handles images, diagrams, tables natively |

**Key insight:** The coordinate transformation chain (Geo -> Map -> Screen) involves three coordinate systems with different units and origins. proj4 handles Geo <-> Map correctly; the Map <-> Screen conversion requires ESRI MapView methods from inside the iframe.

## Common Pitfalls

### Pitfall 1: Zod v4 + zodToJsonSchema Incompatibility

**What goes wrong:** Using `zodToJsonSchema()` from `zod-to-json-schema` with Zod v4 returns incomplete schemas - only `{ "$schema": "..." }` without properties
**Why it happens:** zod-to-json-schema v3.25 was built for Zod v3; it silently fails with v4
**How to avoid:** Use Zod v4's native `z.toJSONSchema()` method instead
**Warning signs:** Gemini returns unstructured text instead of JSON; empty extraction results

```typescript
// WRONG - breaks with Zod v4
import { zodToJsonSchema } from "zod-to-json-schema";
const jsonSchema = zodToJsonSchema(mySchema); // Returns incomplete schema!

// CORRECT - Zod v4 native
import { z } from "zod";
const jsonSchema = z.toJSONSchema(mySchema); // Works correctly
```

### Pitfall 2: Coordinate System Confusion (WGS84 vs Web Mercator)

**What goes wrong:** Treating lat/lng as x/y in meters causes 40km+ positioning errors
**Why it happens:** Both are represented as `{ x: number, y: number }` or `[number, number]`
**How to avoid:** Use branded types; always convert explicitly through transform functions
**Warning signs:** Parcel lookups return wrong parcels; map zooms to wrong location

```typescript
// WRONG
const point = { x: -112.0, y: 33.5 }; // Is this WGS84 or Web Mercator?

// CORRECT
const geo = geoCoord(33.5, -112.0);         // Explicitly WGS84
const map = geoToMap(geo);                   // Explicitly converted
```

### Pitfall 3: Geocoding Rate Limits and Failures

**What goes wrong:** Pipeline crashes when geocoding fails or rate limits hit
**Why it happens:** External APIs are unreliable; not all addresses geocode
**How to avoid:** Wrap geocoding in try-catch; return null coords; reduce confidence for failures
**Warning signs:** Pipeline hangs; "Too many requests" errors; null pointer exceptions

```typescript
// WRONG
const coords = await geocodeAddress(address); // Crashes if API fails

// CORRECT
const signal = await geocodeWithFallback(address);
// Returns { coords: null, confidence: 0 } on failure instead of throwing
```

### Pitfall 4: Clustering with Too Few Points

**What goes wrong:** DBSCAN requires minPts parameter; with 2-3 signals all become noise
**Why it happens:** DBSCAN designed for large datasets; our pipeline has 3-10 signals typically
**How to avoid:** Use simple greedy clustering instead of DBSCAN for small signal counts
**Warning signs:** All signals marked as outliers; empty clusters array

### Pitfall 5: PDF Extraction Returning Wrong Address

**What goes wrong:** System uses contractor office address instead of construction site
**Why it happens:** PDFs contain 5-10 addresses; naive extraction picks first one found
**How to avoid:** Extract ALL addresses with context (title block vs body vs footer); weight by context
**Warning signs:** Location 20+ miles from expected area; consensus confidence low

## Code Examples

Verified patterns from official sources:

### proj4 Coordinate Transformation

```typescript
// Source: https://github.com/proj4js/proj4js
import proj4 from "proj4";

// EPSG:4326 (WGS84) and EPSG:3857 (Web Mercator) are predefined
const WGS84 = "EPSG:4326";
const WEB_MERCATOR = "EPSG:3857";

export function geoToMap(geo: GeoCoord): MapCoord {
  // proj4 uses [lng, lat] order, not [lat, lng]!
  const [x, y] = proj4(WGS84, WEB_MERCATOR, [geo.lng, geo.lat]);
  return mapCoord(x, y);
}

export function mapToGeo(map: MapCoord): GeoCoord {
  const [lng, lat] = proj4(WEB_MERCATOR, WGS84, [map.x, map.y]);
  return geoCoord(lat, lng);
}
```

### Haversine Distance (Inline Implementation)

```typescript
// Source: https://www.movable-type.co.uk/scripts/latlong.html
const EARTH_RADIUS_METERS = 6371e3;

export function haversineDistance(a: GeoCoord, b: GeoCoord): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const deltaPhi = toRad(b.lat - a.lat);
  const deltaLambda = toRad(b.lng - a.lng);

  const h =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}
```

### Gemini PDF Extraction with Zod v4

```typescript
// Source: https://ai.google.dev/gemini-api/docs/structured-output + Zod v4 docs
import { GoogleGenAI, createPartFromUri, createUserContent } from "@google/genai";
import { z } from "zod";

const LocationExtractionSchema = z.object({
  addresses: z.array(z.object({
    text: z.string().describe("Full address as found in document"),
    context: z.enum(["title_block", "body", "footer", "unknown"])
      .describe("Where in the document this address was found"),
    isProjectSite: z.boolean()
      .describe("True if this appears to be the construction site address"),
  })),
  intersections: z.array(z.object({
    road1: z.string(),
    road2: z.string(),
  })),
  projectName: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
});

type LocationExtraction = z.infer<typeof LocationExtractionSchema>;

export async function extractLocationsFromPDF(
  ai: GoogleGenAI,
  pdfPath: string
): Promise<LocationExtraction> {
  // Upload PDF to Files API for large files
  const uploadedFile = await ai.files.upload({
    file: pdfPath,
    config: { mimeType: "application/pdf" },
  });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: createUserContent([
      createPartFromUri(uploadedFile.uri!, uploadedFile.mimeType!),
      `Extract ALL addresses and location signals from this construction/grading plan PDF.

       Look for:
       - Addresses in the title block (usually the project site)
       - Addresses elsewhere (may be contractor, engineer, or material suppliers)
       - Street intersections mentioned (e.g., "NE corner of Bell Rd and 99th Ave")
       - Project name
       - City and state

       The title block address is most likely the actual construction site.
       Mark isProjectSite=true for addresses that appear to be the site location.`,
    ]),
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(LocationExtractionSchema),
    },
  });

  // Cleanup uploaded file
  await ai.files.delete({ name: uploadedFile.name! });

  return LocationExtractionSchema.parse(JSON.parse(response.text ?? "{}"));
}
```

### Simple Greedy Clustering

```typescript
// Source: Simplified from density-clustering DBSCAN for small datasets
const CLUSTER_RADIUS_METERS = 500;

export function clusterSignals(
  signals: LocationSignal[]
): { clusters: LocationCluster[]; outliers: LocationSignal[] } {
  const validSignals = signals.filter((s) => s.coords !== null);
  const clusters: LocationCluster[] = [];
  const used = new Set<number>();

  for (let i = 0; i < validSignals.length; i++) {
    if (used.has(i)) continue;

    const clusterSignals: LocationSignal[] = [validSignals[i]!];
    used.add(i);

    // Find all signals within radius
    for (let j = i + 1; j < validSignals.length; j++) {
      if (used.has(j)) continue;

      const distance = haversineDistance(
        validSignals[i]!.coords!,
        validSignals[j]!.coords!
      );

      if (distance <= CLUSTER_RADIUS_METERS) {
        clusterSignals.push(validSignals[j]!);
        used.add(j);
      }
    }

    // Calculate cluster centroid (simple average)
    const centroid = calculateCentroid(
      clusterSignals.map((s) => s.coords!)
    );

    clusters.push({
      centroid,
      signals: clusterSignals,
      radiusMeters: calculateMaxRadius(centroid, clusterSignals),
      totalConfidence: clusterSignals.reduce(
        (sum, s) => sum + s.confidence,
        0
      ),
    });
  }

  // Sort by total confidence (best cluster first)
  clusters.sort((a, b) => b.totalConfidence - a.totalConfidence);

  // Signals that weren't clustered are outliers
  const outliers = signals.filter((_, i) => !used.has(i));

  return { clusters, outliers };
}

function calculateCentroid(coords: GeoCoord[]): GeoCoord {
  const sumLat = coords.reduce((sum, c) => sum + c.lat, 0);
  const sumLng = coords.reduce((sum, c) => sum + c.lng, 0);
  return geoCoord(sumLat / coords.length, sumLng / coords.length);
}

function calculateMaxRadius(
  centroid: GeoCoord,
  signals: LocationSignal[]
): number {
  return Math.max(
    ...signals.map((s) => haversineDistance(centroid, s.coords!))
  );
}
```

### ESRI MapView Coordinate Conversion (iframe)

```typescript
// Source: https://developers.arcgis.com/javascript/latest/api-reference/esri-views-MapView.html
// This runs INSIDE the ESRI iframe via frame.evaluate()

export async function mapToScreen(
  frame: Frame,
  mapCoord: MapCoord
): Promise<ScreenCoord> {
  const screen = await frame.evaluate(
    ({ x, y }) => {
      // Access the MapView instance (name varies by ESRI app)
      const view = (window as any).view ||
                   (window as any).mapView ||
                   (window as any).jimuMapView?.view;

      if (!view?.toScreen) {
        throw new Error("MapView not found or toScreen unavailable");
      }

      const point = {
        x,
        y,
        spatialReference: { wkid: 3857 }, // Web Mercator
      };

      const screenPoint = view.toScreen(point);
      return { x: screenPoint.x, y: screenPoint.y };
    },
    { x: mapCoord.x, y: mapCoord.y }
  );

  return screenCoord(screen.x, screen.y);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `zodToJsonSchema()` for Gemini | `z.toJSONSchema()` native | Zod v4 (2024) | Must use native method or schema breaks |
| Gemini 2.0 Flash | Gemini 2.5 Flash | 2025 | 2.0 Flash retired March 2026; use 2.5 |
| Manual PDF parsing | Gemini vision on PDF | 2024-2025 | Native PDF support, no page-by-page |
| DBSCAN for all clustering | Simple greedy for small N | Always | DBSCAN overkill for <10 points |

**Deprecated/outdated:**
- `zod-to-json-schema` - Broken with Zod v4; use native `z.toJSONSchema()`
- Gemini 2.0 Flash/Flash-Lite - Retired March 3, 2026; use 2.5 models
- pdf-parse for construction plans - Gemini handles images/diagrams natively

## Open Questions

Things that couldn't be fully resolved:

1. **ESRI MapView global object name**
   - What we know: Could be `window.view`, `window.mapView`, `jimuMapView.view`, or custom
   - What's unclear: Exact name on gis.maricopa.gov iframe
   - Recommendation: Try multiple names in sequence; log for debugging

2. **Geocoding API choice**
   - What we know: Google Maps API is reliable but costs money; OSM Nominatim is free but rate-limited
   - What's unclear: Which API the existing codebase uses (if any)
   - Recommendation: Start with Google Maps API; add Nominatim as fallback

3. **Confidence threshold for auto-commit**
   - What we know: 0.80 suggested in SUMMARY.md
   - What's unclear: Whether this is calibrated to real PDF diversity
   - Recommendation: Start at 0.80; tune based on false positive rate in testing

## Sources

### Primary (HIGH confidence)

- [proj4js GitHub](https://github.com/proj4js/proj4js) - Coordinate transformation API, TypeScript types
- [Gemini Document Understanding](https://ai.google.dev/gemini-api/docs/document-processing) - PDF processing limits and patterns
- [Gemini Structured Output](https://ai.google.dev/gemini-api/docs/structured-output) - JSON Schema with Zod integration
- [Zod JSON Schema Docs](https://zod.dev/json-schema) - Native `z.toJSONSchema()` API
- [ArcGIS MapView API](https://developers.arcgis.com/javascript/latest/api-reference/esri-views-MapView.html) - toScreen()/toMap() methods
- [Movable Type Haversine](https://www.movable-type.co.uk/scripts/latlong.html) - Reference implementation

### Secondary (MEDIUM confidence)

- [density-clustering GitHub](https://github.com/uhho/density-clustering) - DBSCAN API (not using, but reference)
- [GeoDBSCAN](https://github.com/HyperARCo/GeoDBSCAN) - TypeScript geospatial clustering
- [Zod v4 Gemini Fix Blog](https://www.buildwithmatija.com/blog/zod-v4-gemini-fix-structured-output-z-tojsonschema) - zodToJsonSchema incompatibility explained
- [Google Structured Outputs Announcement](https://blog.google/technology/developers/gemini-api-structured-outputs/) - propertyOrdering support

### Tertiary (LOW confidence - needs validation)

- Existing `docs/auto-custom-map-for-dust-permit/TODO-2024-12-27-317pm.md` - Architecture design (not implemented, needs validation)
- WebSearch results for clustering algorithms - General patterns, not verified against this use case

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Libraries are well-documented, already in use or standard
- Architecture: HIGH - Pipeline pattern is proven, typed coordinates are best practice
- Pitfalls: HIGH - Zod v4 issue verified with multiple sources; coordinate confusion is well-documented
- Code examples: MEDIUM - Based on official docs but not tested against gis.maricopa.gov

**Research date:** 2026-01-24
**Valid until:** 2026-02-24 (30 days - stable domain)
