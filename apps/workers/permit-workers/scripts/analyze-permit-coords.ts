/**
 * Analyze permit coordinates from REST API
 *
 * Run: bun scripts/analyze-permit-coords.ts D0064518
 */

const permitId = process.argv[2] || "D0064518";
const baseUrl = "https://gis.maricopa.gov/arcgis/rest/services/AQD/DustControl/FeatureServer";

// Web Mercator to lat/lng conversion
function webMercatorToLatLng(x: number, y: number): { lat: number; lng: number } {
  const lng = (x * 180) / 20_037_508.34;
  const lat = (Math.atan(Math.exp((y * Math.PI) / 20_037_508.34)) * 360) / Math.PI - 90;
  return { lat, lng };
}

// Calculate polygon area using Shoelace formula (in Web Mercator, result in sq meters)
function calculatePolygonArea(coords: Array<{ x: number; y: number }>): number {
  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ci = coords[i];
    const cj = coords[j];
    if (ci && cj) {
      area += ci.x * cj.y;
      area -= cj.x * ci.y;
    }
  }
  return Math.abs(area / 2);
}

// Square meters to acres
const SQ_METERS_TO_ACRES = 0.000247105;

interface FeatureResponse {
  features?: Array<{
    geometry?: {
      rings?: number[][][];
      paths?: number[][][];
      x?: number;
      y?: number;
    };
    attributes?: Record<string, unknown>;
  }>;
  error?: { message: string };
}

async function analyzePermit() {
  console.log(`\n=== Analyzing Permit ${permitId} ===\n`);

  for (let layerIndex = 0; layerIndex <= 5; layerIndex++) {
    const queryUrl = `${baseUrl}/${layerIndex}/query?where=ImpactID%3D%27${permitId}%27&outFields=*&returnGeometry=true&f=json`;

    try {
      const response = await fetch(queryUrl);
      const data = await response.json() as FeatureResponse;

      if (data.error || !data.features || data.features.length === 0) continue;

      console.log(`Layer ${layerIndex}: ${data.features.length} feature(s)`);

      for (const feature of data.features) {
        const geom = feature.geometry;
        const attrs = feature.attributes;

        if (geom?.rings) {
          // Polygon
          for (let ringIdx = 0; ringIdx < geom.rings.length; ringIdx++) {
            const ring = geom.rings[ringIdx];
            if (!ring) continue;

            console.log(`  Polygon ring ${ringIdx}: ${ring.length} vertices`);

            // Show first few vertices in both Web Mercator and Lat/Lng
            console.log("  Raw Web Mercator coords (first 4):");
            for (let i = 0; i < Math.min(4, ring.length); i++) {
              const coord = ring[i];
              if (!coord) continue;
              const [x, y] = coord;
              if (x === undefined || y === undefined) continue;
              const latLng = webMercatorToLatLng(x, y);
              console.log(`    [${i}]: WM(${x.toFixed(2)}, ${y.toFixed(2)}) => LatLng(${latLng.lat.toFixed(6)}, ${latLng.lng.toFixed(6)})`);
            }

            // Calculate area
            const coords = ring.map((c) => ({ x: c[0] ?? 0, y: c[1] ?? 0 }));
            const areaSqMeters = calculatePolygonArea(coords);
            const areaAcres = areaSqMeters * SQ_METERS_TO_ACRES;
            console.log(`  Calculated area: ${areaSqMeters.toFixed(2)} sq meters = ${areaAcres.toFixed(4)} acres`);

            // Show relevant attributes
            if (attrs) {
              console.log(`  Attributes:`, JSON.stringify({
                OBJECTID: attrs.OBJECTID,
                ImpactID: attrs.ImpactID,
                Acreage: attrs.Acreage,
                LayerType: attrs.LayerType,
              }, null, 2));
            }
          }
        } else if (geom?.x !== undefined && geom?.y !== undefined) {
          // Point
          const latLng = webMercatorToLatLng(geom.x, geom.y);
          console.log(`  Point: WM(${geom.x.toFixed(2)}, ${geom.y.toFixed(2)}) => LatLng(${latLng.lat.toFixed(6)}, ${latLng.lng.toFixed(6)})`);
          if (attrs) {
            console.log(`  Attributes:`, JSON.stringify({
              OBJECTID: attrs.OBJECTID,
              ImpactID: attrs.ImpactID,
              Type: attrs.Type || attrs.SUBTYPE,
            }, null, 2));
          }
        }
      }
      console.log();
    } catch {
      // Continue
    }
  }
}

analyzePermit();
