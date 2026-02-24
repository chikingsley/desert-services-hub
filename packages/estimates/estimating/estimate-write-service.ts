import { db } from "@lib/db/client";
import { validateCreateEstimatePayload } from "@/packages/estimates/estimating/estimate-payload-validation";
import {
  getEstimate,
  getEstimateWithDetails,
  getNextBaseNumber,
} from "@/packages/estimates/estimating/estimate-read-service";
import type {
  CreateEstimateInput,
  Estimate,
  UpdateEstimateInput,
} from "@/packages/estimates/estimating/types";

function mapCreateLineItemToValidationInput(
  item: NonNullable<CreateEstimateInput["line_items"]>[number]
): Record<string, unknown> {
  return {
    section_id: item.section_id,
    item_name: item.item_name,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    notes: item.notes,
  };
}

function buildCreatePayload(
  input: CreateEstimateInput
): Record<string, unknown> {
  return {
    base_number: input.base_number,
    takeoff_id: input.takeoff_id,
    job_name: input.job_name,
    job_address: input.job_address,
    client_name: input.client_name,
    client_address: input.client_address,
    client_email: input.client_email,
    client_phone: input.client_phone,
    notes: input.notes,
    status: input.status,
    is_locked: input.is_locked,
    total: input.total,
    sections: input.sections?.map((section) => ({
      id: section.id ?? crypto.randomUUID(),
      name: section.name,
      title: section.title,
      show_subtotal: section.show_subtotal,
    })),
    line_items: input.line_items?.map(mapCreateLineItemToValidationInput),
  };
}

function computeTotal(
  explicitTotal: number | undefined,
  lineItems: Array<{ quantity: number; unit_price: number }>
): number {
  if (explicitTotal !== undefined) {
    return explicitTotal;
  }

  return lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );
}

async function insertEstimateRow(params: {
  baseNumber: string;
  input: CreateEstimateInput;
  normalized: ReturnType<typeof validateCreateEstimatePayload>;
}): Promise<number> {
  const { baseNumber, input, normalized } = params;

  const inserted = (await db
    .query(
      `INSERT INTO estimates (name, base_number, takeoff_id, job_name, job_address, contractor, client_address, estimator, estimator_email, notes, status, is_locked)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`
    )
    .get(
      normalized.job_name || "Untitled Estimate",
      baseNumber,
      normalized.takeoff_id || null,
      normalized.job_name || "Untitled Estimate",
      normalized.job_address || null,
      normalized.client_name || null,
      normalized.client_address || null,
      input.estimator || null,
      input.estimator_email || null,
      normalized.notes || null,
      normalized.status || "draft",
      normalized.is_locked ? 1 : 0
    )) as { id: number } | null;

  const estimateId = inserted?.id;
  if (!estimateId) {
    throw new Error("Failed to create estimate row");
  }

  return estimateId;
}

async function insertInitialVersion(
  estimateId: string | number,
  total: number
): Promise<string> {
  const versionId = crypto.randomUUID();
  await db
    .query(
      `INSERT INTO estimate_versions (id, estimate_id, version_number, total, is_current)
       VALUES ($1, $2, 1, $3, 1)`
    )
    .run(versionId, estimateId, total);

  return versionId;
}

async function insertSections(
  versionId: string,
  sections: NonNullable<
    ReturnType<typeof validateCreateEstimatePayload>["sections"]
  >
): Promise<Map<string, string>> {
  const sectionIdMap = new Map<string, string>();

  let sortOrder = 0;
  for (const section of sections) {
    const sectionId = crypto.randomUUID();
    await db
      .query(
        `INSERT INTO estimate_sections (id, version_id, name, title, show_subtotal, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`
      )
      .run(
        sectionId,
        versionId,
        section.name,
        section.title ?? null,
        section.show_subtotal ? 1 : 0,
        sortOrder
      );
    sectionIdMap.set(section.id, sectionId);
    sortOrder += 1;
  }

  return sectionIdMap;
}

async function insertLineItems(
  versionId: string,
  lineItems: NonNullable<
    ReturnType<typeof validateCreateEstimatePayload>["line_items"]
  >,
  sectionIdMap: Map<string, string>
): Promise<void> {
  let sortOrder = 0;
  for (const item of lineItems) {
    const lineItemId = crypto.randomUUID();
    const sectionId = item.section_id
      ? sectionIdMap.get(item.section_id)
      : null;

    await db
      .query(
        `INSERT INTO estimate_line_items (id, version_id, section_id, item_name, description, quantity, unit, unit_price, notes, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`
      )
      .run(
        lineItemId,
        versionId,
        sectionId || null,
        item.item_name,
        item.description,
        item.quantity,
        item.unit,
        item.unit_price,
        item.notes ?? null,
        sortOrder
      );

    sortOrder += 1;
  }
}

// Create a new estimate
export async function createEstimate(
  input: CreateEstimateInput
): Promise<Estimate> {
  const normalized = validateCreateEstimatePayload(buildCreatePayload(input));

  const baseNumber = normalized.base_number || (await getNextBaseNumber());
  const sections = normalized.sections ?? [];
  const lineItems = normalized.line_items ?? [];

  const estimateId = await insertEstimateRow({
    baseNumber,
    input,
    normalized,
  });

  const computedTotal = computeTotal(normalized.total, lineItems);
  const versionId = await insertInitialVersion(estimateId, computedTotal);
  const sectionIdMap = await insertSections(versionId, sections);
  await insertLineItems(versionId, lineItems, sectionIdMap);

  const estimate = await getEstimate(String(estimateId));
  if (!estimate) {
    throw new Error("Failed to create estimate");
  }
  return estimate;
}

// Update an existing estimate
export async function updateEstimate(
  id: string,
  input: UpdateEstimateInput
): Promise<Estimate | null> {
  const existing = await getEstimate(id);
  if (!existing) {
    return null;
  }

  const updates: string[] = [];
  const values: (string | number | null)[] = [];
  let paramIndex = 0;

  if (input.job_name !== undefined) {
    paramIndex++;
    updates.push(`job_name = $${paramIndex}`);
    values.push(input.job_name);
  }
  if (input.job_address !== undefined) {
    paramIndex++;
    updates.push(`job_address = $${paramIndex}`);
    values.push(input.job_address || null);
  }
  if (input.client_name !== undefined) {
    paramIndex++;
    updates.push(`contractor = $${paramIndex}`);
    values.push(input.client_name || null);
  }
  if (input.notes !== undefined) {
    paramIndex++;
    updates.push(`notes = $${paramIndex}`);
    values.push(input.notes || null);
  }
  if (input.status !== undefined) {
    paramIndex++;
    updates.push(`status = $${paramIndex}`);
    values.push(input.status);
  }
  if (input.is_locked !== undefined) {
    paramIndex++;
    updates.push(`is_locked = $${paramIndex}`);
    values.push(input.is_locked ? 1 : 0);
  }

  if (updates.length === 0) {
    return existing;
  }

  updates.push("updated_at = now()");
  paramIndex++;
  values.push(id);

  await db
    .query(
      `UPDATE estimates SET ${updates.join(", ")} WHERE id = $${paramIndex}`
    )
    .run(...values);

  return await getEstimate(id);
}

// Delete an estimate
export async function deleteEstimate(id: string): Promise<boolean> {
  const result = await db.query("DELETE FROM estimates WHERE id = $1").run(id);
  return (result as unknown as { count: number }).count > 0;
}

// Duplicate an estimate
export async function duplicateEstimate(
  id: string,
  newJobName?: string
): Promise<Estimate | null> {
  const original = await getEstimateWithDetails(id);
  if (!original) {
    return null;
  }

  const newBaseNumber = await getNextBaseNumber();
  const newEstimateId = crypto.randomUUID();

  await db
    .query(
      `INSERT INTO estimates (id, base_number, job_name, job_address, contractor, notes, status, is_locked)
       SELECT $1, $2, $3, job_address, contractor, notes, 'draft', 0
       FROM estimates WHERE id = $4`
    )
    .run(
      newEstimateId,
      newBaseNumber,
      newJobName || `${original.job_name} (Copy)`,
      id
    );

  const originalVersion = original.current_version;
  const newVersionId = await insertInitialVersion(
    newEstimateId,
    originalVersion.total
  );

  const sectionIdMap = new Map<string, string>();
  for (const section of originalVersion.sections) {
    const newSectionId = crypto.randomUUID();
    await db
      .query(
        `INSERT INTO estimate_sections (id, version_id, name, title, show_subtotal, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`
      )
      .run(
        newSectionId,
        newVersionId,
        section.name,
        section.title || null,
        section.show_subtotal ? 1 : 0,
        section.sort_order
      );
    sectionIdMap.set(section.id, newSectionId);
  }

  for (const item of originalVersion.line_items) {
    const newLineItemId = crypto.randomUUID();
    const newSectionId = item.section_id
      ? sectionIdMap.get(item.section_id)
      : null;
    await db
      .query(
        `INSERT INTO estimate_line_items (id, version_id, section_id, item_name, description, quantity, unit, unit_price, notes, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`
      )
      .run(
        newLineItemId,
        newVersionId,
        newSectionId || null,
        item.item_name || null,
        item.description,
        item.quantity,
        item.unit,
        item.unit_price,
        item.notes || null,
        item.sort_order
      );
  }

  return await getEstimate(newEstimateId);
}
