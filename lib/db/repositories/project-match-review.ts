import { db } from "@lib/db/client";
import type { Database } from "@lib/db/generated/database.types";
import { parseJsonValue } from "@lib/db/parsers";
import { normalizeProjectAlias } from "@lib/db/repositories/project-matching-utils";
import type {
  ProjectMatchCandidate,
  ProjectMatchDecision,
  ProjectMatchResult,
} from "@lib/db/repositories/types";
import type {
  ProjectMatchReview,
  ProjectMatchReviewStatus,
} from "@lib/db/types";

export type ProjectMatchReviewSource =
  | "folder_watcher"
  | "dust_permit_intake"
  | "email_resolver";

type ReviewRow = Omit<
  Database["public"]["Tables"]["project_match_reviews"]["Row"],
  "status"
> & {
  status: ProjectMatchReviewStatus;
};

function normalizeSourceKey(sourceKey: string): string {
  return normalizeProjectAlias(sourceKey).slice(0, 500);
}

function parseReviewRow(row: ReviewRow): ProjectMatchReview {
  return {
    id: row.id,
    source: row.source,
    sourceKey: row.source_key,
    status: row.status,
    primaryText: row.primary_text,
    aliasHints: parseJsonValue<string[]>(row.alias_hints, []),
    contractorHint: row.contractor_hint,
    addressHint: row.address_hint,
    accountIdHint: row.account_id_hint,
    candidates: parseJsonValue<ProjectMatchCandidate[]>(row.candidates, []),
    decision: parseJsonValue<ProjectMatchDecision>(row.decision, {
      best: null,
      runnerUp: null,
      autoLink: false,
      gap: 0,
      reason: "invalid_decision_payload",
      thresholds: { minScore: 0, minGap: 0 },
    }),
    selectedProjectId: row.selected_project_id,
    note: row.note,
    resolutionNote: row.resolution_note,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertProjectMatchReview(params: {
  source: ProjectMatchReviewSource;
  sourceKey: string;
  result: ProjectMatchResult;
  note?: string | null;
}): Promise<number | null> {
  const sourceKey = normalizeSourceKey(params.sourceKey);
  if (!sourceKey) {
    return null;
  }

  const row = await db
    .query<
      { id: number },
      [
        string,
        string,
        string,
        string,
        string,
        string | null,
        string | null,
        number | null,
        string,
        string,
        string | null,
      ]
    >(
      `INSERT INTO project_match_reviews (
         source,
         source_key,
         status,
         primary_text,
         alias_hints,
         contractor_hint,
         address_hint,
         account_id_hint,
         candidates,
         decision,
         note
       ) VALUES ($1, $2, 'pending', $3, $4::jsonb, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
       ON CONFLICT (source, source_key) DO UPDATE SET
         status = CASE
           WHEN project_match_reviews.status = 'resolved' THEN project_match_reviews.status
           ELSE 'pending'
         END,
         primary_text = EXCLUDED.primary_text,
         alias_hints = EXCLUDED.alias_hints,
         contractor_hint = EXCLUDED.contractor_hint,
         address_hint = EXCLUDED.address_hint,
         account_id_hint = EXCLUDED.account_id_hint,
         candidates = EXCLUDED.candidates,
         decision = EXCLUDED.decision,
         note = EXCLUDED.note,
         updated_at = now()
       RETURNING id`
    )
    .get(
      params.source,
      sourceKey,
      params.result.context.primaryText,
      JSON.stringify(params.result.context.aliasHints),
      params.result.context.contractorHint,
      params.result.context.addressHint,
      params.result.context.accountIdHint,
      JSON.stringify(params.result.candidates),
      JSON.stringify(params.result.decision),
      params.note ?? null
    );

  return row?.id ?? null;
}

export async function resolveProjectMatchReview(params: {
  source: ProjectMatchReviewSource;
  sourceKey: string;
  projectId: number;
  resolutionNote?: string | null;
}): Promise<void> {
  const sourceKey = normalizeSourceKey(params.sourceKey);
  if (!sourceKey) {
    return;
  }

  await db.run(
    `UPDATE project_match_reviews
     SET status = 'resolved',
         selected_project_id = $1,
         resolution_note = $2,
         resolved_at = now(),
         updated_at = now()
     WHERE source = $3 AND source_key = $4`,
    [params.projectId, params.resolutionNote ?? null, params.source, sourceKey]
  );
}

export async function getProjectMatchReview(
  source: ProjectMatchReviewSource,
  sourceKey: string
): Promise<ProjectMatchReview | null> {
  const normalized = normalizeSourceKey(sourceKey);
  if (!normalized) {
    return null;
  }

  const row = await db
    .query<ReviewRow, [string, string]>(
      "SELECT * FROM project_match_reviews WHERE source = $1 AND source_key = $2"
    )
    .get(source, normalized);
  return row ? parseReviewRow(row) : null;
}
