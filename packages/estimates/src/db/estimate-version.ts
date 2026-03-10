import { db } from "@lib/db/client";

interface EstimateVersionStateRow {
  created_at: string;
  id: string;
  is_current: number;
  version_number: number;
}

interface EnsureEstimateVersionOptions {
  source?: string;
  total?: number;
}

/**
 * Guarantees that an estimate has exactly one current version.
 * - If no versions exist, create a baseline v1/current row.
 * - If versions exist, normalize to a single current (latest preferred).
 */
export async function ensureEstimateHasCurrentVersion(
  estimateId: number,
  options: EnsureEstimateVersionOptions = {}
): Promise<{ versionId: string; created: boolean }> {
  const source = options.source ?? "sync";
  const total = options.total ?? 0;

  const versions = (await db
    .query(
      `SELECT id, is_current, version_number, created_at
       FROM estimate_versions
       WHERE estimate_id = $1
       ORDER BY is_current DESC, version_number DESC, created_at DESC, id DESC`
    )
    .all(estimateId)) as EstimateVersionStateRow[];

  if (versions.length === 0) {
    const versionId = crypto.randomUUID();
    await db
      .query(
        `INSERT INTO estimate_versions (id, estimate_id, version_number, source, total, is_current)
         VALUES ($1, $2, 1, $3, $4, 1)`
      )
      .run(versionId, estimateId, source, total);
    return { versionId, created: true };
  }

  const preferred = versions[0];
  const currentCount = versions.filter((v) => v.is_current === 1).length;
  const needsNormalization = preferred.is_current !== 1 || currentCount !== 1;

  if (needsNormalization) {
    await db
      .query(
        `UPDATE estimate_versions
         SET is_current = CASE WHEN id = $1 THEN 1 ELSE 0 END
         WHERE estimate_id = $2`
      )
      .run(preferred.id, estimateId);
  }

  return { versionId: preferred.id, created: false };
}
