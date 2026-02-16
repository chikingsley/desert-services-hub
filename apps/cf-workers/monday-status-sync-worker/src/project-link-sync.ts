/**
 * Project Link Sync Job
 *
 * Enforces bidirectional Estimate↔Project and Lead→Project linkage,
 * plus project number propagation when columns are configured.
 */

import { getLeadsWithEstimates } from "./leads-sync";
import {
  ESTIMATING_BOARD_ID,
  getItemsColumnValues,
  LEADS_BOARD_ID,
  updateBoardRelation,
  updateTextColumn,
} from "./monday-api";
import type {
  Env,
  EstimateSnapshot,
  LeadWithEstimate,
  ProjectLinkSyncConfig,
  ProjectLinkSyncResult,
  ProjectSnapshot,
} from "./types";
import {
  appendUniqueId,
  getProjectLinkSyncConfig,
  normalizeProjectNumber,
  sleep,
} from "./utils";

// =============================================================================
// Main Job
// =============================================================================

export async function runProjectLinkSync(
  env: Env,
  dryRun = false
): Promise<ProjectLinkSyncResult> {
  const config = getProjectLinkSyncConfig(env);
  const result: ProjectLinkSyncResult = {
    enabled: config.enabled,
    leadsCount: 0,
    linkedLeads: 0,
    linkedEstimates: 0,
    linkedProjects: 0,
    projectNumbersUpdated: 0,
    skippedCount: 0,
    errors: [],
  };

  if (!config.enabled) {
    return result;
  }

  try {
    console.log("[Project Link Sync] Fetching leads...");
    const leads = await getLeadsWithEstimates(env, {
      leadProjectLinkCol: config.leadProjectLinkCol,
      leadProjectNumberCol: config.leadProjectNumberCol,
    });
    result.leadsCount = leads.length;
    console.log(
      `[Project Link Sync] Found ${leads.length} leads with linked estimates`
    );

    const estimateIds = [...new Set(leads.map((lead) => lead.estimateId))];
    if (estimateIds.length === 0) {
      return result;
    }

    const estimateSnapshots = await getEstimateSnapshots(
      env,
      estimateIds,
      config
    );
    const projectSnapshots = await getInitialProjectSnapshots(
      env,
      leads,
      estimateSnapshots,
      config
    );

    for (const lead of leads) {
      try {
        await syncLeadLinks(
          env,
          lead,
          estimateSnapshots,
          projectSnapshots,
          config,
          result,
          dryRun
        );
      } catch (error) {
        const message = `Failed to process lead ${lead.name}: ${error}`;
        result.errors.push(message);
        console.error(`[Project Link Sync] ${message}`);
      }
    }

    return result;
  } catch (error) {
    result.errors.push(`Project link sync failed: ${error}`);
    console.error(`[Project Link Sync] ${error}`);
    return result;
  }
}

// =============================================================================
// Per-Lead Sync
// =============================================================================

async function syncLeadLinks(
  env: Env,
  lead: LeadWithEstimate,
  estimateSnapshots: Map<string, EstimateSnapshot>,
  projectSnapshots: Map<string, ProjectSnapshot>,
  config: ProjectLinkSyncConfig,
  result: ProjectLinkSyncResult,
  dryRun: boolean
): Promise<void> {
  const estimate = estimateSnapshots.get(lead.estimateId);
  if (!estimate) {
    result.skippedCount++;
    return;
  }

  const canonicalProjectId =
    estimate.linkedProjectIds[0] ?? lead.linkedProjectIds[0] ?? null;

  if (!canonicalProjectId) {
    result.skippedCount++;
    return;
  }

  let changed = false;

  // Ensure Estimate → Project relation
  changed =
    (await ensureRelation(env, {
      boardId: ESTIMATING_BOARD_ID,
      itemId: estimate.id,
      columnId: config.estimateProjectLinkCol,
      currentIds: estimate.linkedProjectIds,
      targetId: canonicalProjectId,
      label: `estimate ${estimate.id} -> project ${canonicalProjectId}`,
      dryRun,
    })) || changed;
  if (changed) {
    estimate.linkedProjectIds = appendUniqueId(
      estimate.linkedProjectIds,
      canonicalProjectId
    );
    result.linkedEstimates++;
  }

  // Ensure Lead → Project relation (when configured)
  if (config.leadProjectLinkCol) {
    const linked = await ensureRelation(env, {
      boardId: LEADS_BOARD_ID,
      itemId: lead.id,
      columnId: config.leadProjectLinkCol,
      currentIds: lead.linkedProjectIds,
      targetId: canonicalProjectId,
      label: `lead ${lead.id} -> project ${canonicalProjectId}`,
      dryRun,
    });
    if (linked) {
      lead.linkedProjectIds = appendUniqueId(
        lead.linkedProjectIds,
        canonicalProjectId
      );
      result.linkedLeads++;
      changed = true;
    }
  }

  // Ensure Project → Estimate relation
  const project = await resolveProject(
    env,
    canonicalProjectId,
    projectSnapshots,
    config
  );
  if (project) {
    const linked = await ensureRelation(env, {
      boardId: config.projectsBoardId,
      itemId: project.id,
      columnId: config.projectEstimateLinkCol,
      currentIds: project.linkedEstimateIds,
      targetId: estimate.id,
      label: `project ${project.id} -> estimate ${estimate.id}`,
      dryRun,
    });
    if (linked) {
      project.linkedEstimateIds = appendUniqueId(
        project.linkedEstimateIds,
        estimate.id
      );
      result.linkedProjects++;
      changed = true;
    }
  }

  // Propagate canonical project number
  const numberUpdates = await propagateProjectNumber(
    env,
    { lead, estimate, project },
    config,
    dryRun
  );
  if (numberUpdates > 0) {
    result.projectNumbersUpdated += numberUpdates;
    changed = true;
  }

  if (!changed) {
    result.skippedCount++;
  }
}

// =============================================================================
// Relation Enforcement
// =============================================================================

interface EnsureRelationParams {
  boardId: string;
  itemId: string;
  columnId: string;
  currentIds: string[];
  targetId: string;
  label: string;
  dryRun: boolean;
}

/**
 * Ensure a board relation includes the target ID.
 * Returns true if the relation was updated (or would be in dry-run).
 */
async function ensureRelation(
  env: Env,
  params: EnsureRelationParams
): Promise<boolean> {
  if (params.currentIds.includes(params.targetId)) {
    return false;
  }

  const nextIds = appendUniqueId(params.currentIds, params.targetId);

  if (params.dryRun) {
    console.log(`[Project Link Sync] Would link ${params.label}`);
    return true;
  }

  await updateBoardRelation(
    env,
    params.boardId,
    params.itemId,
    params.columnId,
    nextIds
  );
  await sleep(200);
  return true;
}

// =============================================================================
// Project Number Propagation
// =============================================================================

interface PropagationContext {
  lead: LeadWithEstimate;
  estimate: EstimateSnapshot;
  project: ProjectSnapshot | undefined;
}

/**
 * Propagate the canonical project number to project, estimate, and lead
 * when their current values differ. Returns count of updates made.
 */
async function propagateProjectNumber(
  env: Env,
  ctx: PropagationContext,
  config: ProjectLinkSyncConfig,
  dryRun: boolean
): Promise<number> {
  const canonicalNumber = normalizeProjectNumber(
    ctx.project?.projectNumber ??
      ctx.estimate.projectNumber ??
      ctx.lead.projectNumber
  );

  if (!canonicalNumber) {
    return 0;
  }

  let updates = 0;

  // Update project
  if (
    config.projectProjectNumberCol &&
    ctx.project &&
    normalizeProjectNumber(ctx.project.projectNumber) !== canonicalNumber
  ) {
    await setProjectNumber(
      env,
      config.projectsBoardId,
      ctx.project.id,
      config.projectProjectNumberCol,
      canonicalNumber,
      "project",
      dryRun
    );
    ctx.project.projectNumber = canonicalNumber;
    updates++;
  }

  // Update estimate
  if (
    config.estimateProjectNumberCol &&
    normalizeProjectNumber(ctx.estimate.projectNumber) !== canonicalNumber
  ) {
    await setProjectNumber(
      env,
      ESTIMATING_BOARD_ID,
      ctx.estimate.id,
      config.estimateProjectNumberCol,
      canonicalNumber,
      "estimate",
      dryRun
    );
    ctx.estimate.projectNumber = canonicalNumber;
    updates++;
  }

  // Update lead
  if (
    config.leadProjectNumberCol &&
    normalizeProjectNumber(ctx.lead.projectNumber) !== canonicalNumber
  ) {
    await setProjectNumber(
      env,
      LEADS_BOARD_ID,
      ctx.lead.id,
      config.leadProjectNumberCol,
      canonicalNumber,
      "lead",
      dryRun
    );
    ctx.lead.projectNumber = canonicalNumber;
    updates++;
  }

  return updates;
}

async function setProjectNumber(
  env: Env,
  boardId: string,
  itemId: string,
  columnId: string,
  value: string,
  entityType: string,
  dryRun: boolean
): Promise<void> {
  if (dryRun) {
    console.log(
      `[Project Link Sync] Would set ${entityType} ${itemId} number -> ${value}`
    );
    return;
  }
  await updateTextColumn(env, boardId, itemId, columnId, value);
  await sleep(200);
}

// =============================================================================
// Snapshot Fetchers
// =============================================================================

async function getEstimateSnapshots(
  env: Env,
  estimateIds: string[],
  config: ProjectLinkSyncConfig
): Promise<Map<string, EstimateSnapshot>> {
  const columnIds = [
    config.estimateProjectLinkCol,
    config.estimateProjectNumberCol,
  ].filter((columnId): columnId is string => Boolean(columnId));

  const items = await getItemsColumnValues(env, estimateIds, columnIds);
  const snapshots = new Map<string, EstimateSnapshot>();

  for (const item of items) {
    const projectLinkCol = item.column_values.find(
      (cv) => cv.id === config.estimateProjectLinkCol
    );
    const projectNumberCol = config.estimateProjectNumberCol
      ? item.column_values.find(
          (cv) => cv.id === config.estimateProjectNumberCol
        )
      : undefined;

    snapshots.set(item.id, {
      id: item.id,
      linkedProjectIds: projectLinkCol?.linked_item_ids ?? [],
      projectNumber: normalizeProjectNumber(projectNumberCol?.text ?? null),
    });
  }

  return snapshots;
}

async function getProjectSnapshots(
  env: Env,
  projectIds: string[],
  config: ProjectLinkSyncConfig
): Promise<Map<string, ProjectSnapshot>> {
  const snapshots = new Map<string, ProjectSnapshot>();
  if (projectIds.length === 0) {
    return snapshots;
  }

  const columnIds = [
    config.projectEstimateLinkCol,
    config.projectProjectNumberCol,
  ].filter((columnId): columnId is string => Boolean(columnId));

  const items = await getItemsColumnValues(env, projectIds, columnIds);

  for (const item of items) {
    const estimateLinkCol = item.column_values.find(
      (cv) => cv.id === config.projectEstimateLinkCol
    );
    const projectNumberCol = config.projectProjectNumberCol
      ? item.column_values.find(
          (cv) => cv.id === config.projectProjectNumberCol
        )
      : undefined;

    snapshots.set(item.id, {
      id: item.id,
      linkedEstimateIds: estimateLinkCol?.linked_item_ids ?? [],
      projectNumber: normalizeProjectNumber(projectNumberCol?.text ?? null),
    });
  }

  return snapshots;
}

/**
 * Build initial project snapshots from all project IDs referenced
 * by estimates and leads.
 */
function getInitialProjectSnapshots(
  env: Env,
  leads: LeadWithEstimate[],
  estimateSnapshots: Map<string, EstimateSnapshot>,
  config: ProjectLinkSyncConfig
): Promise<Map<string, ProjectSnapshot>> {
  const projectIds = new Set<string>();
  for (const estimate of estimateSnapshots.values()) {
    for (const projectId of estimate.linkedProjectIds) {
      projectIds.add(projectId);
    }
  }
  for (const lead of leads) {
    for (const projectId of lead.linkedProjectIds) {
      projectIds.add(projectId);
    }
  }

  return getProjectSnapshots(env, [...projectIds], config);
}

/**
 * Resolve a project snapshot, fetching on demand if not in the cache.
 */
async function resolveProject(
  env: Env,
  projectId: string,
  projectSnapshots: Map<string, ProjectSnapshot>,
  config: ProjectLinkSyncConfig
): Promise<ProjectSnapshot | undefined> {
  const existing = projectSnapshots.get(projectId);
  if (existing) {
    return existing;
  }

  // Lazy-fetch projects not in initial snapshot
  const fallback = await getProjectSnapshots(env, [projectId], config);
  const project = fallback.get(projectId);
  if (project) {
    projectSnapshots.set(projectId, project);
  }
  return project;
}
