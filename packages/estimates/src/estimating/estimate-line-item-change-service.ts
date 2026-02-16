import { validateUpdateEstimatePayload } from "@estimates/estimating/estimate-payload-validation";
import {
  getEstimate,
  getEstimateWithDetails,
} from "@estimates/estimating/estimate-read-service";
import type {
  Estimate,
  EstimateLineItem,
  LineItemChange,
} from "@estimates/estimating/types";
import { db } from "@lib/db/hub";
import type { EstimateRow } from "@lib/db/types";

function normalizeChangeLineItem(
  rawItem: Record<string, unknown>,
  existingEstimateRow: EstimateRow
) {
  const normalized = validateUpdateEstimatePayload(
    { line_items: [rawItem] },
    existingEstimateRow
  );
  const item = normalized.line_items?.[0];
  if (!item) {
    throw new Error("Line item change did not produce a normalized line item.");
  }
  return item;
}

async function applyAddLineItemChange(params: {
  change: LineItemChange;
  existingEstimateRow: EstimateRow;
  versionId: string;
  nextSortOrder: number;
}): Promise<number> {
  const item = normalizeChangeLineItem(
    {
      section_id: params.change.section_id,
      item_name: params.change.item_name,
      description: params.change.description,
      quantity: params.change.quantity,
      unit: params.change.unit,
      unit_price: params.change.unit_price,
      notes: params.change.notes,
    },
    params.existingEstimateRow
  );

  const lineItemId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO estimate_line_items (id, version_id, section_id, item_name, description, quantity, unit, unit_price, notes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      lineItemId,
      params.versionId,
      item.section_id ?? null,
      item.item_name,
      item.description,
      item.quantity,
      item.unit,
      item.unit_price,
      item.notes ?? null,
      params.nextSortOrder
    );

  return params.nextSortOrder + 1;
}

async function applyRemoveLineItemChange(
  change: LineItemChange,
  versionId: string
): Promise<void> {
  if (!change.id) {
    return;
  }

  await db
    .prepare("DELETE FROM estimate_line_items WHERE id = ? AND version_id = ?")
    .run(change.id, versionId);
}

function buildUpdateRawItem(
  change: LineItemChange,
  existingItem: EstimateLineItem
): Record<string, unknown> {
  return {
    section_id: change.section_id ?? existingItem.section_id ?? undefined,
    item_name:
      change.item_name ?? existingItem.item_name ?? existingItem.description,
    description: change.description ?? existingItem.description,
    quantity: change.quantity ?? existingItem.quantity,
    unit: change.unit ?? existingItem.unit,
    unit_price: change.unit_price ?? existingItem.unit_price,
    notes: change.notes ?? existingItem.notes ?? undefined,
  };
}

async function applyUpdateLineItemChange(params: {
  change: LineItemChange;
  currentVersionLineItems: EstimateLineItem[];
  existingEstimateRow: EstimateRow;
  versionId: string;
}): Promise<void> {
  if (!params.change.id) {
    return;
  }

  const existingItem = params.currentVersionLineItems.find(
    (item) => item.id === params.change.id
  );
  if (!existingItem) {
    throw new Error(`Line item not found: ${params.change.id}`);
  }

  const item = normalizeChangeLineItem(
    buildUpdateRawItem(params.change, existingItem),
    params.existingEstimateRow
  );

  await db
    .prepare(
      `UPDATE estimate_line_items
       SET section_id = ?, item_name = ?, description = ?, quantity = ?, unit = ?, unit_price = ?, notes = ?, updated_at = now()
       WHERE id = ? AND version_id = ?`
    )
    .run(
      item.section_id ?? null,
      item.item_name,
      item.description,
      item.quantity,
      item.unit,
      item.unit_price,
      item.notes ?? null,
      params.change.id,
      params.versionId
    );
}

async function recalculateVersionTotal(versionId: string): Promise<void> {
  const result = (await db
    .prepare(
      "SELECT SUM(quantity * unit_price) as total FROM estimate_line_items WHERE version_id = ?"
    )
    .get(versionId)) as { total: number } | null;

  const newTotal = result?.total || 0;
  await db
    .prepare("UPDATE estimate_versions SET total = ? WHERE id = ?")
    .run(newTotal, versionId);
}

// Apply line item changes to an estimate
export async function applyLineItemChanges(
  estimateId: string,
  changes: LineItemChange[]
): Promise<Estimate | null> {
  const estimate = await getEstimateWithDetails(estimateId);
  if (!estimate) {
    return null;
  }

  const estimateRow = (await db
    .prepare("SELECT * FROM estimates WHERE id = ?")
    .get(estimateId)) as EstimateRow | null;
  if (!estimateRow) {
    return null;
  }

  const currentVersion = estimate.current_version;
  const versionId = currentVersion.id;
  const sortOrderRow = (await db
    .prepare(
      "SELECT COALESCE(MAX(sort_order), -1) AS max_sort_order FROM estimate_line_items WHERE version_id = ?"
    )
    .get(versionId)) as { max_sort_order: number } | null;

  let nextSortOrder = (sortOrderRow?.max_sort_order ?? -1) + 1;

  for (const change of changes) {
    if (change.action === "add") {
      nextSortOrder = await applyAddLineItemChange({
        change,
        existingEstimateRow: estimateRow,
        versionId,
        nextSortOrder,
      });
      continue;
    }

    if (change.action === "remove") {
      await applyRemoveLineItemChange(change, versionId);
      continue;
    }

    if (change.action === "update") {
      await applyUpdateLineItemChange({
        change,
        currentVersionLineItems: currentVersion.line_items,
        existingEstimateRow: estimateRow,
        versionId,
      });
    }
  }

  await recalculateVersionTotal(versionId);
  return await getEstimate(estimateId);
}
