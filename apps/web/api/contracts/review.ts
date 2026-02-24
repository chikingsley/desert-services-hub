/**
 * Contract Review API
 * Route: GET /api/contracts/review
 *
 * Returns contract documents that have been processed by langextract NER,
 * with their extracted entities grouped and severity-counted.
 */
import { db } from "@lib/db/client";

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

const listReviewDocs = db.query<ReviewDocRow>(`
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
  ORDER BY critical_count DESC, entity_count DESC, d.updated_at DESC
  LIMIT 200
`);

export async function listContractReview(_req: Request): Promise<Response> {
  try {
    const rows = await listReviewDocs.all();

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
    console.error("Failed to fetch contract review data:", error);
    return Response.json(
      { error: "Failed to fetch contract review data" },
      { status: 500 }
    );
  }
}
