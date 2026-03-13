/**
 * AZDEQ NOI / CGP endpoint helpers.
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
      address?: string | null;
      aptSuite?: string | null;
      city?: string | null;
      state?: string | null;
      zip?: string | null;
      countyCode?: string | null;
    } | null;
  } | null;
  companyName?: string | null;
  conEndDate?: string | null;
  conStartDate?: string | null;
  facilityName?: string | null;
  ltfFacilityDetails?: {
    placeAddress?: {
      address?: {
        address?: string | null;
        city?: string | null;
        state?: string | null;
        zip?: string | null;
        countyCode?: string | null;
      } | null;
    } | null;
    facilityCounty?: {
      countyCode?: string | null;
    } | null;
    latLongDetails?: AzdeqLatLong | null;
    ltfStatus?: string | null;
  } | null;
  ltfIdno?: string | null;
  outfalls?: AzdeqOutfall[] | null;
  permitAuthCode?: string | null;
  permitProjectArea?: string | null;
  permitType?: string | null;
  rcoName?: string | null;
  swpppDetails?: {
    fname?: string | null;
    lname?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  totalProjectArea?: string | null;
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractDigits(value: string | null | undefined): string | null {
  const cleaned = clean(value);
  if (!cleaned) {
    return null;
  }
  const digits = cleaned.replaceAll(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function parseLatLongNumber(
  value: string | number | null | undefined
): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseNoiAcres(record: AzdeqCgpRecord): number | null {
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
}

export function parseNoiCoordinates(record: AzdeqCgpRecord): {
  latitude: number | null;
  longitude: number | null;
} {
  const primary = record.ltfFacilityDetails?.latLongDetails;
  let latitude = parseLatLongNumber(primary?.latitude);
  let longitude = parseLatLongNumber(primary?.longitude);

  if (latitude !== null && longitude !== null) {
    return { latitude, longitude };
  }

  const firstOutfall = record.outfalls?.[0]?.latLongDetails;
  latitude = parseLatLongNumber(firstOutfall?.latitude);
  longitude = parseLatLongNumber(firstOutfall?.longitude);

  return { latitude, longitude };
}

export function normalizeNoiIdentifier(
  identifier: string
): NormalizedNoiIdentifier {
  const raw = identifier.trim();
  if (raw.length === 0) {
    throw new Error("Identifier is required");
  }

  const azcMatch = raw.match(REGEX_AZC);
  if (azcMatch?.[1]) {
    const ltfId = azcMatch[1];
    return {
      detectedFrom: "azc",
      ltfId,
      permitAuthCode: `AZC${ltfId}`,
      raw,
    };
  }

  const ltfMatch = raw.match(REGEX_LTF);
  if (ltfMatch?.[1]) {
    const ltfId = ltfMatch[1];
    return {
      detectedFrom: "ltf",
      ltfId,
      permitAuthCode: null,
      raw,
    };
  }

  const digitsMatch = raw.match(REGEX_DIGITS);
  if (digitsMatch?.[1]) {
    const ltfId = digitsMatch[1];
    return {
      detectedFrom: "digits",
      ltfId,
      permitAuthCode: null,
      raw,
    };
  }

  throw new Error(
    `Could not extract NOI/LTF identifier from input: "${identifier}"`
  );
}

export async function fetchNoiRecordsByLtfId(
  ltfId: string
): Promise<AzdeqCgpRecord[]> {
  const params = new URLSearchParams({ ltfid: ltfId });
  const response = await fetch(`${AZDEQ_NOI_CGP_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`AZDEQ NOI lookup failed with status ${response.status}`);
  }
  const json = (await response.json()) as unknown;
  if (!Array.isArray(json)) {
    throw new Error("AZDEQ NOI lookup returned non-array response");
  }
  return json as AzdeqCgpRecord[];
}

function hasMatchingLtfId(
  record: AzdeqCgpRecord,
  normalized: NormalizedNoiIdentifier
): boolean {
  const recordLtf = extractDigits(record.ltfIdno);
  return recordLtf === normalized.ltfId;
}

function hasMatchingPermitAuthCode(
  record: AzdeqCgpRecord,
  normalized: NormalizedNoiIdentifier
): boolean {
  if (!normalized.permitAuthCode) {
    return false;
  }
  const lhs = clean(record.permitAuthCode)?.toUpperCase();
  return lhs === normalized.permitAuthCode.toUpperCase();
}

export function selectBestNoiRecord(
  records: AzdeqCgpRecord[],
  normalized: NormalizedNoiIdentifier
): AzdeqCgpRecord | null {
  if (records.length === 0) {
    return null;
  }

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

  return records[0] ?? null;
}

export async function resolveNoiRecord(identifier: string): Promise<{
  identifier: NormalizedNoiIdentifier;
  record: AzdeqCgpRecord | null;
  records: AzdeqCgpRecord[];
}> {
  const normalized = normalizeNoiIdentifier(identifier);
  const records = await fetchNoiRecordsByLtfId(normalized.ltfId);
  const record = selectBestNoiRecord(records, normalized);

  return {
    identifier: normalized,
    record,
    records,
  };
}

export function isMaricopaCountyCode(
  countyCode: string | null | undefined
): boolean {
  const normalized = clean(countyCode)?.toUpperCase();
  return (
    normalized === "04013" ||
    normalized === "4013" ||
    normalized === "13" ||
    normalized === "MARICOPA"
  );
}
