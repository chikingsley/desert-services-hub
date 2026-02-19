import type { MondayItemRich } from "@monday/client/rich";
import { ESTIMATING_COLUMNS } from "@monday/types/schema";

const NUMERIC_ID_RE = /^\d+$/;
const PROTOCOL_RE = /^https?:\/\//;
const WWW_RE = /^www\./;

interface HasEstimateColumns {
  columns: Record<string, string | null>;
  columnValues: Array<{
    id: string;
    linkedItemIds?: string[];
    value: string | null;
  }>;
}

export function parseNumber(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const cleaned = value.replace(/[,$]/g, "");
  const num = Number.parseFloat(cleaned);
  return Number.isNaN(num) ? null : num;
}

export function sanitizeMondayId(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return NUMERIC_ID_RE.test(trimmed) ? trimmed : null;
}

export function extractAccountId(item: HasEstimateColumns): string | null {
  const colValue = item.columnValues.find(
    (cv) => cv.id === ESTIMATING_COLUMNS.CONTRACTORS_DIRECT.id
  );
  return sanitizeMondayId(colValue?.linkedItemIds?.[0]);
}

export function parseLocationCoords(
  item: Pick<MondayItemRich, "columnValues">
): { lat: number; lng: number } | null {
  const col = item.columnValues.find(
    (cv) => cv.id === ESTIMATING_COLUMNS.LOCATION.id
  );
  if (!col?.value) {
    return null;
  }

  try {
    const parsed = JSON.parse(col.value) as {
      lat?: string | number;
      lng?: string | number;
    };
    const lat = Number(parsed.lat);
    const lng = Number(parsed.lng);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      (lat !== 0 || lng !== 0)
    ) {
      return { lat, lng };
    }
  } catch {
    // Ignore invalid location JSON payloads from Monday.
  }

  return null;
}

export function normalizeSharePointUrl(rawUrl: string | null): string | null {
  if (!rawUrl) {
    return null;
  }

  return rawUrl.replace(PROTOCOL_RE, "https://").replace(WWW_RE, "");
}
