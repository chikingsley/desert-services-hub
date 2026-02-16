import type {
  Estimate,
  EstimateLineItem,
  EstimateSection,
  EstimateVersion,
} from "@estimates/estimating/types";
import { db } from "@lib/db/hub";
import { generateBaseNumber } from "@lib/utils";

// Generate a unique base number (YYMMDD format with suffix for duplicates)
export async function getNextBaseNumber(): Promise<string> {
  const baseNumber = generateBaseNumber();

  const existing = (await db
    .prepare(
      `SELECT base_number FROM estimates
       WHERE base_number LIKE ?
       ORDER BY base_number DESC
       LIMIT 1`
    )
    .get(`${baseNumber}%`)) as { base_number: string } | null;

  if (!existing) {
    return baseNumber;
  }

  const lastNumber = existing.base_number;
  if (lastNumber.length > 6) {
    const suffix = Number.parseInt(lastNumber.slice(6), 10) + 1;
    return `${baseNumber}${suffix.toString().padStart(2, "0")}`;
  }
  return `${baseNumber}01`;
}

// Build full estimate number with revision
export function getEstimateNumber(
  baseNumber: string,
  versionNumber: number
): string {
  const revision = versionNumber - 1; // version 1 = R0
  return `${baseNumber}R${revision}`;
}

function parseEstimateRow(
  row: Record<string, unknown> & { versions: unknown }
): Estimate {
  return {
    ...row,
    versions:
      typeof row.versions === "string"
        ? JSON.parse(row.versions)
        : (row.versions ?? []),
  } as Estimate;
}

// List all estimates
export async function listEstimates(): Promise<Estimate[]> {
  const rows = (await db
    .prepare(
      `SELECT q.*,
        (SELECT COALESCE(json_agg(json_build_object(
          'id', v.id,
          'version_number', v.version_number,
          'total', v.total,
          'is_current', v.is_current,
          'created_at', v.created_at
        )), '[]'::json) FROM estimate_versions v WHERE v.estimate_id = q.id) as versions
      FROM estimates q
      ORDER BY q.created_at DESC`
    )
    .all()) as Array<Record<string, unknown> & { versions: unknown }>;

  return rows.map(parseEstimateRow);
}

// Get a single estimate by ID
export async function getEstimate(id: string): Promise<Estimate | null> {
  const row = (await db
    .prepare(
      `SELECT q.*,
        (SELECT COALESCE(json_agg(json_build_object(
          'id', v.id,
          'version_number', v.version_number,
          'total', v.total,
          'is_current', v.is_current,
          'created_at', v.created_at
        )), '[]'::json) FROM estimate_versions v WHERE v.estimate_id = q.id) as versions
      FROM estimates q
      WHERE q.id = ?`
    )
    .get(id)) as (Record<string, unknown> & { versions: unknown }) | null;

  return row ? parseEstimateRow(row) : null;
}

// Get estimate by base number
export async function getEstimateByBaseNumber(
  baseNumber: string
): Promise<Estimate | null> {
  const row = (await db
    .prepare(
      `SELECT q.*,
        (SELECT COALESCE(json_agg(json_build_object(
          'id', v.id,
          'version_number', v.version_number,
          'total', v.total,
          'is_current', v.is_current,
          'created_at', v.created_at
        )), '[]'::json) FROM estimate_versions v WHERE v.estimate_id = q.id) as versions
      FROM estimates q
      WHERE q.base_number = ?`
    )
    .get(baseNumber)) as
    | (Record<string, unknown> & { versions: unknown })
    | null;

  return row ? parseEstimateRow(row) : null;
}

// Get full estimate with current version details
export async function getEstimateWithDetails(id: string): Promise<
  | (Estimate & {
      current_version: EstimateVersion;
    })
  | null
> {
  const estimate = await getEstimate(id);
  if (!estimate) {
    return null;
  }

  const currentVersion = estimate.versions.find((v) => v.is_current);
  if (!currentVersion) {
    return null;
  }

  const sections = (await db
    .prepare(
      `SELECT id, name, title, show_subtotal, sort_order
       FROM estimate_sections
       WHERE version_id = ?
       ORDER BY sort_order`
    )
    .all(currentVersion.id)) as EstimateSection[];

  const lineItems = (await db
    .prepare(
      `SELECT
        id,
        section_id,
        item_name,
        description,
        quantity,
        unit,
        unit_price,
        notes,
        sort_order
       FROM estimate_line_items
       WHERE version_id = ?
       ORDER BY sort_order`
    )
    .all(currentVersion.id)) as EstimateLineItem[];

  return {
    ...estimate,
    current_version: {
      ...currentVersion,
      sections,
      line_items: lineItems,
    },
  };
}
