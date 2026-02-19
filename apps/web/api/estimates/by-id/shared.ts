import { db } from "@lib/db/client";
import type { EstimateVersionRow } from "@lib/db/types";
import { generateBaseNumber } from "@lib/utils";

// Bun extends Request with params from route matching
type BunRequest = Request & { params: { id: string } };

export type { BunRequest };

export async function getPreferredEstimateVersion(
  estimateId: number
): Promise<EstimateVersionRow | undefined> {
  return (await db
    .query(
      `SELECT *
       FROM estimate_versions
       WHERE estimate_id = $1
       ORDER BY is_current DESC, version_number DESC, created_at DESC
       LIMIT 1`
    )
    .get(estimateId)) as EstimateVersionRow | undefined;
}

export function parseEstimateId(rawId: string): number | null {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

export function parseFinalizeProjectId(
  value: unknown
): number | null | "invalid" {
  if (value === undefined || value === null) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return "invalid";
  }

  return parsed;
}

export function parseFinalizeRequestBody(rawBody: unknown): {
  projectId: number | null | "invalid";
  source: string;
} {
  const body =
    rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
      ? (rawBody as Record<string, unknown>)
      : {};

  const source =
    typeof body.source === "string" && body.source.trim().length > 0
      ? body.source.trim()
      : "estimate_editor_finalize";

  return {
    projectId: parseFinalizeProjectId(body.project_id),
    source,
  };
}

export async function getLinkedProjectIds(
  estimateId: number
): Promise<number[]> {
  const linkedRows = (await db
    .query(
      `SELECT DISTINCT project_id
       FROM project_estimates
       WHERE estimate_id = $1
       ORDER BY project_id ASC`
    )
    .all(estimateId)) as Array<{ project_id: number }>;

  return linkedRows.map((row) => row.project_id);
}

export function resolveFinalizeProjectId(
  requestedProjectId: number | null,
  linkedProjectIds: number[]
): { projectId: number } | { errorResponse: Response } {
  if (requestedProjectId !== null) {
    return { projectId: requestedProjectId };
  }

  if (linkedProjectIds.length === 0) {
    return {
      errorResponse: Response.json(
        {
          error:
            "Estimate is not linked to any project. Provide project_id to finalize.",
          code: "missing_project_link",
        },
        { status: 409 }
      ),
    };
  }

  if (linkedProjectIds.length > 1) {
    return {
      errorResponse: Response.json(
        {
          error:
            "Estimate links to multiple projects. Provide project_id to finalize deterministically.",
          code: "ambiguous_project_link",
          project_ids: linkedProjectIds,
        },
        { status: 409 }
      ),
    };
  }

  const onlyLinkedProjectId = linkedProjectIds[0];
  if (onlyLinkedProjectId === undefined) {
    return {
      errorResponse: Response.json(
        { error: "Failed to resolve project for finalize" },
        { status: 500 }
      ),
    };
  }

  return { projectId: onlyLinkedProjectId };
}

// Generate a unique base number (YYMMDD format with suffix for duplicates)
export async function getNextBaseNumber(): Promise<string> {
  const baseNumber = generateBaseNumber();

  const existing = (await db
    .query(
      `SELECT base_number FROM estimates
       WHERE base_number LIKE $1
       ORDER BY base_number DESC
       LIMIT 1`
    )
    .get(`${baseNumber}%`)) as { base_number: string } | undefined;

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
