import { z } from "zod";
import type { AzdeqCgpRecord } from "@/lib/noi-endpoints";
import { parseNoiCoordinates, resolveNoiRecord } from "@/lib/noi-endpoints";
import {
  dedupePimaParcels,
  queryPimaAddressesByAddress,
  queryPimaParcelByParcelId,
  queryPimaParcelsByCoordinates,
} from "@/lib/pima-gis";

const pimaLookupSchema = z
  .object({
    address: z.string().trim().min(1).optional(),
    distanceFeet: z.number().positive().max(5_280).optional(),
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

function isPimaCountyCode(countyCode: string | null | undefined): boolean {
  const normalized = clean(countyCode)?.toUpperCase();
  return normalized === "04019" || normalized === "PIMA";
}

/**
 * POST /api/pima/lookup
 *
 * Resolve Pima County parcels by one of:
 * - AZDEQ NOI/LTF identifier
 * - address search
 * - parcel id
 * - coordinates
 */
export async function handlePimaLookup(body: unknown): Promise<Response> {
  const parsed = pimaLookupSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid input");
  }

  const input = parsed.data;
  const parcelOptions = {
    distanceFeet: input.distanceFeet,
    includeGeometry: input.includeGeometry,
  };

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
      if (!isPimaCountyCode(countyCode)) {
        return jsonError("NOI is not in Pima county", 422, {
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

      const parcels = await queryPimaParcelsByCoordinates(
        latitude,
        longitude,
        parcelOptions
      );
      if (parcels.length === 0) {
        return jsonError("No Pima parcel found at NOI coordinates", 422, {
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
        parcels,
        query: {
          distanceFeet: input.distanceFeet ?? null,
          identifier: input.identifier,
          includeGeometry: input.includeGeometry,
          mode: "identifier",
        },
      });
    }

    if (input.parcel) {
      const parcels = await queryPimaParcelByParcelId(input.parcel, {
        includeGeometry: input.includeGeometry,
      });
      if (parcels.length === 0) {
        return jsonError(`No Pima parcel found for "${input.parcel}"`, 404);
      }

      return jsonSuccess({
        parcels,
        query: {
          includeGeometry: input.includeGeometry,
          mode: "parcel",
          parcel: input.parcel,
        },
      });
    }

    if (input.address) {
      const addressCandidates = await queryPimaAddressesByAddress(input.address, {
        limit: 10,
      });
      if (addressCandidates.length === 0) {
        return jsonError(`No Pima address candidates found for "${input.address}"`, 404);
      }

      const enrichedCandidates = await Promise.all(
        addressCandidates.map(async (candidate) => {
          const resolvedParcels = candidate.parcel
            ? await queryPimaParcelByParcelId(candidate.parcel, {
                includeGeometry: input.includeGeometry,
              })
            : candidate.coordinates
              ? await queryPimaParcelsByCoordinates(
                  candidate.coordinates.lat,
                  candidate.coordinates.lng,
                  parcelOptions
                )
              : [];

          return {
            ...candidate,
            resolvedParcels,
          };
        })
      );

      return jsonSuccess({
        addressCandidates: enrichedCandidates,
        parcels: dedupePimaParcels(
          enrichedCandidates.flatMap((candidate) => candidate.resolvedParcels)
        ),
        query: {
          address: input.address,
          distanceFeet: input.distanceFeet ?? null,
          includeGeometry: input.includeGeometry,
          mode: "address",
        },
      });
    }

    const parcels = await queryPimaParcelsByCoordinates(
      input.latitude as number,
      input.longitude as number,
      parcelOptions
    );
    if (parcels.length === 0) {
      return jsonError("No Pima parcel found at coordinates", 404, {
        latitude: input.latitude,
        longitude: input.longitude,
      });
    }

    return jsonSuccess({
      parcels,
      query: {
        distanceFeet: input.distanceFeet ?? null,
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
