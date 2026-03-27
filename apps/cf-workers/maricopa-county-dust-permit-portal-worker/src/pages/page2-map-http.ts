import { queryParcelByAPN, queryParcelByCoordinates } from "../assessor";
import { kmlToPermitMapData } from "../kml";
import {
  parseNoiAcres,
  parseNoiCoordinates,
  resolveNoiRecord,
} from "../noi-endpoints";
import {
  normalizeDustApplicationId,
  queryPermitMapFeatures,
} from "../permit-map";

const jsonOk = (data: Record<string, unknown>): Response =>
  Response.json({
    success: true,
    timestamp: new Date().toISOString(),
    ...data,
  });

const jsonError = (error: string, status = 400): Response =>
  Response.json({ error, success: false }, { status });

const readJson = async (
  request: Request
): Promise<Record<string, unknown> | null> => {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const getString = (
  body: Record<string, unknown>,
  key: string
): string | null => {
  const value = body[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
};

export const handlePage2MapKmlPost = async (
  request: Request
): Promise<Response> => {
  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const body = await readJson(request);
  const kml = body ? getString(body, "kml") : null;
  if (!kml) {
    return jsonError("Body must include a non-empty 'kml' string", 400);
  }

  try {
    return jsonOk({ mapData: kmlToPermitMapData(kml) });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : String(error),
      422
    );
  }
};

export const handlePage2MapRenewalPost = async (
  request: Request
): Promise<Response> => {
  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const body = await readJson(request);
  const sourcePermitId = body ? getString(body, "sourcePermitId") : null;
  if (!sourcePermitId) {
    return jsonError("Body must include 'sourcePermitId'", 400);
  }

  try {
    const permitId = normalizeDustApplicationId(sourcePermitId);
    const mapData = await queryPermitMapFeatures(permitId);

    if (!mapData.disturbedArea) {
      return jsonError(`No map data found for ${permitId}`, 404);
    }

    const parcel = mapData.centroid
      ? await queryParcelByCoordinates(
          mapData.centroid.lat,
          mapData.centroid.lng
        )
      : null;

    return jsonOk({ mapData, parcel, sourcePermitId: permitId });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : String(error),
      422
    );
  }
};

export const handlePage2MapParcelPost = async (
  request: Request
): Promise<Response> => {
  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const body = await readJson(request);
  if (!body) {
    return jsonError("Invalid JSON body", 400);
  }

  const apn = getString(body, "apn");
  const noiIdentifier = getString(body, "noiIdentifier");

  if (!apn && !noiIdentifier) {
    return jsonError("Provide 'apn' or 'noiIdentifier'", 400);
  }

  try {
    if (apn) {
      const parcel = await queryParcelByAPN(apn);
      if (!parcel) {
        return jsonError(`No parcel found for APN ${apn}`, 404);
      }
      return jsonOk({ parcel, source: "apn" });
    }

    const { record } = await resolveNoiRecord(noiIdentifier ?? "");
    if (!record) {
      return jsonError(`No NOI record found for ${noiIdentifier}`, 404);
    }

    const { latitude, longitude } = parseNoiCoordinates(record);
    const acres = parseNoiAcres(record);
    const parcel =
      latitude !== null && longitude !== null
        ? await queryParcelByCoordinates(latitude, longitude)
        : null;

    return jsonOk({
      acres,
      coordinates: { latitude, longitude },
      parcel,
      record,
      source: "noi",
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : String(error),
      422
    );
  }
};
