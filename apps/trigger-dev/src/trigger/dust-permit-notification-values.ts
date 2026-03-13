function coerceString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function abbreviateState(state: string | null): string | null {
  if (!state) {
    return null;
  }
  if (state.length === 2) {
    return state.toUpperCase();
  }

  const normalized = state.toLowerCase();
  if (normalized === "arizona") {
    return "AZ";
  }

  return state;
}

function joinAddressParts(parts: Array<string | null>): string {
  return parts.filter((part): part is string => Boolean(part)).join(", ");
}

export function formatNotificationAcreage(
  disturbedArea: string | null | undefined
): string {
  return coerceString(disturbedArea) ?? "N/A";
}

export function formatNotificationSiteAddress(
  permit: {
    address?: unknown;
    city?: unknown;
  },
  scraped?: {
    locations?: Array<{
      address?: unknown;
      city?: unknown;
      isSelected?: unknown;
      state?: unknown;
      zip?: unknown;
    }> | null;
  } | null
): string {
  const selectedLocation =
    scraped?.locations?.find((location) => location.isSelected === true) ??
    scraped?.locations?.[0];

  if (selectedLocation) {
    const address = coerceString(selectedLocation.address);
    const city = coerceString(selectedLocation.city);
    const state = abbreviateState(coerceString(selectedLocation.state));
    const zip = coerceString(selectedLocation.zip);
    const stateZip =
      state && zip ? `${state} ${zip}` : state ?? zip ?? null;
    const full = joinAddressParts([address, city, stateZip]);
    if (full && (address || !coerceString(permit.address))) {
      return full;
    }
  }

  const permitAddress = coerceString(permit.address);
  const permitCity = coerceString(permit.city);
  return joinAddressParts([permitAddress, permitCity]) || "N/A";
}
