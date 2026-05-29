import type { ParcelData } from "@/lib/assessor";
import { queryParcelByCoordinates, smartAddressLookup } from "@/lib/assessor";
import type { AzdeqCgpRecord } from "@/lib/noi-endpoints";
import { approximatePolygonAreaM2, m2ToAcres } from "@/lib/site-drawing";

export type NoiParcelLookupSource =
  | "primary"
  | "outfall"
  | "address-exact"
  | "address-similar"
  | "none";

export interface NoiCoordinateCandidate {
  index: number;
  latitude: number;
  longitude: number;
  source: "primary" | "outfall";
}

export interface NoiAddressCandidate {
  address: string;
  city: string | null;
  formatted: string;
  state: string | null;
  zip: string | null;
}

interface AddressLookupResult {
  exact: ParcelData[];
  searchedStreet: string | null;
  similar: ParcelData[];
}

interface ParcelResolverDeps {
  queryParcelByCoordinates: (
    lat: number,
    lng: number
  ) => Promise<ParcelData | null>;
  smartAddressLookup: (
    address: string,
    city?: string
  ) => Promise<AddressLookupResult>;
}

export interface NoiParcelResolution {
  addressCandidate: NoiAddressCandidate | null;
  coordinateCandidate: NoiCoordinateCandidate | null;
  parcel: ParcelData | null;
  parcelLookupSource: NoiParcelLookupSource;
  searchedAddress: string | null;
  searchedCity: string | null;
}

const DEFAULT_DEPS: ParcelResolverDeps = {
  queryParcelByCoordinates,
  smartAddressLookup,
};

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseCoordinateValue(
  value: string | number | null | undefined
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function getNoiCoordinateCandidates(
  record: AzdeqCgpRecord
): NoiCoordinateCandidate[] {
  const seen = new Set<string>();
  const candidates: NoiCoordinateCandidate[] = [];

  const pushCandidate = (
    source: NoiCoordinateCandidate["source"],
    latitude: number | null,
    longitude: number | null,
    index: number
  ) => {
    if (latitude === null || longitude === null) {
      return;
    }

    const key = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    candidates.push({
      index,
      latitude,
      longitude,
      source,
    });
  };

  pushCandidate(
    "primary",
    parseCoordinateValue(record.ltfFacilityDetails?.latLongDetails?.latitude),
    parseCoordinateValue(record.ltfFacilityDetails?.latLongDetails?.longitude),
    0
  );

  for (const [index, outfall] of (record.outfalls ?? []).entries()) {
    pushCandidate(
      "outfall",
      parseCoordinateValue(outfall.latLongDetails?.latitude),
      parseCoordinateValue(outfall.latLongDetails?.longitude),
      index
    );
  }

  return candidates;
}

export function getNoiAddressCandidate(
  record: AzdeqCgpRecord
): NoiAddressCandidate | null {
  const placeAddress = record.ltfFacilityDetails?.placeAddress?.address;
  const address = clean(placeAddress?.address);
  if (!address) {
    return null;
  }

  const city = clean(placeAddress?.city);
  const state = clean(placeAddress?.state);
  const zip = clean(placeAddress?.zip);

  return {
    address,
    city,
    formatted: [address, city, state, zip].filter(Boolean).join(", "),
    state,
    zip,
  };
}

export function getParcelAcres(parcel: ParcelData | null): number | null {
  if (!parcel) {
    return null;
  }

  if (
    typeof parcel.acres === "number" &&
    Number.isFinite(parcel.acres) &&
    parcel.acres > 0
  ) {
    return parcel.acres;
  }

  if (!parcel.polygon || parcel.polygon.length < 3) {
    return null;
  }

  const computed = m2ToAcres(approximatePolygonAreaM2(parcel.polygon));
  return Number.isFinite(computed) && computed > 0 ? computed : null;
}

export function shouldSkipParcelMapDraw(params: {
  allowFullParcelDraw?: boolean;
  disturbedAcres: number | null;
  maxAcreageRatio?: number;
  parcelAcres: number | null;
}): boolean {
  if (params.allowFullParcelDraw) {
    return false;
  }

  if (
    params.disturbedAcres === null ||
    !Number.isFinite(params.disturbedAcres) ||
    params.disturbedAcres <= 0
  ) {
    return false;
  }

  if (
    params.parcelAcres === null ||
    !Number.isFinite(params.parcelAcres) ||
    params.parcelAcres <= 0
  ) {
    return false;
  }

  const maxAcreageRatio = params.maxAcreageRatio ?? 2;
  return params.parcelAcres / params.disturbedAcres > maxAcreageRatio;
}

export async function resolveParcelFromNoiRecord(
  record: AzdeqCgpRecord,
  deps: ParcelResolverDeps = DEFAULT_DEPS
): Promise<NoiParcelResolution> {
  const coordinateCandidates = getNoiCoordinateCandidates(record);
  const addressCandidate = getNoiAddressCandidate(record);

  for (const candidate of coordinateCandidates) {
    const parcel = await deps.queryParcelByCoordinates(
      candidate.latitude,
      candidate.longitude
    );
    if (parcel) {
      return {
        addressCandidate,
        coordinateCandidate: candidate,
        parcel,
        parcelLookupSource: candidate.source,
        searchedAddress: addressCandidate?.formatted ?? null,
        searchedCity: addressCandidate?.city ?? null,
      };
    }
  }

  if (addressCandidate) {
    const lookup = await deps.smartAddressLookup(
      addressCandidate.address,
      addressCandidate.city ?? undefined
    );

    const exact = lookup.exact[0] ?? null;
    if (exact) {
      return {
        addressCandidate,
        coordinateCandidate: null,
        parcel: exact,
        parcelLookupSource: "address-exact",
        searchedAddress: addressCandidate.formatted,
        searchedCity: addressCandidate.city,
      };
    }

    const similar = lookup.similar[0] ?? null;
    if (similar) {
      return {
        addressCandidate,
        coordinateCandidate: null,
        parcel: similar,
        parcelLookupSource: "address-similar",
        searchedAddress: addressCandidate.formatted,
        searchedCity: addressCandidate.city,
      };
    }
  }

  return {
    addressCandidate,
    coordinateCandidate: coordinateCandidates[0] ?? null,
    parcel: null,
    parcelLookupSource: "none",
    searchedAddress: addressCandidate?.formatted ?? null,
    searchedCity: addressCandidate?.city ?? null,
  };
}
