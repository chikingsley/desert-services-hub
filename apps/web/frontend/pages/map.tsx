/**
 * Map Page — OSM streets + Maricopa County parcels + satellite toggle.
 * CSS loaded via <link> tag in index.html.
 */
import maplibregl from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ParcelInfo } from "./map-helpers";
import {
  EMPTY_FC,
  fetchApnLabels,
  isEsriQueryResult,
  PARCEL_QUERY_URL,
  PARCEL_TILE_URL,
  parseEsriFeature,
} from "./map-helpers";

// Store base layer IDs so we can toggle them without re-scanning
let baseLayerIds: string[] = [];

function applySatelliteToggle(
  map: maplibregl.Map,
  showSatellite: boolean
): void {
  if (map.getLayer("satellite")) {
    map.setLayoutProperty(
      "satellite",
      "visibility",
      showSatellite ? "visible" : "none"
    );
  }
  for (const id of baseLayerIds) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(
        id,
        "visibility",
        showSatellite ? "none" : "visible"
      );
    }
  }
  if (map.getLayer("parcels")) {
    map.setPaintProperty(
      "parcels",
      "raster-opacity",
      showSatellite ? 1.0 : 0.8
    );
  }
  if (map.getLayer("apn-labels")) {
    map.setPaintProperty(
      "apn-labels",
      "text-color",
      showSatellite ? "#ffffff" : "#b71c1c"
    );
    map.setPaintProperty(
      "apn-labels",
      "text-halo-color",
      showSatellite ? "#000000" : "#ffffff"
    );
  }
  console.log(
    "[map] satellite:",
    showSatellite,
    "toggled",
    baseLayerIds.length,
    "base layers"
  );
}

export function MapPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [isSatellite, setIsSatellite] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ParcelInfo | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [-112.074, 33.448],
      zoom: 16,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 200, unit: "imperial" }),
      "bottom-left"
    );

    map.on("load", () => {
      // Capture base layer IDs before adding our custom layers
      baseLayerIds = map.getStyle().layers.map((l) => l.id);

      // Satellite tiles — hidden, at bottom of stack
      map.addSource("satellite", {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
      });
      map.addLayer({
        id: "satellite",
        type: "raster",
        source: "satellite",
        layout: { visibility: "none" },
      });

      // Parcel boundary raster tiles — on top of satellite
      map.addSource("parcels", {
        type: "raster",
        tiles: [PARCEL_TILE_URL],
        tileSize: 512,
      });
      map.addLayer({
        id: "parcels",
        type: "raster",
        source: "parcels",
        paint: { "raster-opacity": 0.8 },
        minzoom: 13,
      });

      // APN labels — lightweight centroid query, no geometry
      map.addSource("apn-labels", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "apn-labels",
        type: "symbol",
        source: "apn-labels",
        minzoom: 15,
        layout: {
          "text-field": ["get", "APN"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 15, 9, 17, 13],
          "text-font": ["Noto Sans Bold"],
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#b71c1c",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2,
        },
      });

      // Fetch APN labels for visible parcels
      let loadingLabels = false;
      const updateLabels = async () => {
        if (map.getZoom() < 15 || loadingLabels) {
          return;
        }
        loadingLabels = true;
        try {
          const fc = await fetchApnLabels(map);
          if (fc) {
            console.log("[map] labels loaded:", fc.features.length);
            const src = map.getSource("apn-labels") as
              | maplibregl.GeoJSONSource
              | undefined;
            if (src) {
              src.setData(fc);
            }
          }
        } catch (err) {
          console.error("[map] label fetch failed:", err);
        } finally {
          loadingLabels = false;
        }
      };
      map.on("moveend", updateLabels);
      updateLabels();

      // Selected parcel highlight
      map.addSource("selected-parcel", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "selected-fill",
        type: "fill",
        source: "selected-parcel",
        paint: { "fill-color": "#2196f3", "fill-opacity": 0.35 },
      });
      map.addLayer({
        id: "selected-outline",
        type: "line",
        source: "selected-parcel",
        paint: { "line-color": "#1565c0", "line-width": 3.5 },
      });

      // Click to select
      map.on("click", async (e) => {
        if (map.getZoom() < 14) {
          return;
        }
        console.log("[map] click query at", e.lngLat.lng, e.lngLat.lat);

        const params = new URLSearchParams({
          geometry: `${e.lngLat.lng},${e.lngLat.lat}`,
          geometryType: "esriGeometryPoint",
          spatialRel: "esriSpatialRelIntersects",
          inSR: "4326",
          outSR: "4326",
          outFields: "APN,PHYSICAL_ADDRESS,OWNER_NAME,LAND_SIZE",
          returnGeometry: "true",
          f: "json",
        });

        try {
          const res = await fetch(`${PARCEL_QUERY_URL}?${params}`);
          const data: unknown = await res.json();
          if (!isEsriQueryResult(data)) {
            return;
          }
          console.log("[map] click result:", data.features?.length, "features");

          if (!data.features?.length) {
            return;
          }
          const result = parseEsriFeature(data.features[0]);
          if (!result) {
            return;
          }

          const src = map.getSource(
            "selected-parcel"
          ) as maplibregl.GeoJSONSource;
          src.setData(result.geojson);
          setSelected(result.info);
        } catch (err) {
          console.error("[map] click query failed:", err);
        }
      });

      map.on("mousemove", () => {
        map.getCanvas().style.cursor = map.getZoom() >= 14 ? "pointer" : "";
      });

      console.log("[map] loaded, layers:", map.getStyle().layers.length);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const toggleSatellite = useCallback(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const next = !isSatellite;
    setIsSatellite(next);
    applySatelliteToggle(map, next);
  }, [isSatellite]);

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!(q && mapRef.current)) {
      return;
    }
    setSearching(true);
    setSelected(null);
    console.log("[map] searching APN:", q);

    const cleanApn = q.replace(/[-\s.]/g, "");
    const params = new URLSearchParams({
      where: `APN = '${cleanApn}'`,
      outFields: "APN,PHYSICAL_ADDRESS,OWNER_NAME,LAND_SIZE",
      outSR: "4326",
      returnGeometry: "true",
      f: "json",
    });

    try {
      const res = await fetch(`${PARCEL_QUERY_URL}?${params}`);
      const data: unknown = await res.json();
      if (!isEsriQueryResult(data)) {
        setSearching(false);
        return;
      }
      console.log("[map] search result:", data.features?.length, "features");

      if (!data.features?.length) {
        setSearching(false);
        return;
      }

      const result = parseEsriFeature(data.features[0]);
      if (!result) {
        setSearching(false);
        return;
      }

      const map = mapRef.current;
      if (!map) {
        setSearching(false);
        return;
      }
      const src = map.getSource("selected-parcel") as maplibregl.GeoJSONSource;
      src.setData(result.geojson);
      setSelected(result.info);

      // Fly to parcel
      const bounds = new maplibregl.LngLatBounds();
      const coords = (result.geojson.geometry as GeoJSON.Polygon)
        .coordinates[0];
      for (const c of coords) {
        bounds.extend(c as [number, number]);
      }
      map.fitBounds(bounds, { padding: 120, maxZoom: 18, duration: 1500 });
    } catch (err) {
      console.error("[map] search failed:", err);
    }

    setSearching(false);
  }, [searchQuery]);

  const clearSelection = useCallback(() => {
    const src = mapRef.current?.getSource("selected-parcel") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (src) {
      src.setData(EMPTY_FC);
    }
    setSelected(null);
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <style>{`
        .maplibregl-ctrl-scale {
          background: rgba(255,255,255,0.85) !important;
          border: 2px solid #333 !important;
          border-top: none !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          padding: 2px 8px !important;
          color: #1a1a1a !important;
          letter-spacing: 0.3px;
        }
      `}</style>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {/* Satellite toggle */}
      <div style={{ position: "absolute", top: 12, left: 12, zIndex: 10 }}>
        <button
          onClick={toggleSatellite}
          style={{
            padding: "6px 14px",
            background: isSatellite ? "#1565c0" : "rgba(255,255,255,0.92)",
            color: isSatellite ? "#fff" : "#333",
            border: "1px solid #ccc",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
          }}
          type="button"
        >
          {isSatellite ? "Streets" : "Satellite"}
        </button>
      </div>

      {/* Search */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          display: "flex",
          gap: 6,
        }}
      >
        <input
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSearch();
            }
          }}
          placeholder="Search APN..."
          style={{
            width: 220,
            padding: "7px 12px",
            border: "1px solid #ccc",
            borderRadius: 6,
            fontSize: 13,
            background: "rgba(255,255,255,0.95)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
            outline: "none",
          }}
          type="text"
          value={searchQuery}
        />
        <button
          disabled={searching}
          onClick={handleSearch}
          style={{
            padding: "7px 14px",
            background: "rgba(255,255,255,0.95)",
            border: "1px solid #ccc",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
            opacity: searching ? 0.5 : 1,
          }}
          type="button"
        >
          {searching ? "..." : "Search"}
        </button>
      </div>

      {/* Selected parcel info */}
      {selected && (
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: 12,
            zIndex: 10,
            background: "rgba(255,255,255,0.95)",
            border: "1px solid #ccc",
            borderRadius: 8,
            padding: "12px 16px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
            fontSize: 13,
            lineHeight: 1.6,
            minWidth: 220,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "start",
            }}
          >
            <strong style={{ fontSize: 14 }}>Parcel</strong>
            <button
              onClick={clearSelection}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 16,
                color: "#999",
                padding: "0 2px",
                lineHeight: 1,
              }}
              type="button"
            >
              &times;
            </button>
          </div>
          <div style={{ marginTop: 4 }}>
            <div>
              <b>APN:</b> {selected.apn}
            </div>
            {selected.address && (
              <div>
                <b>Address:</b> {selected.address}
              </div>
            )}
            {selected.owner && (
              <div>
                <b>Owner:</b> {selected.owner}
              </div>
            )}
            {selected.acres != null && (
              <div>
                <b>Size:</b> {selected.acres.toLocaleString()} sq ft
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
