/**
 * Map Page — MapLibre GL + Maricopa County parcel overlay + polygon drawing
 *
 * Draw disturbed area boundaries, view APN parcels, export GeoJSON.
 */
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  TerraDraw,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";

import { PageHeader } from "@/apps/web/frontend/components/page-header";

// Maricopa County Assessor parcel tile server (public, no auth)
const PARCEL_TILE_URL =
  "https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&f=image&layers=show:0";

// Maricopa County ArcGIS parcel query endpoint
const PARCEL_QUERY_URL =
  "https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/0/query";

// Phoenix metro center
const DEFAULT_CENTER: [number, number] = [-112.07, 33.45];
const DEFAULT_ZOOM = 11;

type BasemapStyle = "streets" | "satellite";

const BASEMAP_STYLES: Record<BasemapStyle, maplibregl.StyleSpecification> = {
  streets: {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "&copy; OpenStreetMap contributors",
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  },
  satellite: {
    version: 8,
    sources: {
      satellite: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: "&copy; Esri",
      },
    },
    layers: [{ id: "satellite", type: "raster", source: "satellite" }],
  },
};

type ParcelResult = {
  apn: string;
  address: string | null;
  owner: string | null;
  acres: number | null;
  centroid: { lat: number; lng: number };
  polygon: Array<{ lat: number; lng: number }>;
};

async function queryParcelByAPN(apn: string): Promise<ParcelResult | null> {
  const cleanApn = apn.replace(/[-\s.]/g, "");
  const params = new URLSearchParams({
    where: `APN = '${cleanApn}'`,
    outFields: "*",
    outSR: "4326",
    returnGeometry: "true",
    f: "json",
  });

  const response = await fetch(`${PARCEL_QUERY_URL}?${params.toString()}`);
  const data = await response.json();

  if (data.error || !data.features?.length) return null;

  const feature = data.features[0];
  const attrs = feature.attributes || {};
  const rings: number[][] = feature.geometry?.rings?.[0] || [];

  const polygon = rings.map((coord: number[]) => ({
    lat: coord[1] ?? 0,
    lng: coord[0] ?? 0,
  }));

  let centroidLat = 0;
  let centroidLng = 0;
  for (const point of polygon) {
    centroidLat += point.lat;
    centroidLng += point.lng;
  }
  if (polygon.length > 0) {
    centroidLat /= polygon.length;
    centroidLng /= polygon.length;
  }

  return {
    apn: String(attrs.APN || cleanApn),
    address: attrs.PHYSICAL_ADDRESS || attrs.SITUS || null,
    owner: attrs.OWNER_NAME || attrs.OWNER || null,
    acres: attrs.LAND_SIZE || attrs.ACRES || null,
    centroid: { lat: centroidLat, lng: centroidLng },
    polygon,
  };
}

function addParcelLayer(map: maplibregl.Map) {
  if (map.getSource("parcels")) return;

  map.addSource("parcels", {
    type: "raster",
    tiles: [PARCEL_TILE_URL],
    tileSize: 512,
  });
  map.addLayer({
    id: "parcels",
    type: "raster",
    source: "parcels",
    paint: { "raster-opacity": 0.7 },
    minzoom: 14,
  });
}

export function MapPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);

  const [basemap, setBasemap] = useState<BasemapStyle>("streets");
  const [parcelsVisible, setParcelsVisible] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<ParcelResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [drawnGeoJSON, setDrawnGeoJSON] = useState<string>("");
  const [drawingActive, setDrawingActive] = useState(false);
  const [copied, setCopied] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: BASEMAP_STYLES[basemap],
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 200 }),
      "bottom-left",
    );

    map.on("load", () => {
      addParcelLayer(map);

      // Initialize terra-draw
      const adapter = new TerraDrawMapLibreGLAdapter({ map });
      const draw = new TerraDraw({
        adapter,
        modes: [
          new TerraDrawPolygonMode({
            styles: {
              fillColor: "#ff5722",
              fillOpacity: 0.2,
              outlineColor: "#ff5722",
              outlineWidth: 2,
              closingPointColor: "#ff5722",
              closingPointWidth: 6,
              closingPointOutlineColor: "#fff",
              closingPointOutlineWidth: 2,
            },
          }),
          new TerraDrawSelectMode({
            flags: {
              polygon: {
                feature: {
                  draggable: true,
                  coordinates: {
                    midpoints: true,
                    draggable: true,
                    deletable: true,
                  },
                },
              },
            },
          }),
        ],
      });

      draw.start();
      draw.on("finish", () => updateGeoJSON(draw));
      draw.on("change", () => updateGeoJSON(draw));

      drawRef.current = draw;
    });

    mapRef.current = map;

    return () => {
      drawRef.current?.stop();
      map.remove();
      mapRef.current = null;
      drawRef.current = null;
    };
    // Only run on mount
    // biome-ignore lint/correctness/useExhaustiveDependencies: init once
  }, []);

  // Switch basemap
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const center = map.getCenter();
    const zoom = map.getZoom();

    map.setStyle(BASEMAP_STYLES[basemap]);

    map.once("style.load", () => {
      map.setCenter(center);
      map.setZoom(zoom);
      addParcelLayer(map);
    });
  }, [basemap]);

  // Toggle parcel visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("parcels")) return;
    map.setLayoutProperty(
      "parcels",
      "visibility",
      parcelsVisible ? "visible" : "none",
    );
  }, [parcelsVisible]);

  const updateGeoJSON = useCallback((draw: TerraDraw) => {
    const snapshot = draw.getSnapshot();
    const polygons = snapshot.filter(
      (f) => f.geometry.type === "Polygon" && f.properties.mode === "polygon",
    );
    if (polygons.length === 0) {
      setDrawnGeoJSON("");
      return;
    }
    const fc = {
      type: "FeatureCollection" as const,
      features: polygons.map((f) => ({
        type: "Feature" as const,
        geometry: f.geometry,
        properties: {},
      })),
    };
    setDrawnGeoJSON(JSON.stringify(fc, null, 2));
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResult(null);

    const result = await queryParcelByAPN(searchQuery.trim());
    setSearchResult(result);
    setSearching(false);

    if (result && mapRef.current) {
      mapRef.current.flyTo({
        center: [result.centroid.lng, result.centroid.lat],
        zoom: 17,
        duration: 1500,
      });

      // Draw parcel outline as a GeoJSON source
      const map = mapRef.current;
      if (map.getSource("search-parcel")) {
        (map.getSource("search-parcel") as maplibregl.GeoJSONSource).setData({
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              result.polygon.map((p) => [p.lng, p.lat]),
            ],
          },
          properties: {},
        });
      } else {
        map.addSource("search-parcel", {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [
                result.polygon.map((p) => [p.lng, p.lat]),
              ],
            },
            properties: {},
          },
        });
        map.addLayer({
          id: "search-parcel-fill",
          type: "fill",
          source: "search-parcel",
          paint: {
            "fill-color": "#2196f3",
            "fill-opacity": 0.15,
          },
        });
        map.addLayer({
          id: "search-parcel-outline",
          type: "line",
          source: "search-parcel",
          paint: {
            "line-color": "#2196f3",
            "line-width": 3,
          },
        });
      }
    }
  }, [searchQuery]);

  const toggleDrawing = useCallback(() => {
    const draw = drawRef.current;
    if (!draw) return;

    if (drawingActive) {
      draw.setMode("select");
      setDrawingActive(false);
    } else {
      draw.setMode("polygon");
      setDrawingActive(true);
    }
  }, [drawingActive]);

  const clearDrawing = useCallback(() => {
    const draw = drawRef.current;
    if (!draw) return;
    draw.clear();
    setDrawnGeoJSON("");
    setDrawingActive(false);
  }, []);

  const copyGeoJSON = useCallback(() => {
    if (!drawnGeoJSON) return;
    navigator.clipboard.writeText(drawnGeoJSON);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [drawnGeoJSON]);

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Map"
        description="Draw site boundaries, view parcels"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setBasemap((b) => (b === "streets" ? "satellite" : "streets"))
              }
              className="rounded-md border border-border/50 bg-background/80 px-3 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-accent"
            >
              {basemap === "streets" ? "Satellite" : "Streets"}
            </button>
            <button
              type="button"
              onClick={() => setParcelsVisible((v) => !v)}
              className={`rounded-md border px-3 py-1.5 font-medium text-xs transition-colors ${
                parcelsVisible
                  ? "border-blue-500/50 bg-blue-500/10 text-blue-600"
                  : "border-border/50 bg-background/80 text-muted-foreground"
              }`}
            >
              Parcels
            </button>
          </div>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Map */}
        <div className="relative flex-1">
          <div ref={mapContainerRef} className="absolute inset-0" />

          {/* Search overlay */}
          <div className="absolute top-3 left-3 z-10 flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              placeholder="Search APN (e.g. 50136087)"
              className="w-64 rounded-md border border-border/50 bg-background/90 px-3 py-2 text-sm shadow-md backdrop-blur-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={searching}
              className="rounded-md border border-border/50 bg-background/90 px-3 py-2 font-medium text-sm shadow-md backdrop-blur-sm transition-colors hover:bg-accent disabled:opacity-50"
            >
              {searching ? "..." : "Go"}
            </button>
          </div>

          {/* Drawing controls */}
          <div className="absolute bottom-6 left-3 z-10 flex gap-2">
            <button
              type="button"
              onClick={toggleDrawing}
              className={`rounded-md border px-4 py-2 font-medium text-sm shadow-md transition-colors ${
                drawingActive
                  ? "border-orange-500/50 bg-orange-500 text-white"
                  : "border-border/50 bg-background/90 text-foreground backdrop-blur-sm hover:bg-accent"
              }`}
            >
              {drawingActive ? "Drawing..." : "Draw Polygon"}
            </button>
            {drawnGeoJSON && (
              <button
                type="button"
                onClick={clearDrawing}
                className="rounded-md border border-border/50 bg-background/90 px-3 py-2 font-medium text-sm text-red-500 shadow-md backdrop-blur-sm transition-colors hover:bg-red-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex w-80 flex-col border-border/50 border-l bg-background">
          {/* Search result */}
          {searchResult && (
            <div className="border-border/50 border-b p-4">
              <h3 className="font-medium text-foreground text-sm">
                Parcel Found
              </h3>
              <div className="mt-2 space-y-1 text-muted-foreground text-xs">
                <p>
                  <span className="font-medium text-foreground">APN:</span>{" "}
                  {searchResult.apn}
                </p>
                {searchResult.address && (
                  <p>
                    <span className="font-medium text-foreground">
                      Address:
                    </span>{" "}
                    {searchResult.address}
                  </p>
                )}
                {searchResult.owner && (
                  <p>
                    <span className="font-medium text-foreground">Owner:</span>{" "}
                    {searchResult.owner}
                  </p>
                )}
                {searchResult.acres && (
                  <p>
                    <span className="font-medium text-foreground">Acres:</span>{" "}
                    {searchResult.acres}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* GeoJSON output */}
          <div className="flex flex-1 flex-col p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-foreground text-sm">GeoJSON</h3>
              {drawnGeoJSON && (
                <button
                  type="button"
                  onClick={copyGeoJSON}
                  className="rounded px-2 py-1 text-xs transition-colors hover:bg-accent"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              )}
            </div>
            {drawnGeoJSON ? (
              <pre className="mt-2 flex-1 overflow-auto rounded-md bg-muted/50 p-3 font-mono text-xs leading-relaxed">
                {drawnGeoJSON}
              </pre>
            ) : (
              <p className="mt-2 text-muted-foreground text-xs">
                Draw a polygon on the map to see GeoJSON output here.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
