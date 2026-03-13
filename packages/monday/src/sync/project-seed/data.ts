/**
 * Types, helpers, and data access for project-seed sync.
 * Split out from sync.ts to keep modules focused and testable.
 */
import { db } from "@lib/db/client";
import { normalizeProjectNameKey } from "@projects/db/project-matching-utils";
import { parseVariantPrefix } from "@sharepoint/paths";
import {
  batchFetchGroupMap,
  batchFetchMap,
  batchFetchRows,
  chunk,
} from "./sql-utils";

// ── Constants ─────────────────────────────────────────────────────────

export const ACTIVE_BID_STATUSES = new Set([
  "won",
  "pending won",
  "add to projects",
]);
export const LOST_BID_STATUSES = new Set([
  "lost",
  "duplicates",
  "gc not awarded",
]);
export const PROJECT_LINK_SOURCE = "estimate_seed_sync";
export const SQL_BATCH_SIZE = 250;

// ── Types ─────────────────────────────────────────────────────────────

export interface EstimateSeedRow {
  account_id: number | null;
  awarded: number | null;
  bid_status: string | null;
  contractor: string | null;
  id: number;
  job_address: string | null;
  job_name: string | null;
  location: string | null;
  name: string;
  updated_at: string;
}

export interface ProjectSeedRow {
  account_id: number | null;
  address: string | null;
  contractor: string | null;
  id: number;
  lifecycle_state: string | null;
  name: string;
  normalized_name: string | null;
  seed_key: string | null;
  seed_source: string | null;
}

export interface ExistingEstimateProjectLink {
  estimate_id: number;
  project_id: number;
}

export interface SeedDescriptor {
  addressHint: string | null;
  displayName: string;
  hasLocationKey: boolean;
  normalizedName: string;
  seedKey: string;
}

export interface SeedGroup {
  activeSignal: boolean;
  allLostSignal: boolean;
  estimates: EstimateSeedRow[];
  hasLocationKey: boolean;
  latestEvidenceAt: string;
  normalizedName: string;
  representativeAccountId: number | null;
  representativeAddress: string | null;
  representativeContractor: string | null;
  representativeName: string;
  seedKey: string;
}

// ── Helper functions ──────────────────────────────────────────────────

export function normalizeBidStatus(
  value: string | null | undefined
): string | null {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function parseTimestampMs(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLocationKey(value: string | null | undefined): string | null {
  const normalized = (value ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > 0 ? normalized : null;
}

export function deriveSeedDescriptor(
  row: EstimateSeedRow
): SeedDescriptor | null {
  const sourceName = (row.job_name ?? row.name ?? "").trim();
  if (!sourceName) {
    return null;
  }

  const variant = parseVariantPrefix(sourceName);
  const displayName = variant.baseName.trim();
  const normalizedName = normalizeProjectNameKey(displayName);
  if (!normalizedName) {
    return null;
  }

  const rawAddress = (row.job_address ?? row.location ?? "").trim();
  const locationKey = normalizeLocationKey(rawAddress);
  const hasLocationKey = Boolean(locationKey);

  return {
    seedKey: locationKey ? `${normalizedName}::${locationKey}` : normalizedName,
    normalizedName,
    displayName,
    hasLocationKey,
    addressHint: rawAddress || null,
  };
}

export function getEstimatePriority(row: EstimateSeedRow): number {
  const status = normalizeBidStatus(row.bid_status);
  let score = 0;

  if ((row.awarded ?? 0) === 1) {
    score += 200;
  }
  if (status && ACTIVE_BID_STATUSES.has(status)) {
    score += 150;
  }
  if (status === "bid sent") {
    score += 40;
  }
  if ((row.job_address ?? row.location ?? "").trim().length > 0) {
    score += 20;
  }
  score += parseTimestampMs(row.updated_at) / 1_000_000_000_000;
  return score;
}

export function reduceToGroup(
  seedKey: string,
  rows: EstimateSeedRow[]
): SeedGroup {
  const ranked = [...rows].sort((lhs, rhs) => {
    const byScore = getEstimatePriority(rhs) - getEstimatePriority(lhs);
    if (byScore !== 0) {
      return byScore;
    }
    return rhs.id - lhs.id;
  });

  const best = ranked[0];
  const descriptor = best ? deriveSeedDescriptor(best) : null;
  if (!(best && descriptor)) {
    throw new Error(`Invalid seed group ${seedKey}`);
  }

  const statuses = ranked.map((row) => normalizeBidStatus(row.bid_status));
  const activeSignal = ranked.some((row) => {
    if ((row.awarded ?? 0) === 1) {
      return true;
    }
    const status = normalizeBidStatus(row.bid_status);
    return status ? ACTIVE_BID_STATUSES.has(status) : false;
  });
  const hasKnownStatus = statuses.some((status) => status !== null);
  const hasNonLostNonActive = statuses.some(
    (status) =>
      status !== null &&
      !LOST_BID_STATUSES.has(status) &&
      !ACTIVE_BID_STATUSES.has(status)
  );
  const allLostSignal = hasKnownStatus && !activeSignal && !hasNonLostNonActive;

  let latestEvidenceAt = best.updated_at;
  for (const row of ranked) {
    if (parseTimestampMs(row.updated_at) > parseTimestampMs(latestEvidenceAt)) {
      latestEvidenceAt = row.updated_at;
    }
  }

  return {
    seedKey,
    normalizedName: descriptor.normalizedName,
    hasLocationKey: descriptor.hasLocationKey,
    estimates: ranked,
    representativeName: descriptor.displayName,
    representativeAddress: descriptor.addressHint,
    representativeAccountId: best.account_id ?? null,
    representativeContractor: best.contractor ?? null,
    latestEvidenceAt,
    activeSignal,
    allLostSignal,
  };
}

// ── Data access ───────────────────────────────────────────────────────

const PROJECT_SEED_COLUMNS =
  "id, lifecycle_state, seed_key, seed_source, name, normalized_name, address, account_id, contractor";

export async function fetchEstimateRows(
  limit?: number
): Promise<EstimateSeedRow[]> {
  if (limit && limit > 0) {
    return await db
      .query<EstimateSeedRow>(
        `SELECT
           id, name, job_name, contractor, account_id, location,
           job_address, bid_status, awarded, updated_at
         FROM estimates
         WHERE trim(COALESCE(job_name, name, '')) <> ''
         ORDER BY updated_at DESC, id DESC
         LIMIT $1`
      )
      .all(limit);
  }

  return await db
    .query<EstimateSeedRow>(
      `SELECT
         id, name, job_name, contractor, account_id, location,
         job_address, bid_status, awarded, updated_at
       FROM estimates
       WHERE trim(COALESCE(job_name, name, '')) <> ''
       ORDER BY id ASC`
    )
    .all();
}

export function fetchEstimateProjectLinks(
  estimateIds: number[]
): Promise<ExistingEstimateProjectLink[]> {
  return batchFetchRows<ExistingEstimateProjectLink>(
    estimateIds,
    SQL_BATCH_SIZE,
    (ph) =>
      `SELECT estimate_id, project_id FROM project_estimates WHERE estimate_id IN (${ph})`
  );
}

export function fetchProjectsByIds(
  projectIds: number[]
): Promise<Map<number, ProjectSeedRow>> {
  return batchFetchMap<number, ProjectSeedRow>(
    projectIds,
    SQL_BATCH_SIZE,
    (ph) => `SELECT ${PROJECT_SEED_COLUMNS} FROM projects WHERE id IN (${ph})`,
    (row) => row.id
  );
}

export function fetchProjectsBySeedKey(
  seedKeys: string[]
): Promise<Map<string, ProjectSeedRow>> {
  return batchFetchMap<string, ProjectSeedRow>(
    seedKeys,
    SQL_BATCH_SIZE,
    (ph) =>
      `SELECT ${PROJECT_SEED_COLUMNS} FROM projects WHERE seed_key IN (${ph})`,
    (row) => row.seed_key ?? null
  );
}

export function fetchProjectsByNormalizedName(
  normalizedNames: string[]
): Promise<Map<string, ProjectSeedRow[]>> {
  return batchFetchGroupMap<string, ProjectSeedRow>(
    normalizedNames,
    SQL_BATCH_SIZE,
    (ph) =>
      `SELECT ${PROJECT_SEED_COLUMNS} FROM projects WHERE normalized_name IN (${ph})`,
    (row) => row.normalized_name ?? null
  );
}

// ── Ranking / decision helpers ────────────────────────────────────────

export function projectStateRank(value: string | null | undefined): number {
  switch ((value ?? "").toLowerCase()) {
    case "active":
      return 30;
    case "seed":
      return 20;
    case "lost":
      return 10;
    case "archived":
      return 0;
    default:
      return 0;
  }
}

export function chooseLinkedProjectId(
  linkedProjectIds: number[],
  group: SeedGroup,
  projectsById: Map<number, ProjectSeedRow>
): number | null {
  if (linkedProjectIds.length === 0) {
    return null;
  }

  const sorted = [...new Set(linkedProjectIds)].sort((lhsId, rhsId) => {
    const lhs = projectsById.get(lhsId);
    const rhs = projectsById.get(rhsId);

    const lhsSeedMatch = lhs?.seed_key === group.seedKey ? 1 : 0;
    const rhsSeedMatch = rhs?.seed_key === group.seedKey ? 1 : 0;
    if (lhsSeedMatch !== rhsSeedMatch) {
      return rhsSeedMatch - lhsSeedMatch;
    }

    const byState =
      projectStateRank(rhs?.lifecycle_state) -
      projectStateRank(lhs?.lifecycle_state);
    if (byState !== 0) {
      return byState;
    }
    return lhsId - rhsId;
  });

  return sorted[0] ?? null;
}

export function deriveDesiredState(
  currentState: string | null | undefined,
  group: SeedGroup
): "seed" | "active" | "lost" | "archived" {
  const current = (currentState ?? "seed").toLowerCase();
  if (current === "archived") {
    return "archived";
  }
  if (current === "seed" && group.activeSignal) {
    return "active";
  }
  if (current === "seed" && group.allLostSignal) {
    return "lost";
  }
  if (current === "lost") {
    return "lost";
  }
  if (current === "active") {
    return "active";
  }
  return "seed";
}

// ── Write helpers ─────────────────────────────────────────────────────

export async function upsertProjectEstimateLinks(
  rows: Array<{ projectId: number; estimateId: number }>
): Promise<number> {
  let inserted = 0;
  for (const batch of chunk(rows, SQL_BATCH_SIZE)) {
    const valuesSql = batch
      .map((_, index) => {
        const base = index * 3;
        return `($${base + 1}, $${base + 2}, $${base + 3})`;
      })
      .join(", ");
    const args: Array<number | string> = [];
    for (const row of batch) {
      args.push(row.projectId, row.estimateId, PROJECT_LINK_SOURCE);
    }
    const result = await db.run(
      `INSERT INTO project_estimates (project_id, estimate_id, source)
       VALUES ${valuesSql}
       ON CONFLICT (project_id, estimate_id) DO NOTHING`,
      args
    );
    inserted += result.count ?? 0;
  }
  return inserted;
}

export async function applyCanonicalUpdates(
  rows: Array<{ projectId: number; estimateId: number }>
): Promise<void> {
  for (const batch of chunk(rows, SQL_BATCH_SIZE)) {
    const valuesSql = batch
      .map((_, index) => {
        const base = index * 2;
        return `($${base + 1}, $${base + 2})`;
      })
      .join(", ");
    const args: number[] = [];
    for (const row of batch) {
      args.push(row.projectId, row.estimateId);
    }

    await db.run(
      `WITH canonical(project_id, estimate_id) AS (
         VALUES ${valuesSql}
       )
       UPDATE project_estimates pe
       SET is_canonical = FALSE
       FROM canonical
       WHERE pe.project_id = canonical.project_id
         AND pe.is_canonical = TRUE
         AND pe.estimate_id <> canonical.estimate_id`,
      args
    );

    await db.run(
      `WITH canonical(project_id, estimate_id) AS (
         VALUES ${valuesSql}
       )
       UPDATE project_estimates pe
       SET
         is_canonical = TRUE,
         canonicalized_at = CASE
           WHEN pe.is_canonical = TRUE THEN pe.canonicalized_at
           ELSE now()
         END
       FROM canonical
       WHERE pe.project_id = canonical.project_id
         AND pe.estimate_id = canonical.estimate_id
         AND pe.is_canonical IS DISTINCT FROM TRUE`,
      args
    );
  }
}
