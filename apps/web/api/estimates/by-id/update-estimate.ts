import { db, type SqlParam } from "@lib/db/client";
import type { EstimateRow, EstimateVersionRow } from "@lib/db/types";
import {
  type BunRequest,
  getPreferredEstimateVersion,
  parseEstimateId,
} from "@/api/estimates/by-id/shared";
import {
  EstimatePayloadValidationError,
  validateUpdateEstimatePayload,
} from "@/packages/estimates/estimating/estimate-payload-validation";

type UpdateValue = string | number | null;
type NormalizedUpdatePayload = ReturnType<typeof validateUpdateEstimatePayload>;
type NormalizedUpdateLineItem = NonNullable<
  NormalizedUpdatePayload["line_items"]
>[number];

interface SectionInsertState {
  sectionIdMap: Map<string, string>;
  validSectionIds: Set<string>;
}

function buildEstimateUpdateStatement(payload: NormalizedUpdatePayload): {
  fields: string[];
  values: UpdateValue[];
} {
  const fields = ["updated_at = now()"];
  const values: UpdateValue[] = [];

  if (payload.base_number !== undefined) {
    values.push(payload.base_number);
    fields.push(`base_number = $${values.length}`);
  }

  if (payload.job_name !== undefined) {
    const jobName = payload.job_name || "Untitled Estimate";
    values.push(jobName);
    fields.push(`name = $${values.length}`);
    values.push(jobName);
    fields.push(`job_name = $${values.length}`);
  }

  const nullableTextColumns: Array<{
    key: keyof NormalizedUpdatePayload;
    column: string;
  }> = [
    { key: "job_address", column: "job_address" },
    { key: "client_name", column: "contractor" },
    { key: "client_address", column: "client_address" },
    { key: "estimator", column: "estimator" },
    { key: "notes", column: "notes" },
    { key: "takeoff_id", column: "takeoff_id" },
  ];

  for (const mapping of nullableTextColumns) {
    const value = payload[mapping.key] as string | null | undefined;
    if (value === undefined) {
      continue;
    }
    values.push(value || null);
    fields.push(`${mapping.column} = $${values.length}`);
  }

  if (payload.estimator_email !== undefined) {
    values.push(payload.estimator_email || null);
    fields.push(`estimator_email = $${values.length}`);
  } else if (payload.client_email !== undefined) {
    values.push(payload.client_email || null);
    fields.push(`estimator_email = $${values.length}`);
  }

  if (payload.status !== undefined) {
    const status = payload.status || "draft";
    values.push(status);
    fields.push(`status = $${values.length}`);
  }

  if (payload.is_locked !== undefined) {
    values.push(payload.is_locked ? 1 : 0);
    fields.push(`is_locked = $${values.length}`);
  }

  return { fields, values };
}

async function updateEstimateRow(
  estimateId: number,
  payload: NormalizedUpdatePayload
): Promise<void> {
  const { fields, values } = buildEstimateUpdateStatement(payload);
  values.push(estimateId);
  const idParam = `$${values.length}`;

  await db
    .query(`UPDATE estimates SET ${fields.join(", ")} WHERE id = ${idParam}`)
    .run(...values);
}

async function ensureCurrentVersion(
  estimateId: number
): Promise<EstimateVersionRow> {
  let version = (await getPreferredEstimateVersion(estimateId)) as
    | EstimateVersionRow
    | undefined;

  if (!version) {
    const versionId = crypto.randomUUID();
    await db
      .query(
        `INSERT INTO estimate_versions (id, estimate_id, version_number, total, is_current)
         VALUES ($1, $2, 1, 0, 1)`
      )
      .run(versionId, estimateId);

    return {
      id: versionId,
      estimate_id: String(estimateId),
      version_number: 1,
      total: 0,
      is_current: 1,
      created_at: new Date().toISOString(),
    };
  }

  if (version.is_current !== 1) {
    await db
      .query(
        `UPDATE estimate_versions
         SET is_current = CASE WHEN id = $1 THEN 1 ELSE 0 END
         WHERE estimate_id = $2`
      )
      .run(version.id, estimateId);
    version = { ...version, is_current: 1 };
  }

  return version;
}

async function clearVersionSectionsAndItems(versionId: string): Promise<void> {
  await db
    .query("DELETE FROM estimate_line_items WHERE version_id = $1")
    .run(versionId);
  await db
    .query("DELETE FROM estimate_sections WHERE version_id = $1")
    .run(versionId);
}

async function clearVersionLineItems(versionId: string): Promise<void> {
  await db
    .query("DELETE FROM estimate_line_items WHERE version_id = $1")
    .run(versionId);
}

async function insertSections(
  versionId: string,
  sections: NonNullable<NormalizedUpdatePayload["sections"]>
): Promise<SectionInsertState> {
  const sectionIdMap = new Map<string, string>();
  const validSectionIds = new Set<string>();

  if (sections.length === 0) {
    return { sectionIdMap, validSectionIds };
  }

  const sectionValues: SqlParam[] = [];
  const sectionPlaceholders: string[] = [];

  let sortOrder = 0;
  for (const section of sections) {
    const sectionId = crypto.randomUUID();
    sectionIdMap.set(section.id, sectionId);
    validSectionIds.add(sectionId);

    const offset = sectionValues.length;
    sectionPlaceholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`
    );
    sectionValues.push(
      sectionId,
      versionId,
      section.name,
      section.title ?? null,
      section.show_subtotal ? 1 : 0,
      sortOrder
    );
    sortOrder += 1;
  }

  await db.run(
    `INSERT INTO estimate_sections (id, version_id, name, title, show_subtotal, sort_order) VALUES ${sectionPlaceholders.join(", ")}`,
    sectionValues
  );

  return { sectionIdMap, validSectionIds };
}

async function loadExistingSectionIds(versionId: string): Promise<Set<string>> {
  const existingSections = (await db
    .query("SELECT id FROM estimate_sections WHERE version_id = $1")
    .all(versionId)) as Array<{ id: string }>;

  return new Set(existingSections.map((section) => section.id));
}

function resolveLineItemSectionId(
  item: NormalizedUpdateLineItem,
  shouldReplaceSections: boolean,
  sectionState: SectionInsertState
): string | null {
  if (!item.section_id) {
    return null;
  }

  if (shouldReplaceSections) {
    return sectionState.sectionIdMap.get(item.section_id) ?? null;
  }

  return sectionState.validSectionIds.has(item.section_id)
    ? item.section_id
    : null;
}

async function insertLineItems(
  versionId: string,
  lineItems: NonNullable<NormalizedUpdatePayload["line_items"]>,
  shouldReplaceSections: boolean,
  sectionState: SectionInsertState
): Promise<void> {
  if (lineItems.length === 0) {
    return;
  }

  const itemValues: SqlParam[] = [];
  const itemPlaceholders: string[] = [];

  let sortOrder = 0;
  for (const item of lineItems) {
    const lineItemId = crypto.randomUUID();
    const sectionId = resolveLineItemSectionId(
      item,
      shouldReplaceSections,
      sectionState
    );

    const offset = itemValues.length;
    itemPlaceholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`
    );
    itemValues.push(
      lineItemId,
      versionId,
      sectionId,
      item.item_name,
      item.description,
      item.quantity,
      item.unit,
      item.unit_price,
      item.notes ?? null,
      item.is_excluded ? 1 : 0,
      sortOrder
    );

    sortOrder += 1;
  }

  await db.run(
    `INSERT INTO estimate_line_items (id, version_id, section_id, item_name, description, quantity, unit, unit_price, notes, is_excluded, sort_order) VALUES ${itemPlaceholders.join(", ")}`,
    itemValues
  );
}

function computeLineItemsTotal(
  lineItems: NonNullable<NormalizedUpdatePayload["line_items"]>
): number {
  return lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );
}

async function updateVersionTotal(
  versionId: string,
  total: number
): Promise<void> {
  await db
    .query("UPDATE estimate_versions SET total = $1 WHERE id = $2")
    .run(total, versionId);
}

async function rebuildVersionLineItems(
  versionId: string,
  payload: NormalizedUpdatePayload
): Promise<number> {
  const shouldReplaceSections = payload.sections !== undefined;

  let sectionState: SectionInsertState;
  if (shouldReplaceSections) {
    await clearVersionSectionsAndItems(versionId);
    sectionState = await insertSections(versionId, payload.sections ?? []);
  } else {
    await clearVersionLineItems(versionId);
    sectionState = {
      sectionIdMap: new Map<string, string>(),
      validSectionIds: await loadExistingSectionIds(versionId),
    };
  }

  const lineItems = payload.line_items ?? [];
  await insertLineItems(
    versionId,
    lineItems,
    shouldReplaceSections,
    sectionState
  );
  return computeLineItemsTotal(lineItems);
}

async function applyVersionChanges(
  estimateId: number,
  payload: NormalizedUpdatePayload
): Promise<void> {
  const shouldReplaceLineItems = payload.line_items !== undefined;
  const shouldTouchVersion =
    shouldReplaceLineItems || payload.total !== undefined;

  if (!shouldTouchVersion) {
    return;
  }

  const version = await ensureCurrentVersion(estimateId);

  await db.transaction(async () => {
    if (shouldReplaceLineItems) {
      const computedTotal = await rebuildVersionLineItems(version.id, payload);
      const total = payload.total ?? computedTotal;
      await updateVersionTotal(version.id, total);
      return;
    }

    if (payload.total !== undefined) {
      await updateVersionTotal(version.id, payload.total);
    }
  });
}

export async function handleUpdateEstimate(req: BunRequest): Promise<Response> {
  try {
    const id = parseEstimateId(req.params.id);
    if (!id) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const existing = (await db
      .query("SELECT * FROM estimates WHERE id = $1")
      .get(id)) as EstimateRow | undefined;
    if (!existing) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const body = await req.json();
    const payload = validateUpdateEstimatePayload(body, existing);

    await updateEstimateRow(id, payload);
    await applyVersionChanges(id, payload);

    const updated = (await db
      .query("SELECT updated_at FROM estimates WHERE id = $1")
      .get(id)) as { updated_at: string } | null;

    return Response.json({ success: true, updated_at: updated?.updated_at });
  } catch (error) {
    if (error instanceof EstimatePayloadValidationError) {
      return Response.json(
        { error: error.issues[0], issues: error.issues },
        { status: 400 }
      );
    }

    console.error("Failed to update estimate:", error);
    return Response.json(
      { error: "Failed to update estimate" },
      { status: 500 }
    );
  }
}
