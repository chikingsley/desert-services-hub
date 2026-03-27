/**
 * AZDEQ NOI / CGP helpers.
 * Ported from apps/dust-permits/src/lib/noi-endpoints.ts (subset).
 */

export const AZDEQ_NOI_CGP_URL =
  "https://my.azdeq.gov/deq-search/service/permit/cgp";

const REGEX_AZC = /AZC\s*#?\s*(\d{4,})/i;
const REGEX_LTF = /LTF\s*#?\s*(\d{4,})/i;
const REGEX_DIGITS = /\b(\d{4,})\b/;

type IdentifierSource = "azc" | "ltf" | "digits";

export interface NormalizedNoiIdentifier {
  detectedFrom: IdentifierSource;
  ltfId: string;
  permitAuthCode: string | null;
  raw: string;
}

interface AzdeqLatLong {
  latitude?: string | null;
  longitude?: string | null;
}

interface AzdeqOutfall {
  latLongDetails?: AzdeqLatLong | null;
}

export interface AzdeqCgpRecord {
  companyAddress?: {
    address?: {
      countyCode?: string | null;
    } | null;
  } | null;
  companyName?: string | null;
  facilityName?: string | null;
  ltfFacilityDetails?: {
    facilityCounty?: {
      countyCode?: string | null;
    } | null;
    latLongDetails?: AzdeqLatLong | null;
    placeAddress?: {
      address?: {
        countyCode?: string | null;
      } | null;
    } | null;
  } | null;
  ltfIdno?: string | null;
  outfalls?: AzdeqOutfall[] | null;
  permitAuthCode?: string | null;
  permitProjectArea?: string | null;
  totalProjectArea?: string | null;
}

const clean = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const extractDigits = (value: string | null | undefined): string | null => {
  const cleaned = clean(value);
  if (!cleaned) {
    return null;
  }
  const digits = cleaned.replaceAll(/\D/g, "");
  return digits.length > 0 ? digits : null;
};

const parseLatLongNumber = (
  value: string | number | null | undefined
): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseNoiAcres = (record: AzdeqCgpRecord): number | null => {
  const permitProjectAreaRaw = clean(record.permitProjectArea);
  if (permitProjectAreaRaw) {
    const permitProjectArea = Number.parseFloat(permitProjectAreaRaw);
    if (Number.isFinite(permitProjectArea) && permitProjectArea > 0) {
      return permitProjectArea;
    }
  }

  const totalProjectAreaRaw = clean(record.totalProjectArea);
  if (totalProjectAreaRaw) {
    const totalProjectArea = Number.parseFloat(totalProjectAreaRaw);
    if (Number.isFinite(totalProjectArea) && totalProjectArea > 0) {
      return totalProjectArea;
    }
  }

  return null;
};

export const parseNoiCoordinates = (
  record: AzdeqCgpRecord
): {
  latitude: number | null;
  longitude: number | null;
} => {
  const primary = record.ltfFacilityDetails?.latLongDetails;
  let latitude = parseLatLongNumber(primary?.latitude);
  let longitude = parseLatLongNumber(primary?.longitude);

  if (latitude !== null && longitude !== null) {
    return { latitude, longitude };
  }

  const [firstOutfall] = record.outfalls ?? [];
  latitude = parseLatLongNumber(firstOutfall?.latLongDetails?.latitude);
  longitude = parseLatLongNumber(firstOutfall?.latLongDetails?.longitude);

  return { latitude, longitude };
};

export const normalizeNoiIdentifier = (
  identifier: string
): NormalizedNoiIdentifier => {
  const raw = identifier.trim();
  if (raw.length === 0) {
    throw new Error("Identifier is required");
  }

  const [, azcLtfId] = raw.match(REGEX_AZC) ?? [];
  if (azcLtfId) {
    return {
      detectedFrom: "azc",
      ltfId: azcLtfId,
      permitAuthCode: `AZC${azcLtfId}`,
      raw,
    };
  }

  const [, ltfId] = raw.match(REGEX_LTF) ?? [];
  if (ltfId) {
    return {
      detectedFrom: "ltf",
      ltfId,
      permitAuthCode: null,
      raw,
    };
  }

  const [, digitsLtfId] = raw.match(REGEX_DIGITS) ?? [];
  if (digitsLtfId) {
    return {
      detectedFrom: "digits",
      ltfId: digitsLtfId,
      permitAuthCode: null,
      raw,
    };
  }

  throw new Error(
    `Could not extract NOI/LTF identifier from input: "${identifier}"`
  );
};

export const fetchNoiRecordsByLtfId = async (
  ltfId: string
): Promise<AzdeqCgpRecord[]> => {
  const params = new URLSearchParams({ ltfid: ltfId });
  const response = await fetch(`${AZDEQ_NOI_CGP_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`AZDEQ NOI lookup failed with status ${response.status}`);
  }

  const json = (await response.json()) as unknown;
  if (!Array.isArray(json)) {
    throw new TypeError("AZDEQ NOI lookup returned non-array response");
  }

  return json as AzdeqCgpRecord[];
};

const hasMatchingLtfId = (
  record: AzdeqCgpRecord,
  normalized: NormalizedNoiIdentifier
): boolean => {
  const recordLtf = extractDigits(record.ltfIdno);
  return recordLtf === normalized.ltfId;
};

const hasMatchingPermitAuthCode = (
  record: AzdeqCgpRecord,
  normalized: NormalizedNoiIdentifier
): boolean => {
  if (!normalized.permitAuthCode) {
    return false;
  }
  const lhs = clean(record.permitAuthCode)?.toUpperCase();
  return lhs === normalized.permitAuthCode.toUpperCase();
};

export const selectBestNoiRecord = (
  records: AzdeqCgpRecord[],
  normalized: NormalizedNoiIdentifier
): AzdeqCgpRecord | null => {
  const byLtf = records.find((record) => hasMatchingLtfId(record, normalized));
  if (byLtf) {
    return byLtf;
  }

  const byPermitId = records.find((record) =>
    hasMatchingPermitAuthCode(record, normalized)
  );
  if (byPermitId) {
    return byPermitId;
  }

  const [firstRecord] = records;
  return firstRecord ?? null;
};

export const resolveNoiRecord = async (
  identifier: string
): Promise<{
  identifier: NormalizedNoiIdentifier;
  record: AzdeqCgpRecord | null;
  records: AzdeqCgpRecord[];
}> => {
  const normalized = normalizeNoiIdentifier(identifier);
  const records = await fetchNoiRecordsByLtfId(normalized.ltfId);
  const record = selectBestNoiRecord(records, normalized);

  return {
    identifier: normalized,
    record,
    records,
  };
};

export const isMaricopaCountyCode = (
  countyCode: string | null | undefined
): boolean => {
  const normalized = clean(countyCode)?.toUpperCase();
  return (
    normalized === "04013" ||
    normalized === "4013" ||
    normalized === "13" ||
    normalized === "MARICOPA"
  );
};

export const getCountyCode = (record: AzdeqCgpRecord): string | null => {
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
};
