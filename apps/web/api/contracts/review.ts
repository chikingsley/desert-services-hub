/**
 * Contract Review API
 * Route: GET /api/contracts/review
 *
 * Returns contract documents that have been processed by langextract NER,
 * with their extracted entities grouped and severity-counted.
 */
import { db } from "@lib/db/client";
import {
  formatErrorForLog,
  isApiDbTimeoutError,
  withApiDbTimeout,
} from "@/api/utils/db-guard";

interface EntityRow {
  attributes: {
    severity?: "critical" | "warning" | "info";
    recommended_action?: string;
  };
  class: string;
  end: number | null;
  start: number | null;
  text: string;
}

interface ReviewDocRow {
  critical_count: number;
  document_type: string | null;
  entities: string; // JSON string from Postgres
  entity_count: number;
  file_name: string | null;
  id: number;
  info_count: number;
  model: string | null;
  project_id: number | null;
  project_name: string | null;
  updated_at: string;
  warning_count: number;
}

const REVIEW_DOCS_BASE_SELECT = `
  SELECT
    d.id,
    d.file_name,
    d.document_type,
    d.project_id,
    p.name AS project_name,
    (d.raw_extraction->'contract_structured_extraction'->>'extraction_count')::int AS entity_count,
    (
      SELECT COUNT(*)::int FROM jsonb_array_elements(
        d.raw_extraction->'contract_structured_extraction'->'entities'
      ) e WHERE e->'attributes'->>'severity' = 'critical'
    ) AS critical_count,
    (
      SELECT COUNT(*)::int FROM jsonb_array_elements(
        d.raw_extraction->'contract_structured_extraction'->'entities'
      ) e WHERE e->'attributes'->>'severity' = 'warning'
    ) AS warning_count,
    (
      SELECT COUNT(*)::int FROM jsonb_array_elements(
        d.raw_extraction->'contract_structured_extraction'->'entities'
      ) e WHERE e->'attributes'->>'severity' = 'info'
    ) AS info_count,
    d.raw_extraction->'contract_structured_extraction'->>'model' AS model,
    (d.raw_extraction->'contract_structured_extraction'->'entities')::text AS entities,
    d.updated_at
  FROM documents d
  LEFT JOIN projects p ON p.id = d.project_id
  WHERE d.raw_extraction->>'contract_structured_extraction' IS NOT NULL
    AND (d.raw_extraction->'contract_structured_extraction'->>'extraction_count')::int > 0
`;

function parsePositiveQueryId(raw: string | null): number | null {
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export async function listContractReview(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(req.url);
    const projectId = parsePositiveQueryId(url.searchParams.get("projectId"));

    const rows = await withApiDbTimeout(
      {
        operation: "contracts.review-items",
        requestId,
        route: "/api/contracts/review",
      },
      () => {
        if (projectId) {
          return db
            .query<ReviewDocRow, [number]>(
              `${REVIEW_DOCS_BASE_SELECT}
               AND d.project_id = $1
               ORDER BY critical_count DESC, entity_count DESC, d.updated_at DESC
               LIMIT 100`
            )
            .all(projectId);
        }
        return db
          .query<ReviewDocRow>(
            `${REVIEW_DOCS_BASE_SELECT}
             ORDER BY critical_count DESC, entity_count DESC, d.updated_at DESC
             LIMIT 200`
          )
          .all();
      }
    );

    const items = rows.map((row) => {
      let entities: EntityRow[] = [];
      try {
        entities = JSON.parse(row.entities) as EntityRow[];
      } catch {
        entities = [];
      }

      return {
        id: row.id,
        file_name: row.file_name,
        document_type: row.document_type,
        project_id: row.project_id,
        project_name: row.project_name,
        entity_count: row.entity_count ?? 0,
        critical_count: row.critical_count ?? 0,
        warning_count: row.warning_count ?? 0,
        info_count: row.info_count ?? 0,
        model: row.model,
        entities,
        updated_at: row.updated_at,
      };
    });

    return Response.json({ items, total: items.length });
  } catch (error) {
    console.error("[api.contracts.review] failed", {
      requestId,
      route: "/api/contracts/review",
      error: formatErrorForLog(error),
    });
    if (isApiDbTimeoutError(error)) {
      return Response.json(
        {
          error: "Contract review query timed out",
          requestId,
        },
        { status: 503 }
      );
    }
    return Response.json(
      { error: "Failed to fetch contract review data", requestId },
      { status: 500 }
    );
  }
}
