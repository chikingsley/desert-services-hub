import { z } from "zod";
import type { ParcelData } from "@/lib/assessor";
import {
  queryParcelByAPN,
  queryParcelByCoordinates,
  smartAddressLookup,
} from "@/lib/assessor";
import type { AzdeqCgpRecord } from "@/lib/noi-endpoints";
import {
  isMaricopaCountyCode,
  parseNoiCoordinates,
  resolveNoiRecord,
} from "@/lib/noi-endpoints";

const maricopaLookupSchema = z
  .object({
    address: z.string().trim().min(1).optional(),
    identifier: z.string().trim().min(1).optional(),
    includeGeometry: z.boolean().optional().default(false),
    latitude: z.number().finite().optional(),
    longitude: z.number().finite().optional(),
    parcel: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const hasCoordinates =
      value.latitude !== undefined || value.longitude !== undefined;

    if (hasCoordinates) {
      if (value.latitude === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "latitude is required when longitude is provided",
          path: ["latitude"],
        });
      }
      if (value.longitude === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "longitude is required when latitude is provided",
          path: ["longitude"],
        });
      }
    }

    const lookupModeCount =
      Number(Boolean(value.identifier)) +
      Number(Boolean(value.address)) +
      Number(Boolean(value.parcel)) +
      Number(Boolean(value.latitude !== undefined && value.longitude !== undefined));

    if (lookupModeCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Provide exactly one lookup mode: identifier, address, parcel, or latitude+longitude",
      });
    }
  });

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatApnDashed(apn: string): string {
  const cleanApn = apn.replaceAll(/[-\s.]/g, "").toUpperCase();
  if (cleanApn.length <= 5) {
    return cleanApn;
  }

  return `${cleanApn.slice(0, 3)}-${cleanApn.slice(3, 5)}-${cleanApn.slice(5)}`;
}

function getCountyCode(record: AzdeqCgpRecord): string | null {
  const facilityCountyCode = clean(
    record.ltfFacilityDetails?.facilityCounty?.countyCode
  );
  if (facilityCountyCode) {
    return facilityCountyCode;
  }

  const placeCountyCode = clean(
    record.ltfFacilityDetails?.placeAddress?.address?.countyCode
  );
  if (placeCountyCode) {
    return placeCountyCode;
  }

  return clean(record.companyAddress?.address?.countyCode);
}

function normalizeParcel(
  parcel: ParcelData,
  includeGeometry: boolean
): Record<string, unknown> {
  return {
    acres: parcel.acres,
    address: parcel.address,
    apn: parcel.apn,
    apnDashed: formatApnDashed(parcel.apn),
    centroid: parcel.centroid,
    owner: parcel.owner,
    ...(includeGeometry ? { polygon: parcel.polygon } : {}),
    rawAttributes: parcel.rawAttributes,
  };
}

function jsonError(
  error: string,
  status = 400,
  details?: Record<string, unknown>
): Response {
  return Response.json(
    {
      error,
      success: false,
      ...(details ?? {}),
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}

function jsonSuccess(data: Record<string, unknown>): Response {
  return Response.json({
    success: true,
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/maricopa/lookup
 *
 * Resolve Maricopa parcel context by one of:
 * - AZDEQ NOI/LTF identifier
 * - address search
 * - parcel/APN
 * - coordinates
 */
export async function handleMaricopaLookup(body: unknown): Promise<Response> {
  const parsed = maricopaLookupSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid input");
  }

  const input = parsed.data;

  try {
    if (input.identifier) {
      const resolved = await resolveNoiRecord(input.identifier);
      if (!resolved.record) {
        return jsonError(
          `NOI record not found for identifier "${input.identifier}"`,
          404,
          { candidatesChecked: resolved.records.length }
        );
      }

      const record = resolved.record;
      const countyCode = getCountyCode(record);
      if (!isMaricopaCountyCode(countyCode)) {
        return jsonError("NOI is not in Maricopa county", 422, {
          countyCode,
          identifier: resolved.identifier,
        });
      }

      const { latitude, longitude } = parseNoiCoordinates(record);
      if (latitude === null || longitude === null) {
        return jsonError("NOI does not contain usable coordinates", 422, {
          identifier: resolved.identifier,
        });
      }

      const parcel = await queryParcelByCoordinates(latitude, longitude);
      if (!parcel) {
        return jsonError("No Maricopa parcel found at NOI coordinates", 422, {
          latitude,
          longitude,
        });
      }

      return jsonSuccess({
        noi: {
          companyName: clean(record.companyName),
          countyCode,
          facilityName: clean(record.facilityName),
          identifier: resolved.identifier.raw,
          latitude,
          longitude,
          ltfIdno: clean(record.ltfIdno),
          permitAuthCode: clean(record.permitAuthCode),
        },
        parcels: [normalizeParcel(parcel, input.includeGeometry)],
        query: {
          identifier: input.identifier,
          includeGeometry: input.includeGeometry,
          mode: "identifier",
        },
      });
    }

    if (input.parcel) {
      const parcel = await queryParcelByAPN(input.parcel);
      if (!parcel) {
        return jsonError(`No Maricopa parcel found for "${input.parcel}"`, 404);
      }

      return jsonSuccess({
        parcels: [normalizeParcel(parcel, input.includeGeometry)],
        query: {
          includeGeometry: input.includeGeometry,
          mode: "parcel",
          parcel: input.parcel,
        },
      });
    }

    if (input.address) {
      const lookup = await smartAddressLookup(input.address);
      const exact = lookup.exact.map((parcel) =>
        normalizeParcel(parcel, input.includeGeometry)
      );
      const similar = lookup.similar.map((parcel) =>
        normalizeParcel(parcel, input.includeGeometry)
      );

      if (exact.length === 0 && similar.length === 0) {
        return jsonError(
          `No Maricopa parcel candidates found for "${input.address}"`,
          404
        );
      }

      return jsonSuccess({
        addressLookup: {
          exact,
          searchedStreet: lookup.searchedStreet,
          similar,
        },
        parcels: exact.length > 0 ? exact : similar,
        query: {
          address: input.address,
          includeGeometry: input.includeGeometry,
          mode: "address",
          searchStrategy: exact.length > 0 ? "exact" : "similar",
        },
      });
    }

    const parcel = await queryParcelByCoordinates(
      input.latitude as number,
      input.longitude as number
    );
    if (!parcel) {
      return jsonError("No Maricopa parcel found at coordinates", 404, {
        latitude: input.latitude,
        longitude: input.longitude,
      });
    }

    return jsonSuccess({
      parcels: [normalizeParcel(parcel, input.includeGeometry)],
      query: {
        includeGeometry: input.includeGeometry,
        latitude: input.latitude,
        longitude: input.longitude,
        mode: "coordinates",
      },
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : String(error),
      500
    );
  }
}
