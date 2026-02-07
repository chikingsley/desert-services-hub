/**
 * Map Page — OSM base map + Maricopa County parcel overlay + APN labels + satellite toggle.
 * CSS loaded via <link> tag in index.html.
 */
import maplibregl from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";

// Maricopa County parcel tile server (public, no auth)
const PARCEL_TILE_URL =
  "https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&f=image&layers=show:0";

const PARCEL_QUERY_URL =
  "https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/0/query";

/** Query parcels in the current map view and return as GeoJSON */
async function queryVisibleParcels(
  bounds: maplibregl.LngLatBounds,
): Promise<GeoJSON.FeatureCollection> {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  const params = new URLSearchParams({
    geometry: `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    outFields: "APN",
    returnGeometry: "true",
    returnCentroid: "true",
    f: "geojson",
    resultRecordCount: "1000",
  });

  const res = await fetch(`${PARCEL_QUERY_URL}?${params}`);
  if (!res.ok) return { type: "FeatureCollection", features: [] };
  return res.json();
}

export function MapPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadingRef = useRef(false);
  const [isSatellite, setIsSatellite] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [-112.07, 33.45],
      zoom: 10,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      // Satellite tiles — added but hidden by default
      map.addSource("satellite", {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
      });
      map.addLayer(
        {
          id: "satellite",
          type: "raster",
          source: "satellite",
          layout: { visibility: "none" },
        },
        // Insert below all existing vector layers (right above the base)
        map.getStyle().layers[1]?.id,
      );

      // Parcel boundary raster tiles
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
        minzoom: 13,
      });

      // Vector parcel data — outlines + labels from same source
      map.addSource("parcel-vectors", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      // Thick parcel outlines
      map.addLayer({
        id: "parcel-outlines",
        type: "line",
        source: "parcel-vectors",
        minzoom: 13,
        paint: {
          "line-color": "#e65100",
          "line-width": ["interpolate", ["linear"], ["zoom"], 14, 2, 16, 3.5, 18, 5],
          "line-opacity": 0.8,
        },
      });
      // APN labels
      map.addLayer({
        id: "parcel-labels",
        type: "symbol",
        source: "parcel-vectors",
        minzoom: 15,
        layout: {
          "text-field": ["get", "APN"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 15, 9, 17, 12],
          "text-allow-overlap": false,
          "text-ignore-placement": false,
          "text-font": ["Noto Sans Bold"],
        },
        paint: {
          "text-color": "#1a1a2e",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });

      // Fetch parcel vectors when view changes at high zoom
      const updateParcels = async () => {
        if (map.getZoom() < 13 || loadingRef.current) return;
        loadingRef.current = true;
        try {
          const fc = await queryVisibleParcels(map.getBounds());
          const src = map.getSource("parcel-vectors") as maplibregl.GeoJSONSource | undefined;
          if (src) src.setData(fc);
        } finally {
          loadingRef.current = false;
        }
      };

      map.on("moveend", updateParcels);
      map.on("zoomend", updateParcels);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const toggleSatellite = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("satellite")) return;

    const next = !isSatellite;
    setIsSatellite(next);

    // Toggle satellite layer visibility
    map.setLayoutProperty("satellite", "visibility", next ? "visible" : "none");

    // Hide/show the OSM base layers (all layers from the original style, except our custom ones)
    const customIds = new Set(["satellite", "parcels", "parcel-outlines", "parcel-labels"]);
    for (const layer of map.getStyle().layers) {
      if (!customIds.has(layer.id)) {
        map.setLayoutProperty(layer.id, "visibility", next ? "none" : "visible");
      }
    }
  }, [isSatellite]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      <button
        type="button"
        onClick={toggleSatellite}
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 10,
          padding: "6px 14px",
          background: "rgba(255,255,255,0.92)",
          border: "1px solid #ccc",
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
        }}
      >
        {isSatellite ? "Streets" : "Satellite"}
      </button>
    </div>
  );
}
