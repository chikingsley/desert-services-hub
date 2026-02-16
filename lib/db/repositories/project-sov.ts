import { createHash } from "node:crypto";
import { db } from "@lib/db/hub";
import { linkEstimateToProject } from "@lib/db/repositories/project-estimate";

interface EstimateHeaderRow {
  id: number;
  name: string;
  job_name: string | null;
  estimate_number: string | null;
  base_number: string | null;
  contractor: string | null;
  location: string | null;
  job_address: string | null;
  client_name: string | null;
  client_address: string | null;
  client_email: string | null;
  client_phone: string | null;
  estimator: string | null;
  estimator_email: string | null;
  notes: string | null;
  bid_status: string | null;
  status: string | null;
}

interface EstimateVersionStateRow {
  id: string;
  estimate_id: string;
  total: number;
}

interface EstimateSectionStateRow {
  id: string;
  name: string;
  title: string | null;
  show_subtotal: number;
  sort_order: number;
}

interface EstimateLineItemStateRow {
  id: string;
  section_id: string | null;
  item_name: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  is_excluded: number;
  notes: string | null;
  sort_order: number;
}

export interface ProjectSovEstimateBlock {
  estimate_id: number;
  estimate_version_id: string | null;
  base_number: string | null;
  job_name: string;
  job_address: string | null;
  client_name: string | null;
  client_address: string | null;
  client_email: string | null;
  client_phone: string | null;
  estimator: string | null;
  estimator_email: string | null;
  notes: string | null;
  status: string | null;
  version_total: number;
  computed_total: number;
}

export interface ProjectSovSection {
  id: string;
  name: string;
  title: string | null;
  show_subtotal: boolean;
  sort_order: number;
}

export interface ProjectSovLineItem {
  id: string;
  section_id: string | null;
  item_name: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  is_excluded: boolean;
  notes: string | null;
  sort_order: number;
}

export interface ProjectSovSnapshot {
  estimate: ProjectSovEstimateBlock;
  sections: ProjectSovSection[];
  line_items: ProjectSovLineItem[];
}

export interface PublishProjectSovOptions {
  projectId: number;
  estimateId: number;
  estimateVersionId?: string | null;
  sourceType?: string;
  updatedBy?: string | null;
}

export interface PublishProjectSovResult {
  projectId: number;
  estimateId: number;
  estimateVersionId: string | null;
  hash: string;
  deduplicated: boolean;
  revisionCreated: boolean;
  updatedAt: string;
  snapshot: ProjectSovSnapshot;
}

export interface ProjectFinalSovRecord {
  projectId: number;
  sourceEstimateId: number | null;
  sourceEstimateVersionId: string | null;
  sourceType: string;
  hash: string;
  updatedBy: string | null;
  updatedAt: string;
  snapshot: ProjectSovSnapshot;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).toSorted(
    ([a], [b]) => a.localeCompare(b)
  );

  return `{${entries
    .map(
      ([key, entryValue]) =>
        `${JSON.stringify(key)}:${stableStringify(entryValue)}`
    )
    .join(",")}}`;
}

function buildSnapshotHashInput(snapshot: ProjectSovSnapshot): {
  estimate: Omit<
    ProjectSovEstimateBlock,
    "estimate_id" | "estimate_version_id" | "base_number"
  >;
  sections: {
    name: string;
    title: string | null;
    show_subtotal: boolean;
    sort_order: number;
  }[];
  line_items: {
    section_name: string | null;
    section_sort_order: number | null;
    item_name: string | null;
    description: string;
    quantity: number;
    unit: string;
    unit_price: number;
    is_excluded: boolean;
    notes: string | null;
    sort_order: number;
  }[];
} {
  const sectionLookup = new Map<string, { name: string; sort_order: number }>();
  for (const section of snapshot.sections) {
    sectionLookup.set(section.id, {
      name: section.name,
      sort_order: section.sort_order,
    });
  }

  return {
    estimate: {
      job_name: snapshot.estimate.job_name,
      job_address: snapshot.estimate.job_address,
      client_name: snapshot.estimate.client_name,
      client_address: snapshot.estimate.client_address,
      client_email: snapshot.estimate.client_email,
      client_phone: snapshot.estimate.client_phone,
      estimator: snapshot.estimate.estimator,
      estimator_email: snapshot.estimate.estimator_email,
      notes: snapshot.estimate.notes,
      status: snapshot.estimate.status,
      version_total: snapshot.estimate.version_total,
      computed_total: snapshot.estimate.computed_total,
    },
    line_items: snapshot.line_items.map((item) => {
      const section = item.section_id
        ? sectionLookup.get(item.section_id)
        : undefined;

      return {
        section_name: section?.name ?? null,
        section_sort_order: section?.sort_order ?? null,
        item_name: item.item_name,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        is_excluded: item.is_excluded,
        notes: item.notes,
        sort_order: item.sort_order,
      };
    }),
    sections: snapshot.sections.map((section) => ({
      name: section.name,
      title: section.title,
      show_subtotal: section.show_subtotal,
      sort_order: section.sort_order,
    })),
  };
}

function computeSnapshotHash(snapshot: ProjectSovSnapshot): string {
  const hashInput = buildSnapshotHashInput(snapshot);
  const serialized = stableStringify(hashInput);
  return createHash("sha256").update(serialized).digest("hex");
}

function parseSnapshot(raw: unknown): ProjectSovSnapshot | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parseSnapshot(parsed);
    } catch {
      return null;
    }
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const obj = raw as Record<string, unknown>;
  const { estimate } = obj;
  const { sections } = obj;
  const lineItems = obj.line_items;

  if (!(estimate && typeof estimate === "object" && !Array.isArray(estimate))) {
    return null;
  }
  if (!(Array.isArray(sections) && Array.isArray(lineItems))) {
    return null;
  }

  return obj as unknown as ProjectSovSnapshot;
}

async function getPreferredVersion(
  estimateId: number,
  estimateVersionId?: string | null
): Promise<EstimateVersionStateRow | null> {
  if (estimateVersionId) {
    return (
      ((await db
        .prepare(
          `SELECT id, estimate_id, total
           FROM estimate_versions
           WHERE id = ? AND estimate_id = ?
           LIMIT 1`
        )
        .get(estimateVersionId, estimateId)) as
        | EstimateVersionStateRow
        | undefined) ?? null
    );
  }

  return (
    ((await db
      .prepare(
        `SELECT id, estimate_id, total
         FROM estimate_versions
         WHERE estimate_id = ?
         ORDER BY is_current DESC, version_number DESC, created_at DESC
         LIMIT 1`
      )
      .get(estimateId)) as EstimateVersionStateRow | undefined) ?? null
  );
}

async function buildSnapshotFromEstimate(options: {
  estimateId: number;
  estimateVersionId?: string | null;
}): Promise<ProjectSovSnapshot | null> {
  const estimate = (await db
    .prepare(
      `SELECT
         id,
         name,
         job_name,
         estimate_number,
         base_number,
         contractor,
         location,
         job_address,
         client_name,
         client_address,
         client_email,
         client_phone,
         estimator,
         estimator_email,
         notes,
         bid_status,
         status
       FROM estimates
       WHERE id = ?`
    )
    .get(options.estimateId)) as EstimateHeaderRow | undefined;

  if (!estimate) {
    return null;
  }

  const version = await getPreferredVersion(
    options.estimateId,
    options.estimateVersionId
  );

  const versionId = version?.id ?? null;

  const sections = versionId
    ? ((await db
        .prepare(
          `SELECT id, name, title, show_subtotal, sort_order
           FROM estimate_sections
           WHERE version_id = ?
           ORDER BY sort_order`
        )
        .all(versionId)) as EstimateSectionStateRow[])
    : [];

  const lineItems = versionId
    ? ((await db
        .prepare(
          `SELECT
             id,
             section_id,
             item_name,
             description,
             quantity,
             unit,
             unit_price,
             is_excluded,
             notes,
             sort_order
           FROM estimate_line_items
           WHERE version_id = ?
           ORDER BY sort_order`
        )
        .all(versionId)) as EstimateLineItemStateRow[])
    : [];

  const computedTotal = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );

  const snapshot: ProjectSovSnapshot = {
    estimate: {
      estimate_id: estimate.id,
      estimate_version_id: versionId,
      base_number: estimate.base_number ?? estimate.estimate_number,
      job_name: estimate.job_name ?? estimate.name,
      job_address: estimate.job_address ?? estimate.location,
      client_name: estimate.client_name ?? estimate.contractor,
      client_address: estimate.client_address ?? estimate.location,
      client_email: estimate.client_email,
      client_phone: estimate.client_phone,
      estimator: estimate.estimator,
      estimator_email: estimate.estimator_email,
      notes: estimate.notes,
      status: estimate.status ?? estimate.bid_status,
      version_total: version?.total ?? computedTotal,
      computed_total: computedTotal,
    },
    line_items: lineItems.map((item) => ({
      id: item.id,
      section_id: item.section_id,
      item_name: item.item_name,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      is_excluded: item.is_excluded === 1,
      notes: item.notes,
      sort_order: item.sort_order,
    })),
    sections: sections.map((section) => ({
      id: section.id,
      name: section.name,
      title: section.title,
      show_subtotal: section.show_subtotal === 1,
      sort_order: section.sort_order,
    })),
  };

  return snapshot;
}

export async function publishProjectSovFromEstimate(
  options: PublishProjectSovOptions
): Promise<PublishProjectSovResult | null> {
  const sourceType = options.sourceType?.trim() || "estimate_marked_good";
  const updatedBy = options.updatedBy?.trim() || null;

  const linked = await linkEstimateToProject(
    options.projectId,
    options.estimateId,
    sourceType
  );
  if (!linked) {
    return null;
  }

  const snapshot = await buildSnapshotFromEstimate({
    estimateId: options.estimateId,
    estimateVersionId: options.estimateVersionId,
  });

  if (!snapshot) {
    return null;
  }

  const hash = computeSnapshotHash(snapshot);
  const existing = (await db
    .prepare(
      `SELECT snapshot_hash
       FROM project_sov_master
       WHERE project_id = ?`
    )
    .get(options.projectId)) as { snapshot_hash: string } | undefined;

  const deduplicated = existing?.snapshot_hash === hash;
  const estimateVersionId = snapshot.estimate.estimate_version_id;

  await db.transaction(async () => {
    await db.run(
      `INSERT INTO project_sov_master
         (project_id, snapshot_json, snapshot_hash, source_estimate_id, source_estimate_version_id, source_type, updated_by)
       VALUES (?, ?::jsonb, ?, ?, ?, ?, ?)
       ON CONFLICT (project_id)
       DO UPDATE SET
         snapshot_json = EXCLUDED.snapshot_json,
         snapshot_hash = EXCLUDED.snapshot_hash,
         source_estimate_id = EXCLUDED.source_estimate_id,
         source_estimate_version_id = EXCLUDED.source_estimate_version_id,
         source_type = EXCLUDED.source_type,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()`,
      [
        options.projectId,
        JSON.stringify(snapshot),
        hash,
        options.estimateId,
        estimateVersionId,
        sourceType,
        updatedBy,
      ]
    );

    if (!deduplicated) {
      await db.run(
        `INSERT INTO project_sov_revisions
           (project_id, snapshot_json, snapshot_hash, source_estimate_id, source_estimate_version_id, source_type, created_by)
         VALUES (?, ?::jsonb, ?, ?, ?, ?, ?)`,
        [
          options.projectId,
          JSON.stringify(snapshot),
          hash,
          options.estimateId,
          estimateVersionId,
          sourceType,
          updatedBy,
        ]
      );
    }
  });

  const updatedRow = (await db
    .prepare(
      `SELECT updated_at
       FROM project_sov_master
       WHERE project_id = ?`
    )
    .get(options.projectId)) as { updated_at: string } | undefined;

  return {
    deduplicated,
    estimateId: options.estimateId,
    estimateVersionId,
    hash,
    projectId: options.projectId,
    revisionCreated: !deduplicated,
    snapshot,
    updatedAt: updatedRow?.updated_at ?? new Date().toISOString(),
  };
}

export async function getProjectFinalSov(
  projectId: number
): Promise<ProjectFinalSovRecord | null> {
  const row = (await db
    .prepare(
      `SELECT
         project_id,
         snapshot_json,
         snapshot_hash,
         source_estimate_id,
         source_estimate_version_id,
         source_type,
         updated_by,
         updated_at
       FROM project_sov_master
       WHERE project_id = ?`
    )
    .get(projectId)) as
    | {
        project_id: number;
        snapshot_json: unknown;
        snapshot_hash: string;
        source_estimate_id: number | null;
        source_estimate_version_id: string | null;
        source_type: string;
        updated_by: string | null;
        updated_at: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  const snapshot = parseSnapshot(row.snapshot_json);
  if (!snapshot) {
    return null;
  }

  return {
    hash: row.snapshot_hash,
    projectId: row.project_id,
    snapshot,
    sourceEstimateId: row.source_estimate_id,
    sourceEstimateVersionId: row.source_estimate_version_id,
    sourceType: row.source_type,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}
