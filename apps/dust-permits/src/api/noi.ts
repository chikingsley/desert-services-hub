import {
  type CompanyMatch,
  findCompanyByName,
} from "@dust-permits/db/dust-permit";
import { z } from "zod";
import { handleCreatePermit } from "@/api/permits";
import { DEFAULTS, type DeepPartial, type FormData } from "@/form-data";
import type { LatLng } from "@/lib/dust-features";
import type {
  GeometrySource,
  ResolvedGeometrySource,
} from "@/lib/geometry-source";
import {
  GeometrySourceSchema,
  resolveGeometrySource,
} from "@/lib/geometry-source";
import type { AzdeqCgpRecord } from "@/lib/noi-endpoints";
import {
  isMaricopaCountyCode,
  parseNoiAcres,
  parseNoiCoordinates,
  resolveNoiRecord,
} from "@/lib/noi-endpoints";
import {
  getNoiAddressCandidate,
  getNoiCoordinateCandidates,
  getParcelAcres,
  resolveParcelFromNoiRecord,
  shouldSkipParcelMapDraw,
  type NoiParcelLookupSource,
} from "@/lib/noi-location";
import {
  evaluateParcelAcreageDecision,
  getMaricopaPermitPricingTier,
} from "@/lib/noi-triage";
import { formatApnDashed } from "@/lib/site-drawing";

const resolveNoiSchema = z.object({
  identifier: z.string().min(1),
  disturbedAcres: z.number().positive().optional(),
  flow: z.enum(["new-company", "existing-company"]).optional(),
  companyName: z.string().min(1).optional(),
  copyFromApp: z.string().min(1).optional(),
  geometrySource: GeometrySourceSchema.optional(),
});

const createNoiSchema = resolveNoiSchema.extend({
  create: z.boolean().optional().default(true),
});
const NON_DIGIT_RE = /\D/g;
const WHITESPACE_RE = /\s+/;

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toTitleCase(value: string | null | undefined): string {
  const cleaned = clean(value);
  if (!cleaned) {
    return "";
  }
  return cleaned
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function joinAddress(
  address1: string | null | undefined,
  address2: string | null | undefined
): string {
  return [toTitleCase(address1), toTitleCase(address2)]
    .filter((value) => value.length > 0)
    .join(" ");
}

function parsePhone(value: string | null | undefined): string {
  const raw = clean(value);
  if (!raw) {
    return "";
  }
  const digits = raw.replaceAll(NON_DIGIT_RE, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

function splitName(fullName: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const normalized = clean(fullName);
  if (!normalized) {
    return { firstName: "", lastName: "" };
  }

  const parts = normalized.split(WHITESPACE_RE);
  if (parts.length === 1) {
    return { firstName: parts[0] ?? "", lastName: "" };
  }

  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function normalizeNoiPermitId(record: AzdeqCgpRecord): string | null {
  const permit = clean(record.permitAuthCode);
  if (!permit) {
    return null;
  }
  const upper = permit.toUpperCase();
  if (upper.startsWith("AZC")) {
    return upper;
  }
  const digits = upper.replaceAll(NON_DIGIT_RE, "");
  return digits.length > 0 ? `AZC${digits}` : upper;
}

function getCountyCode(record: AzdeqCgpRecord): string | null {
  const facilityCountyCode = clean(
    record.ltfFacilityDetails?.facilityCounty?.countyCode
  );
  if (facilityCountyCode) {
    return facilityCountyCode;
  }
  // placeAddress often has the county code when facilityCounty doesn't
  const placeCountyCode = clean(
    record.ltfFacilityDetails?.placeAddress?.address?.countyCode
  );
  if (placeCountyCode) {
    return placeCountyCode;
  }
  return clean(record.companyAddress?.address?.countyCode);
}

function buildFormDataOverrides(
  record: AzdeqCgpRecord,
  disturbedAcres: number,
  latitude: number,
  longitude: number
): DeepPartial<FormData> {
  const applicantAddress1 = joinAddress(
    record.companyAddress?.address?.address,
    record.companyAddress?.address?.aptSuite
  );
  const applicantCity = toTitleCase(record.companyAddress?.address?.city);
  const applicantState = clean(record.companyAddress?.address?.state) ?? "";
  const applicantZip = clean(record.companyAddress?.address?.zip) ?? "";
  const applicantCompanyName = toTitleCase(record.companyName);
  const swpppFirstName = toTitleCase(record.swpppDetails?.fname);
  const swpppLastName = toTitleCase(record.swpppDetails?.lname);
  const swpppEmail = clean(record.swpppDetails?.email) ?? "";
  const swpppPhone = parsePhone(record.swpppDetails?.phone);
  const rco = splitName(toTitleCase(record.rcoName));

  const primaryFirst = swpppFirstName ?? rco.firstName;
  const primaryLast = swpppLastName ?? rco.lastName;
  const fallbackEmail = swpppEmail || DEFAULTS.permitContact.email;
  const fallbackPhone = swpppPhone || DEFAULTS.permitContact.phone;
  const projectName = toTitleCase(record.facilityName);

  return {
    _meta: {
      extractionSource: "noi-only",
      ltfNumber: clean(record.ltfIdno),
      noiPermitId: normalizeNoiPermitId(record),
    },
    applicant: {
      address1: applicantAddress1,
      city: applicantCity,
      companyName: applicantCompanyName,
      email: fallbackEmail,
      phone: fallbackPhone,
      state: applicantState,
      zip: applicantZip,
    },
    presidentOwner: {
      address1: applicantAddress1,
      city: applicantCity,
      email: "",
      firstName: rco.firstName,
      lastName: rco.lastName,
      phone: "",
      state: applicantState,
      zip: applicantZip,
    },
    primaryContact: {
      companyName: applicantCompanyName,
      email: fallbackEmail,
      firstName: primaryFirst,
      lastName: primaryLast,
      phone: fallbackPhone,
      title: "SWPPP Contact",
    },
    project: {
      name: projectName,
    },
    site: {
      acresDisturbed: disturbedAcres,
      latitude,
      longitude,
      name: projectName,
    },
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

function buildGeometryChecks(
  geometrySource: GeometrySource,
  geometry: ResolvedGeometrySource
): {
  approved: boolean;
  centroid: LatLng | null;
  disturbedAcres: number | null;
  disturbedTier: string | null;
  geometryOverride: true;
  kind: GeometrySource["kind"];
  parcelAcreageCheckSkipped: true;
  targetParcelDashed: string | null;
} {
  const disturbedTier =
    geometry.disturbedAcres !== null
      ? getMaricopaPermitPricingTier(geometry.disturbedAcres)
      : null;

  return {
    approved: disturbedTier !== null,
    centroid: geometry.centroid,
    disturbedAcres: geometry.disturbedAcres,
    disturbedTier,
    geometryOverride: true,
    kind: geometrySource.kind,
    parcelAcreageCheckSkipped: true,
    targetParcelDashed: geometry.targetParcelDashed ?? null,
  };
}

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return /^(1|true|yes|on)$/i.test(value.trim());
}

function parsePositiveNumberEnv(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getNoiMapAcreageRatioLimit(): number {
  if (parseBooleanEnv(process.env.PERMIT_ALLOW_FULL_PARCEL_DRAW)) {
    return Number.POSITIVE_INFINITY;
  }

  return parsePositiveNumberEnv(process.env.PERMIT_MAP_MAX_ACREAGE_RATIO) ?? 2;
}

function buildNoParcelFallbackChecks(params: {
  disturbedAcres: number;
  lookupSource: NoiParcelLookupSource;
  searchedAddress: string | null;
}): Record<string, unknown> {
  const disturbedTier = getMaricopaPermitPricingTier(params.disturbedAcres);

  return {
    approved: disturbedTier !== null,
    disturbedAcres: params.disturbedAcres,
    disturbedTier,
    manualMapRequired: true,
    manualMapReason:
      "No parcel found from NOI facility coordinates, outfalls, or facility address",
    parcelAcres: null,
    parcelAtLeastDisturbed: null,
    parcelLookupSource: params.lookupSource,
    parcelTier: null,
    samePricingTier: null,
    searchedAddress: params.searchedAddress,
  };
}

async function resolveNoiAndChecks(
  input: z.infer<typeof resolveNoiSchema>
): Promise<
  | { error: Response; ok: false }
  | {
      ok: true;
      result: {
        approvedForCreate: boolean;
        checks: Record<string, unknown>;
        companyMatch: {
          matchedName: string;
          permitCount: number;
          portalCompanyId: string | null;
        } | null;
        createPayload: {
          companyName?: string;
          copyFromApp?: string;
          flow: "new-company" | "existing-company";
          formData: DeepPartial<FormData>;
          geometrySource?: GeometrySource;
        };
        noi: Record<string, unknown>;
      };
    }
> {
  const resolved = await resolveNoiRecord(input.identifier);
  if (!resolved.record) {
    return {
      error: jsonError(
        `NOI record not found for identifier "${input.identifier}"`,
        404,
        { candidatesChecked: resolved.records.length }
      ),
      ok: false,
    };
  }

  const record = resolved.record;
  const { latitude, longitude } = parseNoiCoordinates(record);
  const coordinateCandidates = getNoiCoordinateCandidates(record);
  let resolvedGeometry: ResolvedGeometrySource | undefined;
  if (input.geometrySource) {
    try {
      resolvedGeometry = await resolveGeometrySource(input.geometrySource);
    } catch (error) {
      return {
        error: jsonError(
          `Failed to resolve geometrySource: ${
            error instanceof Error ? error.message : String(error)
          }`
        ),
        ok: false,
      };
    }
  }

  if (
    !resolvedGeometry &&
    coordinateCandidates.length === 0 &&
    !getNoiAddressCandidate(record)
  ) {
    return {
      error: jsonError(
        "NOI does not contain usable coordinates or facility address",
        422,
        {
          identifier: resolved.identifier,
        }
      ),
      ok: false,
    };
  }

  const disturbedAcres =
    input.disturbedAcres ??
    resolvedGeometry?.disturbedAcres ??
    parseNoiAcres(record);
  if (disturbedAcres === null || disturbedAcres <= 0) {
    return {
      error: jsonError("Unable to resolve disturbed acres from NOI", 422, {
        identifier: resolved.identifier,
      }),
      ok: false,
    };
  }

  const countyCode = getCountyCode(record);
  const countyIsMaricopa = isMaricopaCountyCode(countyCode);
  if (!countyIsMaricopa) {
    return {
      error: jsonError("NOI is not in Maricopa county", 422, {
        countyCode,
        identifier: resolved.identifier,
      }),
      ok: false,
    };
  }

  const fallbackLatitude = latitude ?? coordinateCandidates[0]?.latitude ?? 0;
  const fallbackLongitude = longitude ?? coordinateCandidates[0]?.longitude ?? 0;
  let siteLatitude = resolvedGeometry?.centroid?.lat ?? fallbackLatitude;
  let siteLongitude = resolvedGeometry?.centroid?.lng ?? fallbackLongitude;
  let manualMapRequired = false;
  let manualMapReason: string | null = null;
  let parcelLookupSource: NoiParcelLookupSource | null = null;
  let searchedAddress: string | null = null;
  let targetParcelDashed: string | null = null;
  let checks: Record<string, unknown>;

  if (resolvedGeometry && input.geometrySource) {
    checks = {
      ...buildGeometryChecks(input.geometrySource, resolvedGeometry),
      countyCode,
    };
  } else {
    const parcelResolution = await resolveParcelFromNoiRecord(record);
    const parcel = parcelResolution.parcel;
    parcelLookupSource = parcelResolution.parcelLookupSource;
    searchedAddress = parcelResolution.searchedAddress;

    if (!parcel) {
      manualMapRequired = true;
      manualMapReason =
        "No parcel found from NOI facility coordinates, outfalls, or facility address";
      checks = {
        ...buildNoParcelFallbackChecks({
          disturbedAcres,
          lookupSource: parcelResolution.parcelLookupSource,
          searchedAddress,
        }),
        countyCode,
        latitude,
        longitude,
      };
    } else {
      const parcelAcres = getParcelAcres(parcel);
      if (!parcelAcres || parcelAcres <= 0) {
        return {
          error: jsonError(
            "Unable to resolve parcel acreage from assessor data",
            422,
            {
              apn: parcel.apn,
            }
          ),
          ok: false,
        };
      }

      const decision = evaluateParcelAcreageDecision(
        disturbedAcres,
        parcelAcres
      );
      targetParcelDashed = formatApnDashed(parcel.apn);
      siteLatitude = parcel.centroid.lat;
      siteLongitude = parcel.centroid.lng;

      manualMapRequired = shouldSkipParcelMapDraw({
        disturbedAcres,
        maxAcreageRatio: getNoiMapAcreageRatioLimit(),
        parcelAcres,
      });
      if (manualMapRequired) {
        manualMapReason = `Parcel acreage (~${parcelAcres.toFixed(
          2
        )} ac) is much larger than NOI disturbed acreage (${disturbedAcres} ac); manual Page 2 map required`;
      }

      checks = {
        ...decision,
        countyCode,
        manualMapRequired,
        parcelLookupSource,
        searchedAddress,
        targetParcelDashed,
        ...(manualMapReason ? { manualMapReason } : {}),
      };
    }
  }

  // Company check: look up the NOI company in our permits database
  const noiCompanyName = clean(input.companyName) ?? clean(record.companyName);
  let companyMatch: CompanyMatch | null = null;
  if (noiCompanyName) {
    try {
      companyMatch = await findCompanyByName(noiCompanyName);
    } catch (error) {
      console.warn(
        `[noi] Company lookup unavailable for "${noiCompanyName}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Use the portal-known company name if we found a match
  const resolvedCompanyName = companyMatch?.companyName
    ? toTitleCase(companyMatch.companyName)
    : toTitleCase(noiCompanyName);
  // Resolve the company path before browser automation starts.
  const flow = input.flow ?? (companyMatch ? "existing-company" : "new-company");
  const formData = buildFormDataOverrides(
    record,
    disturbedAcres,
    siteLatitude,
    siteLongitude
  );
  if (manualMapRequired) {
    delete formData.site?.latitude;
    delete formData.site?.longitude;
  }

  const createPayload = {
    ...(resolvedCompanyName ? { companyName: resolvedCompanyName } : {}),
    ...(input.copyFromApp ? { copyFromApp: input.copyFromApp } : {}),
    flow,
    formData,
    ...(input.geometrySource ? { geometrySource: input.geometrySource } : {}),
  };

  return {
    ok: true,
    result: {
      approvedForCreate: Boolean(checks.approved),
      checks,
      companyMatch: companyMatch
        ? {
            matchedName: companyMatch.companyName,
            permitCount: companyMatch.permitCount,
            portalCompanyId: companyMatch.portalCompanyId,
          }
        : null,
      createPayload,
      noi: {
        companyName: clean(record.companyName),
        conEndDate: clean(record.conEndDate),
        conStartDate: clean(record.conStartDate),
        facilityName: clean(record.facilityName),
        latitude: siteLatitude,
        longitude: siteLongitude,
        identifier: resolved.identifier,
        ltfIdno: clean(record.ltfIdno),
        manualMapRequired,
        manualMapReason,
        parcelLookupSource,
        searchedAddress,
        targetParcelDashed,
        permitAuthCode: clean(record.permitAuthCode),
      },
    },
  };
}

/**
 * POST /api/noi/resolve
 *
 * Resolve NOI -> parcel + pricing-tier checks and return a create payload.
 */
export async function handleResolveNoi(body: unknown): Promise<Response> {
  const parsed = resolveNoiSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid input");
  }

  try {
    const outcome = await resolveNoiAndChecks(parsed.data);
    if (!outcome.ok) {
      return outcome.error;
    }

    return Response.json({
      success: true,
      ...outcome.result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : String(error),
      500
    );
  }
}

/**
 * POST /api/noi/create
 *
 * Same as /api/noi/resolve, but runs /api/permits/create when checks pass.
 */
export async function handleCreateFromNoi(body: unknown): Promise<Response> {
  const parsed = createNoiSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid input");
  }

  try {
    const outcome = await resolveNoiAndChecks(parsed.data);
    if (!outcome.ok) {
      return outcome.error;
    }

    const { approvedForCreate, checks, createPayload, noi } = outcome.result;
    if (!approvedForCreate) {
      return jsonError(
        "NOI triage failed: parcel acreage/tier check did not pass",
        422,
        {
          checks,
          createPayload,
          noi,
        }
      );
    }

    if (
      createPayload.flow === "existing-company" &&
      !clean(createPayload.companyName)
    ) {
      return jsonError(
        "companyName is required for existing-company flow",
        400,
        { createPayload, checks, noi }
      );
    }

    if (!parsed.data.create) {
      return Response.json({
        success: true,
        approvedForCreate,
        checks,
        createPayload,
        createSkipped: true,
        noi,
        timestamp: new Date().toISOString(),
      });
    }

    const createResponse = await handleCreatePermit(createPayload);
    const createData = await createResponse
      .clone()
      .json()
      .catch(() => null);

    return Response.json(
      {
        success: createResponse.ok,
        approvedForCreate,
        checks,
        create: createData,
        createPayload,
        noi,
        timestamp: new Date().toISOString(),
      },
      { status: createResponse.ok ? 200 : createResponse.status }
    );
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : String(error),
      500
    );
  }
}
