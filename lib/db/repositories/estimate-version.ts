import { db } from "@lib/db/hub";

interface EstimateVersionStateRow {
  id: string;
  is_current: number;
  version_number: number;
  created_at: string;
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
    .prepare(
      `SELECT id, is_current, version_number, created_at
       FROM estimate_versions
       WHERE estimate_id = ?
       ORDER BY is_current DESC, version_number DESC, created_at DESC, id DESC`
    )
    .all(estimateId)) as EstimateVersionStateRow[];

  if (versions.length === 0) {
    const versionId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO estimate_versions (id, estimate_id, version_number, source, total, is_current)
         VALUES (?, ?, 1, ?, ?, 1)`
      )
      .run(versionId, estimateId, source, total);
    return { versionId, created: true };
  }

  const preferred = versions[0];
  const currentCount = versions.filter((v) => v.is_current === 1).length;
  const needsNormalization = preferred.is_current !== 1 || currentCount !== 1;

  if (needsNormalization) {
    await db
      .prepare(
        `UPDATE estimate_versions
         SET is_current = CASE WHEN id = ? THEN 1 ELSE 0 END
         WHERE estimate_id = ?`
      )
      .run(preferred.id, estimateId);
  }

  return { versionId: preferred.id, created: false };
}
