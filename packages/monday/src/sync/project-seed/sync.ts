import { db } from "@lib/db/client";
import {
  applyCanonicalUpdates,
  chooseLinkedProjectId,
  deriveDesiredState,
  deriveSeedDescriptor,
  type EstimateSeedRow,
  fetchEstimateProjectLinks,
  fetchEstimateRows,
  fetchProjectsByIds,
  fetchProjectsByNormalizedName,
  fetchProjectsBySeedKey,
  getEstimatePriority,
  type ProjectSeedRow,
  reduceToGroup,
  type SeedGroup,
  SQL_BATCH_SIZE,
  upsertProjectEstimateLinks,
} from "./data";
import { chunk } from "./sql-utils";

// ── Exported option/stat types ────────────────────────────────────────

export interface ProjectSeedSyncOptions {
  dryRun?: boolean;
  limit?: number;
}

export interface ProjectSeedSyncStats {
  canonicalized: number;
  estimatesScanned: number;
  linkConflicts: number;
  linksInserted: number;
  movedToLost: number;
  projectsCreated: number;
  projectsUpdated: number;
  promotedToActive: number;
  seedGroups: number;
}

export interface ProjectSeedStaleOptions {
  dryRun?: boolean;
  limit?: number;
  staleDays?: number;
}

export interface ProjectSeedStaleStats {
  candidates: number;
  movedToLost: number;
}

// ── Mutable state for the sync transaction ────────────────────────────

interface SeedSyncState {
  canonicalByProject: Map<number, { estimateId: number; priority: number }>;
  dryRun: boolean;
  estimateLinkedProjects: Map<number, Set<number>>;
  linkRowsToInsert: Array<{ projectId: number; estimateId: number }>;
  projectLinkedEstimateIds: Map<number, Set<number>>;
  projectsById: Map<number, ProjectSeedRow>;
  projectsByNormalizedName: Map<string, ProjectSeedRow[]>;
  projectsBySeedKey: Map<string, ProjectSeedRow>;
  stats: ProjectSeedSyncStats;
}

// ── Per-group sub-functions ───────────────────────────────────────────

function findProjectForGroup(
  group: SeedGroup,
  state: SeedSyncState
): number | null {
  const linkedIds: number[] = [];
  for (const estimate of group.estimates) {
    const set = state.estimateLinkedProjects.get(estimate.id);
    if (!set) {
      continue;
    }
    linkedIds.push(...set);
  }

  let projectId = chooseLinkedProjectId(linkedIds, group, state.projectsById);

  if (!projectId) {
    const bySeed = state.projectsBySeedKey.get(group.seedKey);
    if (bySeed) {
      projectId = bySeed.id;
    }
  }

  if (!(projectId || group.hasLocationKey)) {
    const candidates =
      state.projectsByNormalizedName
        .get(group.normalizedName)
        ?.filter((project) => project.seed_key === null) ?? [];
    if (candidates.length === 1) {
      projectId = candidates[0]?.id ?? null;
    }
  }

  return projectId;
}

async function createProjectForGroup(
  group: SeedGroup,
  state: SeedSyncState
): Promise<{ projectId: number; project: ProjectSeedRow } | null> {
  state.stats.projectsCreated++;
  if (state.dryRun) {
    return null;
  }

  const desiredState = deriveDesiredState("seed", group);
  if (desiredState === "active") {
    state.stats.promotedToActive++;
  } else if (desiredState === "lost") {
    state.stats.movedToLost++;
  }

  const inserted = (await db.run(
    `INSERT INTO projects (
       name, normalized_name, address,
       account_id, contractor, lifecycle_state,
       seed_key, seed_source,
       promoted_at, lost_at,
       last_evidence_at, updated_at
     )
     VALUES (
       $1, $2, $3,
       (SELECT id FROM accounts WHERE id = $4), $5, $6,
       $7, 'estimate_sync',
       CASE WHEN $8 = 'active' THEN now() ELSE NULL END,
       CASE WHEN $9 = 'lost' THEN now() ELSE NULL END,
       $10::timestamptz, now()
     )
     RETURNING
       id, lifecycle_state, seed_key, seed_source,
       name, normalized_name, address, account_id, contractor`,
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

  const project = inserted[0] ?? null;
  const projectId = project?.id ?? null;
  if (!(projectId && project)) {
    return null;
  }

  state.projectsById.set(projectId, project);
  state.projectsBySeedKey.set(group.seedKey, project);
  return { projectId, project };
}

async function updateProjectForGroup(
  projectId: number,
  project: ProjectSeedRow,
  group: SeedGroup,
  state: SeedSyncState
): Promise<void> {
  state.stats.projectsUpdated++;
  const desiredState = deriveDesiredState(project.lifecycle_state, group);
  const previous = (project.lifecycle_state ?? "seed").toLowerCase();

  if (desiredState === "active" && previous !== "active") {
    state.stats.promotedToActive++;
  }
  if (desiredState === "lost" && previous === "seed") {
    state.stats.movedToLost++;
  }

  if (state.dryRun) {
    return;
  }

  const updated = (await db.run(
    `UPDATE projects
     SET
       name = CASE
         WHEN lifecycle_state = 'seed' THEN $1
         ELSE name
       END,
       normalized_name = COALESCE(normalized_name, $2),
       address = COALESCE(address, $3),
       account_id = CASE
         WHEN account_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM accounts WHERE accounts.id = projects.account_id
           )
           THEN account_id
         WHEN $4::int IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM accounts WHERE accounts.id = $5::int
           )
           THEN $6::int
         ELSE NULL
       END,
       contractor = COALESCE($7, contractor),
       seed_key = CASE
         WHEN seed_key IS NULL THEN $8
         ELSE seed_key
       END,
       seed_source = COALESCE(seed_source, 'estimate_sync'),
       lifecycle_state = $9,
       promoted_at = CASE
         WHEN $10 = 'active' THEN COALESCE(promoted_at, now())
         ELSE promoted_at
       END,
       lost_at = CASE
         WHEN $11 = 'active' THEN NULL
         WHEN $12 = 'lost' THEN COALESCE(lost_at, now())
         ELSE lost_at
       END,
       last_evidence_at = GREATEST(
         COALESCE(last_evidence_at, '-infinity'::timestamptz),
         $13::timestamptz
       ),
       updated_at = now()
     WHERE id = $14
     RETURNING
       id, lifecycle_state, seed_key, seed_source,
       name, normalized_name, address, account_id, contractor`,
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
    state.projectsById.set(next.id, next);
    if (next.seed_key) {
      state.projectsBySeedKey.set(next.seed_key, next);
    }
  }
}

function linkGroupEstimates(
  group: SeedGroup,
  projectId: number,
  state: SeedSyncState
): void {
  for (const estimate of group.estimates) {
    const linked =
      state.estimateLinkedProjects.get(estimate.id) ?? new Set<number>();
    if (linked.size > 0 && !linked.has(projectId)) {
      state.stats.linkConflicts++;
      continue;
    }

    if (!linked.has(projectId)) {
      linked.add(projectId);
      state.estimateLinkedProjects.set(estimate.id, linked);
      const perProject =
        state.projectLinkedEstimateIds.get(projectId) ?? new Set<number>();
      perProject.add(estimate.id);
      state.projectLinkedEstimateIds.set(projectId, perProject);
      state.linkRowsToInsert.push({ projectId, estimateId: estimate.id });
    }
  }

  const projectEstimateIds = state.projectLinkedEstimateIds.get(projectId);
  if (!projectEstimateIds || projectEstimateIds.size === 0) {
    return;
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
    return;
  }

  const currentCanonical = state.canonicalByProject.get(projectId);
  if (!currentCanonical || top.priority > currentCanonical.priority) {
    state.canonicalByProject.set(projectId, top);
  }
}

// ── Group orchestration ───────────────────────────────────────────────

async function resolveOrCreateProject(
  group: SeedGroup,
  state: SeedSyncState
): Promise<number | null> {
  const existingId = findProjectForGroup(group, state);

  if (!existingId) {
    const created = await createProjectForGroup(group, state);
    return created?.projectId ?? null;
  }

  const project = state.projectsById.get(existingId);
  if (project) {
    await updateProjectForGroup(existingId, project, group, state);
  }
  return existingId;
}

async function finalizeLinks(state: SeedSyncState): Promise<void> {
  if (!state.dryRun && state.linkRowsToInsert.length > 0) {
    state.stats.linksInserted = await upsertProjectEstimateLinks(
      state.linkRowsToInsert
    );
  } else {
    state.stats.linksInserted = state.linkRowsToInsert.length;
  }

  const canonicalRows = [...state.canonicalByProject.entries()].map(
    ([pid, value]) => ({
      projectId: pid,
      estimateId: value.estimateId,
    })
  );

  if (!state.dryRun && canonicalRows.length > 0) {
    await applyCanonicalUpdates(canonicalRows);
  }
  state.stats.canonicalized = canonicalRows.length;
}

// ── Main sync orchestrator ────────────────────────────────────────────

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

  const state: SeedSyncState = {
    stats,
    dryRun,
    estimateLinkedProjects,
    projectLinkedEstimateIds,
    projectsById,
    projectsBySeedKey,
    projectsByNormalizedName,
    linkRowsToInsert: [],
    canonicalByProject: new Map(),
  };

  const run = async () => {
    for (const group of seedGroups) {
      const projectId = await resolveOrCreateProject(group, state);
      if (projectId) {
        linkGroupEstimates(group, projectId, state);
      }
    }
    await finalizeLinks(state);
  };

  if (dryRun) {
    await run();
    return stats;
  }

  await db.transaction(run);
  return stats;
}

// ── Stale seed cleanup ────────────────────────────────────────────────

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
             now() - ($1::text || ' days')::interval
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
       LIMIT $2`
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
    const placeholders = batch.map((_, index) => `$${index + 1}`).join(", ");
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
