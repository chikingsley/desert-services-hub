import maplibregl from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { MapControls } from "./map-controls";
import type { LowestPoint, ParcelInfo } from "./map-helpers";
import {
  buildParcelSamplePoints,
  EMPTY_FC,
  fetch3DepSamples,
  fetchApnLabels,
  findLowestPoint,
  findLowestTerrainPoint,
  isEsriQueryResult,
  metersToFeet,
  PARCEL_QUERY_URL,
  PARCEL_TILE_URL,
  parseEsriFeature,
  TERRAIN_DEM_TILE_URL,
} from "./map-helpers";
import { MapSelectedPanel } from "./map-selected-panel";

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
}

export function MapPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const lowestPointJobRef = useRef(0);
  const [isSatellite, setIsSatellite] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ParcelInfo | null>(null);
  const [lowestPoint, setLowestPoint] = useState<LowestPoint | null>(null);
  const [findingLowestPoint, setFindingLowestPoint] = useState(false);

  const setLowestPointMarker = useCallback(
    (map: maplibregl.Map, point: LowestPoint | null) => {
      const src = map.getSource("lowest-point") as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!src) {
        return;
      }
      if (!point) {
        src.setData(EMPTY_FC);
        return;
      }

      const feet = metersToFeet(point.elevationMeters);
      const prefix = point.approximate ? "Approx low" : "Lowest point";
      const label = `${prefix}: ${feet.toFixed(1)} ft`;

      src.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: point.point,
            },
            properties: { label },
          },
        ],
      });
    },
    []
  );

  const analyzeLowestPoint = useCallback(
    async (
      map: maplibregl.Map,
      parcel: GeoJSON.Feature<GeoJSON.Polygon, { APN: string }>
    ) => {
      const jobId = ++lowestPointJobRef.current;
      setFindingLowestPoint(true);
      setLowestPoint(null);
      setLowestPointMarker(map, null);

      const points = buildParcelSamplePoints(parcel);
      if (points.length === 0) {
        setFindingLowestPoint(false);
        return;
      }

      const terrainLowest = findLowestTerrainPoint(map, points);

      try {
        const samples = await fetch3DepSamples(points);
        if (lowestPointJobRef.current !== jobId) {
          return;
        }
        const usgsLowest = findLowestPoint(samples);
        if (usgsLowest) {
          setLowestPoint(usgsLowest);
          setLowestPointMarker(map, usgsLowest);
          return;
        }

        if (terrainLowest) {
          setLowestPoint(terrainLowest);
          setLowestPointMarker(map, terrainLowest);
        }
      } catch (err) {
        console.error("[map] 3DEP lowest-point failed:", err);
      } finally {
        if (lowestPointJobRef.current === jobId) {
          setFindingLowestPoint(false);
        }
      }
    },
    [setLowestPointMarker]
  );

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
      baseLayerIds = map.getStyle().layers.map((l) => l.id);

      map.addSource("terrain-dem", {
        type: "raster-dem",
        tiles: [TERRAIN_DEM_TILE_URL],
        tileSize: 256,
        encoding: "terrarium",
        maxzoom: 15,
      });
      map.setTerrain({ source: "terrain-dem", exaggeration: 1 });

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

      let loadingLabels = false;
      const updateLabels = async () => {
        if (map.getZoom() < 15 || loadingLabels) {
          return;
        }
        loadingLabels = true;
        try {
          const fc = await fetchApnLabels(map);
          if (fc) {
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
      map.addSource("lowest-point", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "lowest-point-marker",
        type: "circle",
        source: "lowest-point",
        paint: {
          "circle-radius": 6,
          "circle-color": "#f57c00",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "lowest-point-label",
        type: "symbol",
        source: "lowest-point",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 12,
          "text-offset": [0, 1.3],
          "text-anchor": "top",
          "text-font": ["Noto Sans Bold"],
        },
        paint: {
          "text-color": "#1a1a1a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });

      map.on("click", async (e) => {
        if (map.getZoom() < 14) {
          return;
        }
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
          await analyzeLowestPoint(map, result.geojson);
        } catch (err) {
          console.error("[map] click query failed:", err);
        }
      });

      map.on("mousemove", () => {
        map.getCanvas().style.cursor = map.getZoom() >= 14 ? "pointer" : "";
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [analyzeLowestPoint]);

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
    lowestPointJobRef.current += 1;
    setFindingLowestPoint(false);
    setLowestPoint(null);
    const lowestSrc = mapRef.current?.getSource("lowest-point") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (lowestSrc) {
      lowestSrc.setData(EMPTY_FC);
    }
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
      await analyzeLowestPoint(map, result.geojson);

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
  }, [analyzeLowestPoint, searchQuery]);

  const clearSelection = useCallback(() => {
    const src = mapRef.current?.getSource("selected-parcel") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (src) {
      src.setData(EMPTY_FC);
    }
    const lowestSrc = mapRef.current?.getSource("lowest-point") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (lowestSrc) {
      lowestSrc.setData(EMPTY_FC);
    }
    lowestPointJobRef.current += 1;
    setFindingLowestPoint(false);
    setLowestPoint(null);
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
      <MapControls
        isSatellite={isSatellite}
        onSearch={handleSearch}
        onSearchQueryChange={setSearchQuery}
        onToggleSatellite={toggleSatellite}
        searching={searching}
        searchQuery={searchQuery}
      />

      {selected && (
        <MapSelectedPanel
          findingLowestPoint={findingLowestPoint}
          lowestPoint={lowestPoint}
          onClear={clearSelection}
          selected={selected}
        />
      )}
    </div>
  );
}
