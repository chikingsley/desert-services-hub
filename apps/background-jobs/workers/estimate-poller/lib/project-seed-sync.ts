import { db } from "@lib/db/hub";
import { normalizeProjectNameKey } from "@lib/db/repositories/project";
import { parseVariantPrefix } from "@sharepoint/paths";

const ACTIVE_BID_STATUSES = new Set(["won", "pending won", "add to projects"]);
const LOST_BID_STATUSES = new Set(["lost", "duplicates", "gc not awarded"]);
const PROJECT_LINK_SOURCE = "estimate_seed_sync";
const SQL_BATCH_SIZE = 250;

interface EstimateSeedRow {
  id: number;
  name: string;
  job_name: string | null;
  contractor: string | null;
  account_id: number | null;
  location: string | null;
  job_address: string | null;
  bid_status: string | null;
  awarded: number | null;
  updated_at: string;
}

interface ProjectSeedRow {
  id: number;
  lifecycle_state: string | null;
  seed_key: string | null;
  seed_source: string | null;
  name: string;
  normalized_name: string | null;
  address: string | null;
  account_id: number | null;
  contractor: string | null;
}

interface ExistingEstimateProjectLink {
  estimate_id: number;
  project_id: number;
}

interface SeedDescriptor {
  seedKey: string;
  normalizedName: string;
  displayName: string;
  hasLocationKey: boolean;
  addressHint: string | null;
}

interface SeedGroup {
  seedKey: string;
  normalizedName: string;
  hasLocationKey: boolean;
  estimates: EstimateSeedRow[];
  representativeName: string;
  representativeAddress: string | null;
  representativeAccountId: number | null;
  representativeContractor: string | null;
  latestEvidenceAt: string;
  activeSignal: boolean;
  allLostSignal: boolean;
}

export interface ProjectSeedSyncOptions {
  dryRun?: boolean;
  limit?: number;
}

export interface ProjectSeedSyncStats {
  estimatesScanned: number;
  seedGroups: number;
  projectsCreated: number;
  projectsUpdated: number;
  linksInserted: number;
  canonicalized: number;
  promotedToActive: number;
  movedToLost: number;
  linkConflicts: number;
}

export interface ProjectSeedStaleOptions {
  dryRun?: boolean;
  staleDays?: number;
  limit?: number;
}

export interface ProjectSeedStaleStats {
  candidates: number;
  movedToLost: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function normalizeBidStatus(value: string | null | undefined): string | null {
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

function deriveSeedDescriptor(row: EstimateSeedRow): SeedDescriptor | null {
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

function getEstimatePriority(row: EstimateSeedRow): number {
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

function reduceToGroup(seedKey: string, rows: EstimateSeedRow[]): SeedGroup {
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

async function fetchEstimateRows(limit?: number): Promise<EstimateSeedRow[]> {
  if (limit && limit > 0) {
    return await db
      .query<EstimateSeedRow>(
        `SELECT
           id,
           name,
           job_name,
           contractor,
           account_id,
           location,
           job_address,
           bid_status,
           awarded,
           updated_at
         FROM estimates
         WHERE trim(COALESCE(job_name, name, '')) <> ''
         ORDER BY updated_at DESC, id DESC
         LIMIT ?`
      )
      .all(limit);
  }

  return await db
    .query<EstimateSeedRow>(
      `SELECT
         id,
         name,
         job_name,
         contractor,
         account_id,
         location,
         job_address,
         bid_status,
         awarded,
         updated_at
       FROM estimates
       WHERE trim(COALESCE(job_name, name, '')) <> ''
       ORDER BY id ASC`
    )
    .all();
}

async function fetchEstimateProjectLinks(
  estimateIds: number[]
): Promise<ExistingEstimateProjectLink[]> {
  const rows: ExistingEstimateProjectLink[] = [];
  if (estimateIds.length === 0) {
    return rows;
  }

  for (const batch of chunk(estimateIds, SQL_BATCH_SIZE)) {
    const placeholders = batch.map(() => "?").join(", ");
    const batchRows = await db
      .query<ExistingEstimateProjectLink>(
        `SELECT estimate_id, project_id
         FROM project_estimates
         WHERE estimate_id IN (${placeholders})`
      )
      .all(...batch);
    rows.push(...batchRows);
  }

  return rows;
}

async function fetchProjectsByIds(
  projectIds: number[]
): Promise<Map<number, ProjectSeedRow>> {
  const out = new Map<number, ProjectSeedRow>();
  if (projectIds.length === 0) {
    return out;
  }

  for (const batch of chunk(projectIds, SQL_BATCH_SIZE)) {
    const placeholders = batch.map(() => "?").join(", ");
    const rows = await db
      .query<ProjectSeedRow>(
        `SELECT
           id,
           lifecycle_state,
           seed_key,
           seed_source,
           name,
           normalized_name,
           address,
           account_id,
           contractor
         FROM projects
         WHERE id IN (${placeholders})`
      )
      .all(...batch);
    for (const row of rows) {
      out.set(row.id, row);
    }
  }

  return out;
}

async function fetchProjectsBySeedKey(
  seedKeys: string[]
): Promise<Map<string, ProjectSeedRow>> {
  const out = new Map<string, ProjectSeedRow>();
  if (seedKeys.length === 0) {
    return out;
  }

  for (const batch of chunk(seedKeys, SQL_BATCH_SIZE)) {
    const placeholders = batch.map(() => "?").join(", ");
    const rows = await db
      .query<ProjectSeedRow>(
        `SELECT
           id,
           lifecycle_state,
           seed_key,
           seed_source,
           name,
           normalized_name,
           address,
           account_id,
           contractor
         FROM projects
         WHERE seed_key IN (${placeholders})`
      )
      .all(...batch);
    for (const row of rows) {
      if (row.seed_key) {
        out.set(row.seed_key, row);
      }
    }
  }

  return out;
}

async function fetchProjectsByNormalizedName(
  normalizedNames: string[]
): Promise<Map<string, ProjectSeedRow[]>> {
  const out = new Map<string, ProjectSeedRow[]>();
  if (normalizedNames.length === 0) {
    return out;
  }

  for (const batch of chunk(normalizedNames, SQL_BATCH_SIZE)) {
    const placeholders = batch.map(() => "?").join(", ");
    const rows = await db
      .query<ProjectSeedRow>(
        `SELECT
           id,
           lifecycle_state,
           seed_key,
           seed_source,
           name,
           normalized_name,
           address,
           account_id,
           contractor
         FROM projects
         WHERE normalized_name IN (${placeholders})`
      )
      .all(...batch);
    for (const row of rows) {
      const key = row.normalized_name;
      if (!key) {
        continue;
      }
      const arr = out.get(key) ?? [];
      arr.push(row);
      out.set(key, arr);
    }
  }

  return out;
}

function projectStateRank(value: string | null | undefined): number {
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

function chooseLinkedProjectId(
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

function deriveDesiredState(
  currentState: string | null | undefined,
  group: SeedGroup
): "seed" | "active" | "lost" | "archived" {
  const current = (currentState ?? "seed").toLowerCase();
  if (current === "archived") {
    return "archived";
  }
  // Do not auto-promote to active from estimate status alone.
  // Operational "active" is driven by concrete workflow anchors (e.g. folder linkage).
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

async function upsertProjectEstimateLinks(
  rows: Array<{ projectId: number; estimateId: number }>
): Promise<number> {
  let inserted = 0;
  for (const batch of chunk(rows, SQL_BATCH_SIZE)) {
    const valuesSql = batch.map(() => "(?, ?, ?)").join(", ");
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

async function applyCanonicalUpdates(
  rows: Array<{ projectId: number; estimateId: number }>
): Promise<void> {
  for (const batch of chunk(rows, SQL_BATCH_SIZE)) {
    const valuesSql = batch.map(() => "(?, ?)").join(", ");
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

export async function syncProjectSeedsFromEstimates(
  options: ProjectSeedSyncOptions = {}
): Promise<ProjectSeedSyncStats> {
  const dryRun = Boolean(options.dryRun);
  const limit =
    options.limit && options.limit > 0 ? Math.floor(options.limit) : undefined;

  const stats: ProjectSeedSyncStats = {
    estimatesScanned: 0,
    seedGroups: 0,
    projectsCreated: 0,
    projectsUpdated: 0,
    linksInserted: 0,
    canonicalized: 0,
    promotedToActive: 0,
    movedToLost: 0,
    linkConflicts: 0,
  };

  const estimates = await fetchEstimateRows(limit);
  stats.estimatesScanned = estimates.length;
  if (estimates.length === 0) {
    return stats;
  }

  const grouped = new Map<string, EstimateSeedRow[]>();
  for (const row of estimates) {
    const descriptor = deriveSeedDescriptor(row);
    if (!descriptor) {
      continue;
    }
    const bucket = grouped.get(descriptor.seedKey) ?? [];
    bucket.push(row);
    grouped.set(descriptor.seedKey, bucket);
  }

  const seedGroups = [...grouped.entries()].map(([seedKey, rows]) =>
    reduceToGroup(seedKey, rows)
  );
  stats.seedGroups = seedGroups.length;
  if (seedGroups.length === 0) {
    return stats;
  }

  const estimateIds = estimates.map((row) => row.id);
  const seedKeys = seedGroups.map((group) => group.seedKey);
  const normalizedNames = [
    ...new Set(seedGroups.map((group) => group.normalizedName)),
  ];

  const existingLinks = await fetchEstimateProjectLinks(estimateIds);
  const estimateLinkedProjects = new Map<number, Set<number>>();
  const projectLinkedEstimateIds = new Map<number, Set<number>>();
  for (const link of existingLinks) {
    const estimateSet =
      estimateLinkedProjects.get(link.estimate_id) ?? new Set();
    estimateSet.add(link.project_id);
    estimateLinkedProjects.set(link.estimate_id, estimateSet);

    const projectSet =
      projectLinkedEstimateIds.get(link.project_id) ?? new Set<number>();
    projectSet.add(link.estimate_id);
    projectLinkedEstimateIds.set(link.project_id, projectSet);
  }

  const linkedProjectIds = [
    ...new Set(existingLinks.map((row) => row.project_id)),
  ];
  const [projectsById, projectsBySeedKey, projectsByNormalizedName] =
    await Promise.all([
      fetchProjectsByIds(linkedProjectIds),
      fetchProjectsBySeedKey(seedKeys),
      fetchProjectsByNormalizedName(normalizedNames),
    ]);

  for (const row of projectsBySeedKey.values()) {
    projectsById.set(row.id, row);
  }
  for (const rows of projectsByNormalizedName.values()) {
    for (const row of rows) {
      projectsById.set(row.id, row);
    }
  }

  const linkRowsToInsert: Array<{ projectId: number; estimateId: number }> = [];
  const canonicalByProject = new Map<
    number,
    { estimateId: number; priority: number }
  >();

  const run = async () => {
    for (const group of seedGroups) {
      const linkedIds: number[] = [];
      for (const estimate of group.estimates) {
        const set = estimateLinkedProjects.get(estimate.id);
        if (!set) {
          continue;
        }
        linkedIds.push(...set);
      }

      let projectId = chooseLinkedProjectId(linkedIds, group, projectsById);
      if (!projectId) {
        const bySeed = projectsBySeedKey.get(group.seedKey);
        if (bySeed) {
          projectId = bySeed.id;
        }
      }
      if (!(projectId || group.hasLocationKey)) {
        const candidates =
          projectsByNormalizedName
            .get(group.normalizedName)
            ?.filter((project) => project.seed_key === null) ?? [];
        if (candidates.length === 1) {
          projectId = candidates[0]?.id ?? null;
        }
      }

      let project = projectId ? (projectsById.get(projectId) ?? null) : null;

      if (!projectId) {
        stats.projectsCreated++;
        if (dryRun) {
          continue;
        }
        const desiredState = deriveDesiredState("seed", group);
        if (desiredState === "active") {
          stats.promotedToActive++;
        } else if (desiredState === "lost") {
          stats.movedToLost++;
        }
        const inserted = (await db.run(
          `INSERT INTO projects (
             name,
             normalized_name,
             address,
             account_id,
             contractor,
             lifecycle_state,
             seed_key,
             seed_source,
             promoted_at,
             lost_at,
             last_evidence_at,
             updated_at
           )
           VALUES (
             ?, ?, ?, (SELECT id FROM accounts WHERE id = ?), ?, ?, ?, 'estimate_sync',
             CASE WHEN ? = 'active' THEN now() ELSE NULL END,
             CASE WHEN ? = 'lost' THEN now() ELSE NULL END,
             ?::timestamptz,
             now()
           )
           RETURNING
             id,
             lifecycle_state,
             seed_key,
             seed_source,
             name,
             normalized_name,
             address,
             account_id,
             contractor`,
          [
            group.representativeName,
            group.normalizedName,
            group.representativeAddress,
            group.representativeAccountId,
            group.representativeContractor,
            desiredState,
            group.seedKey,
            desiredState,
            desiredState,
            group.latestEvidenceAt,
          ]
        )) as ProjectSeedRow[];

        project = inserted[0] ?? null;
        projectId = project?.id ?? null;
        if (!(projectId && project)) {
          continue;
        }
        projectsById.set(projectId, project);
        projectsBySeedKey.set(group.seedKey, project);
      } else if (project && projectId) {
        stats.projectsUpdated++;
        const desiredState = deriveDesiredState(project.lifecycle_state, group);
        const previous = (project.lifecycle_state ?? "seed").toLowerCase();
        if (desiredState === "active" && previous !== "active") {
          stats.promotedToActive++;
        }
        if (desiredState === "lost" && previous === "seed") {
          stats.movedToLost++;
        }

        if (!dryRun) {
          const updated = (await db.run(
            `UPDATE projects
             SET
               name = CASE
                 WHEN lifecycle_state = 'seed' THEN ?
                 ELSE name
               END,
               normalized_name = COALESCE(normalized_name, ?),
               address = COALESCE(address, ?),
               account_id = CASE
                 WHEN account_id IS NOT NULL
                   AND EXISTS (
                     SELECT 1
                     FROM accounts
                     WHERE accounts.id = projects.account_id
                   )
                   THEN account_id
                 WHEN ?::int IS NOT NULL
                   AND EXISTS (
                     SELECT 1
                     FROM accounts
                     WHERE accounts.id = ?::int
                   )
                   THEN ?::int
                 ELSE NULL
               END,
               contractor = COALESCE(contractor, ?),
               seed_key = CASE
                 WHEN seed_key IS NULL THEN ?
                 ELSE seed_key
               END,
               seed_source = COALESCE(seed_source, 'estimate_sync'),
               lifecycle_state = ?,
               promoted_at = CASE
                 WHEN ? = 'active' THEN COALESCE(promoted_at, now())
                 ELSE promoted_at
               END,
               lost_at = CASE
                 WHEN ? = 'active' THEN NULL
                 WHEN ? = 'lost' THEN COALESCE(lost_at, now())
                 ELSE lost_at
               END,
               last_evidence_at = GREATEST(
                 COALESCE(last_evidence_at, '-infinity'::timestamptz),
                 ?::timestamptz
               ),
               updated_at = now()
             WHERE id = ?
             RETURNING
               id,
               lifecycle_state,
               seed_key,
               seed_source,
               name,
               normalized_name,
               address,
               account_id,
               contractor`,
            [
              group.representativeName,
              group.normalizedName,
              group.representativeAddress,
              group.representativeAccountId,
              group.representativeAccountId,
              group.representativeAccountId,
              group.representativeContractor,
              group.seedKey,
              desiredState,
              desiredState,
              desiredState,
              desiredState,
              group.latestEvidenceAt,
              projectId,
            ]
          )) as ProjectSeedRow[];
          const next = updated[0];
          if (next) {
            project = next;
            projectsById.set(project.id, next);
            if (next.seed_key) {
              projectsBySeedKey.set(next.seed_key, next);
            }
          }
        }
      }

      if (!projectId) {
        continue;
      }

      for (const estimate of group.estimates) {
        const linked =
          estimateLinkedProjects.get(estimate.id) ?? new Set<number>();
        if (linked.size > 0 && !linked.has(projectId)) {
          stats.linkConflicts++;
          continue;
        }

        if (!linked.has(projectId)) {
          linked.add(projectId);
          estimateLinkedProjects.set(estimate.id, linked);
          const perProject =
            projectLinkedEstimateIds.get(projectId) ?? new Set<number>();
          perProject.add(estimate.id);
          projectLinkedEstimateIds.set(projectId, perProject);
          linkRowsToInsert.push({ projectId, estimateId: estimate.id });
        }
      }

      const projectEstimateIds = projectLinkedEstimateIds.get(projectId);
      if (!projectEstimateIds || projectEstimateIds.size === 0) {
        continue;
      }

      const rankedLinked = group.estimates
        .filter((estimate) => projectEstimateIds.has(estimate.id))
        .map((estimate) => ({
          estimateId: estimate.id,
          priority: getEstimatePriority(estimate),
        }))
        .sort((lhs, rhs) => rhs.priority - lhs.priority);
      const top = rankedLinked[0];
      if (!top) {
        continue;
      }

      const currentCanonical = canonicalByProject.get(projectId);
      if (!currentCanonical || top.priority > currentCanonical.priority) {
        canonicalByProject.set(projectId, top);
      }
    }

    if (!dryRun && linkRowsToInsert.length > 0) {
      stats.linksInserted = await upsertProjectEstimateLinks(linkRowsToInsert);
    } else {
      stats.linksInserted = linkRowsToInsert.length;
    }

    const canonicalRows = [...canonicalByProject.entries()].map(
      ([projectId, value]) => ({
        projectId,
        estimateId: value.estimateId,
      })
    );

    if (!dryRun && canonicalRows.length > 0) {
      await applyCanonicalUpdates(canonicalRows);
    }
    stats.canonicalized = canonicalRows.length;
  };

  if (dryRun) {
    await run();
    return stats;
  }

  await db.transaction(run);
  return stats;
}

export async function markStaleProjectSeeds(
  options: ProjectSeedStaleOptions = {}
): Promise<ProjectSeedStaleStats> {
  const staleDays = Math.max(1, Math.floor(options.staleDays ?? 45));
  const limit = Math.max(1, Math.floor(options.limit ?? 1000));
  const dryRun = Boolean(options.dryRun);

  const candidates = (await db
    .query<{ id: number }>(
      `SELECT p.id
       FROM projects p
       WHERE p.lifecycle_state = 'seed'
         AND COALESCE(p.last_evidence_at, p.updated_at, p.created_at) <
             now() - (?::text || ' days')::interval
         AND NOT EXISTS (
           SELECT 1
           FROM project_estimates pe
           JOIN estimates e ON e.id = pe.estimate_id
           WHERE pe.project_id = p.id
             AND (
               COALESCE(e.awarded, 0) = 1
               OR lower(COALESCE(e.bid_status, '')) IN ('won', 'pending won', 'add to projects')
             )
         )
       ORDER BY COALESCE(p.last_evidence_at, p.updated_at, p.created_at) ASC
       LIMIT ?`
    )
    .all(String(staleDays), limit)) as Array<{ id: number }>;

  if (dryRun) {
    return { candidates: candidates.length, movedToLost: 0 };
  }

  if (candidates.length === 0) {
    return { candidates: 0, movedToLost: 0 };
  }

  const ids = candidates.map((row) => row.id);
  let moved = 0;
  for (const batch of chunk(ids, SQL_BATCH_SIZE)) {
    const placeholders = batch.map(() => "?").join(", ");
    const rows = (await db.run(
      `UPDATE projects
       SET lifecycle_state = 'lost',
           lost_at = COALESCE(lost_at, now()),
           updated_at = now()
       WHERE id IN (${placeholders})
         AND lifecycle_state = 'seed'
       RETURNING id`,
      batch
    )) as Array<{ id: number }>;
    moved += rows.length;
  }

  return { candidates: candidates.length, movedToLost: moved };
}
