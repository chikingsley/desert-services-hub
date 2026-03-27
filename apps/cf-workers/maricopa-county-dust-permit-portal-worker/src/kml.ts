import type { LatLng, MapFeature, PermitMapData } from "./permit-map";
import {
  buildPermitMapDataFromPolygon,
  latLngToWebMercator,
} from "./permit-map";

const PLACEMARK_REGEX = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/gi;
const NAME_REGEX = /<name>([\s\S]*?)<\/name>/i;
const POLYGON_COORDS_REGEX =
  /<Polygon[\s\S]*?<coordinates[^>]*>([\s\S]*?)<\/coordinates>/i;
const POINT_COORDS_REGEX =
  /<Point[\s\S]*?<coordinates[^>]*>([\s\S]*?)<\/coordinates>/i;

interface KmlPolygon {
  coordinates: LatLng[];
  name: string | null;
}

interface KmlPoint {
  coordinate: LatLng;
  name: string | null;
}

export interface ParsedKml {
  points: KmlPoint[];
  polygons: KmlPolygon[];
}

const parseCoordinateText = (text: string): LatLng[] => {
  const points: LatLng[] = [];
  for (const token of text.trim().split(/[\s\n\r\t]+/)) {
    if (token.length === 0) {
      continue;
    }
    const [lngStr, latStr] = token.split(",");
    const lng = Number.parseFloat(lngStr ?? "");
    const lat = Number.parseFloat(latStr ?? "");
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      points.push({ lat, lng });
    }
  }
  return points;
};

export const parseKml = (kml: string): ParsedKml => {
  const polygons: KmlPolygon[] = [];
  const points: KmlPoint[] = [];

  for (const match of kml.matchAll(PLACEMARK_REGEX)) {
    const body = match[1] ?? "";
    const name = body.match(NAME_REGEX)?.[1]?.trim() ?? null;

    const polygonMatch = body.match(POLYGON_COORDS_REGEX);
    if (polygonMatch?.[1]) {
      const coords = parseCoordinateText(polygonMatch[1]);
      if (coords.length >= 3) {
        polygons.push({ coordinates: coords, name });
      }
      continue;
    }

    const pointMatch = body.match(POINT_COORDS_REGEX);
    if (pointMatch?.[1]) {
      const [coordinate] = parseCoordinateText(pointMatch[1]);
      if (coordinate) {
        points.push({ coordinate, name });
      }
    }
  }

  return { points, polygons };
};

export const kmlToPermitMapData = (kml: string): PermitMapData => {
  const { points, polygons } = parseKml(kml);

  const [first, ...rest] = polygons;
  if (!first) {
    throw new Error("No polygon found in KML");
  }

  let largest = first;
  for (const polygon of rest) {
    if (polygon.coordinates.length > largest.coordinates.length) {
      largest = polygon;
    }
  }

  const mapData = buildPermitMapDataFromPolygon(largest.coordinates, {
    includeCentroidPoint: false,
    polygonAttributes: { name: largest.name, source: "kml" },
  });

  for (const { coordinate, name } of points) {
    const feature: MapFeature = {
      attributes: { name, source: "kml" },
      coordinates: [latLngToWebMercator(coordinate.lat, coordinate.lng)],
      latLngCoordinates: [coordinate],
      layerIndex: 0,
      type: "point",
    };
    mapData.points.push(feature);
    mapData.accessPoints.push(feature);
  }

  return mapData;
};
