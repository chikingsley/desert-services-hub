// Estimate CRUD operations
// Shared between CLI and web app

import { db } from "../db";
import { generateBaseNumber } from "../utils";
import type {
  CreateEstimateInput,
  Estimate,
  EstimateLineItem,
  EstimateSection,
  EstimateVersion,
  LineItemChange,
  UpdateEstimateInput,
} from "./types";

// Generate a unique base number (YYMMDD format with suffix for duplicates)
export function getNextBaseNumber(): string {
  const baseNumber = generateBaseNumber();

  const existing = db
    .prepare(
      `SELECT base_number FROM quotes
       WHERE base_number LIKE ?
       ORDER BY base_number DESC
       LIMIT 1`
    )
    .get(`${baseNumber}%`) as { base_number: string } | undefined;

  if (!existing) {
    return baseNumber;
  }

  const lastNumber = existing.base_number;
  if (lastNumber.length > 6) {
    const suffix = Number.parseInt(lastNumber.slice(6), 10) + 1;
    return `${baseNumber}${suffix.toString().padStart(2, "0")}`;
  }
  return `${baseNumber}01`;
}

// Build full estimate number with revision
export function getEstimateNumber(
  baseNumber: string,
  versionNumber: number
): string {
  const revision = versionNumber - 1; // version 1 = R0
  return `${baseNumber}R${revision}`;
}

// List all estimates
export function listEstimates(): Estimate[] {
  const rows = db
    .prepare(
      `SELECT q.*,
        (SELECT json_group_array(json_object(
          'id', v.id,
          'version_number', v.version_number,
          'total', v.total,
          'is_current', v.is_current,
          'created_at', v.created_at
        )) FROM quote_versions v WHERE v.quote_id = q.id) as versions
      FROM quotes q
      ORDER BY q.created_at DESC`
    )
    .all() as Array<Record<string, unknown> & { versions: string }>;

  return rows.map((row) => ({
    ...row,
    versions: JSON.parse(row.versions || "[]"),
  })) as Estimate[];
}

// Get a single estimate by ID
export function getEstimate(id: string): Estimate | null {
  const quote = db
    .prepare(
      `SELECT q.*,
        (SELECT json_group_array(json_object(
          'id', v.id,
          'version_number', v.version_number,
          'total', v.total,
          'is_current', v.is_current,
          'created_at', v.created_at
        )) FROM quote_versions v WHERE v.quote_id = q.id) as versions
      FROM quotes q
      WHERE q.id = ?`
    )
    .get(id) as (Record<string, unknown> & { versions: string }) | undefined;

  if (!quote) {
    return null;
  }

  return {
    ...quote,
    versions: JSON.parse(quote.versions || "[]"),
  } as Estimate;
}

// Get estimate by base number
export function getEstimateByBaseNumber(baseNumber: string): Estimate | null {
  const quote = db
    .prepare(
      `SELECT q.*,
        (SELECT json_group_array(json_object(
          'id', v.id,
          'version_number', v.version_number,
          'total', v.total,
          'is_current', v.is_current,
          'created_at', v.created_at
        )) FROM quote_versions v WHERE v.quote_id = q.id) as versions
      FROM quotes q
      WHERE q.base_number = ?`
    )
    .get(baseNumber) as
    | (Record<string, unknown> & { versions: string })
    | undefined;

  if (!quote) {
    return null;
  }

  return {
    ...quote,
    versions: JSON.parse(quote.versions || "[]"),
  } as Estimate;
}

// Get full estimate with current version details
export function getEstimateWithDetails(id: string):
  | (Estimate & {
      current_version: EstimateVersion;
    })
  | null {
  const estimate = getEstimate(id);
  if (!estimate) {
    return null;
  }

  const currentVersion = estimate.versions.find((v) => v.is_current);
  if (!currentVersion) {
    return null;
  }

  // Get sections and line items for current version
  const sections = db
    .prepare(
      `SELECT id, name, title, show_subtotal, sort_order
       FROM quote_sections
       WHERE version_id = ?
       ORDER BY sort_order`
    )
    .all(currentVersion.id) as EstimateSection[];

  const lineItems = db
    .prepare(
      `SELECT
        id,
        section_id,
        item_name,
        description,
        quantity,
        unit,
        unit_cost,
        unit_price,
        notes,
        sort_order
       FROM quote_line_items
       WHERE version_id = ?
       ORDER BY sort_order`
    )
    .all(currentVersion.id) as EstimateLineItem[];

  return {
    ...estimate,
    current_version: {
      ...currentVersion,
      sections,
      line_items: lineItems,
    },
  };
}

// Create a new estimate
export function createEstimate(input: CreateEstimateInput): Estimate {
  const id = crypto.randomUUID();
  const baseNumber = input.base_number || getNextBaseNumber();

  // Insert quote
  db.prepare(
    `INSERT INTO quotes (id, base_number, takeoff_id, job_name, job_address, client_name, client_address, client_email, client_phone, estimator, estimator_email, notes, status, is_locked)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    baseNumber,
    input.takeoff_id || null,
    input.job_name || "Untitled Estimate",
    input.job_address || null,
    input.client_name || null,
    input.client_address || null,
    input.client_email || null,
    input.client_phone || null,
    input.estimator || null,
    input.estimator_email || null,
    input.notes || null,
    input.status || "draft",
    input.is_locked ? 1 : 0
  );

  // Compute total from line items if not provided
  const computedTotal =
    input.total ??
    input.line_items?.reduce((sum, item) => {
      const qty = item.quantity ?? 1;
      const cost = item.unit_cost ?? 0;
      return sum + qty * cost;
    }, 0) ??
    0;

  // Create first version
  const versionId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO quote_versions (id, quote_id, version_number, total, is_current)
     VALUES (?, ?, 1, ?, 1)`
  ).run(versionId, id, computedTotal);

  // Create sections if provided
  const sectionIdMap = new Map<string, string>();
  if (input.sections) {
    let sortOrder = 0;
    for (const section of input.sections) {
      const sectionId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO quote_sections (id, version_id, name, title, show_subtotal, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        sectionId,
        versionId,
        section.name,
        section.title ?? null,
        section.show_subtotal ? 1 : 0,
        sortOrder
      );
      if (section.id) {
        sectionIdMap.set(section.id, sectionId);
      }
      sortOrder += 1;
    }
  }

  // Create line items if provided
  if (input.line_items) {
    let sortOrder = 0;
    for (const item of input.line_items) {
      const lineItemId = crypto.randomUUID();
      const sectionId = item.section_id
        ? sectionIdMap.get(item.section_id)
        : null;
      const cost = item.unit_cost ?? 0;
      db.prepare(
        `INSERT INTO quote_line_items (id, version_id, section_id, item_name, description, quantity, unit, unit_cost, unit_price, notes, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        lineItemId,
        versionId,
        sectionId || null,
        item.item_name || null,
        item.description,
        item.quantity ?? 1,
        item.unit || "EA",
        cost,
        cost,
        item.notes || null,
        sortOrder
      );
      sortOrder += 1;
    }
  }

  const estimate = getEstimate(id);
  if (!estimate) {
    throw new Error("Failed to create estimate");
  }
  return estimate;
}

// Update an existing estimate
export function updateEstimate(
  id: string,
  input: UpdateEstimateInput
): Estimate | null {
  const existing = getEstimate(id);
  if (!existing) {
    return null;
  }

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (input.job_name !== undefined) {
    updates.push("job_name = ?");
    values.push(input.job_name);
  }
  if (input.job_address !== undefined) {
    updates.push("job_address = ?");
    values.push(input.job_address || null);
  }
  if (input.client_name !== undefined) {
    updates.push("client_name = ?");
    values.push(input.client_name || null);
  }
  if (input.client_email !== undefined) {
    updates.push("client_email = ?");
    values.push(input.client_email || null);
  }
  if (input.client_phone !== undefined) {
    updates.push("client_phone = ?");
    values.push(input.client_phone || null);
  }
  if (input.notes !== undefined) {
    updates.push("notes = ?");
    values.push(input.notes || null);
  }
  if (input.status !== undefined) {
    updates.push("status = ?");
    values.push(input.status);
  }
  if (input.is_locked !== undefined) {
    updates.push("is_locked = ?");
    values.push(input.is_locked ? 1 : 0);
  }

  if (updates.length === 0) {
    return existing;
  }

  updates.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE quotes SET ${updates.join(", ")} WHERE id = ?`).run(
    ...values
  );

  return getEstimate(id);
}

// Delete an estimate
export function deleteEstimate(id: string): boolean {
  const result = db.prepare("DELETE FROM quotes WHERE id = ?").run(id);
  return result.changes > 0;
}

// Duplicate an estimate
export function duplicateEstimate(
  id: string,
  newJobName?: string
): Estimate | null {
  const original = getEstimateWithDetails(id);
  if (!original) {
    return null;
  }

  const newBaseNumber = getNextBaseNumber();
  const newEstimateId = crypto.randomUUID();

  // Create new estimate
  db.prepare(
    `INSERT INTO quotes (id, base_number, job_name, job_address, client_name, client_email, client_phone, notes, status, is_locked)
     SELECT ?, ?, ?, job_address, client_name, client_email, client_phone, notes, 'draft', 0
     FROM quotes WHERE id = ?`
  ).run(
    newEstimateId,
    newBaseNumber,
    newJobName || `${original.job_name} (Copy)`,
    id
  );

  // Get the original version details
  const originalVersion = original.current_version;

  // Create new version
  const newVersionId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO quote_versions (id, quote_id, version_number, total, is_current)
     VALUES (?, ?, 1, ?, 1)`
  ).run(newVersionId, newEstimateId, originalVersion.total);

  // Duplicate sections
  const sectionIdMap = new Map<string, string>();
  for (const section of originalVersion.sections) {
    const newSectionId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO quote_sections (id, version_id, name, title, show_subtotal, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      newSectionId,
      newVersionId,
      section.name,
      section.title || null,
      section.show_subtotal ? 1 : 0,
      section.sort_order
    );
    sectionIdMap.set(section.id, newSectionId);
  }

  // Duplicate line items
  for (const item of originalVersion.line_items) {
    const newLineItemId = crypto.randomUUID();
    const newSectionId = item.section_id
      ? sectionIdMap.get(item.section_id)
      : null;
    db.prepare(
      `INSERT INTO quote_line_items (id, version_id, section_id, description, quantity, unit, unit_cost, unit_price, notes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newLineItemId,
      newVersionId,
      newSectionId || null,
      item.description,
      item.quantity,
      item.unit,
      item.unit_cost,
      item.unit_price || item.unit_cost,
      item.notes || null,
      item.sort_order
    );
  }

  return getEstimate(newEstimateId);
}

// Apply line item changes to an estimate
export function applyLineItemChanges(
  estimateId: string,
  changes: LineItemChange[]
): Estimate | null {
  const estimate = getEstimateWithDetails(estimateId);
  if (!estimate) {
    return null;
  }

  const currentVersion = estimate.current_version;
  const versionId = currentVersion.id;

  for (const change of changes) {
    switch (change.action) {
      case "add": {
        const lineItemId = crypto.randomUUID();
        const cost = change.unit_cost ?? 0;
        const maxSortOrder =
          currentVersion.line_items.length > 0
            ? Math.max(...currentVersion.line_items.map((i) => i.sort_order))
            : -1;
        db.prepare(
          `INSERT INTO quote_line_items (id, version_id, section_id, description, quantity, unit, unit_cost, unit_price, notes, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          lineItemId,
          versionId,
          change.section_id || null,
          change.description || "",
          change.quantity ?? 1,
          change.unit || "EA",
          cost,
          cost,
          change.notes || null,
          maxSortOrder + 1
        );
        break;
      }
      case "remove": {
        if (change.id) {
          db.prepare(
            "DELETE FROM quote_line_items WHERE id = ? AND version_id = ?"
          ).run(change.id, versionId);
        }
        break;
      }
      case "update": {
        if (change.id) {
          const updates: string[] = [];
          const values: (string | number | null)[] = [];

          if (change.description !== undefined) {
            updates.push("description = ?");
            values.push(change.description);
          }
          if (change.quantity !== undefined) {
            updates.push("quantity = ?");
            values.push(change.quantity);
          }
          if (change.unit !== undefined) {
            updates.push("unit = ?");
            values.push(change.unit);
          }
          if (change.unit_cost !== undefined) {
            updates.push("unit_cost = ?");
            values.push(change.unit_cost);
            updates.push("unit_price = ?");
            values.push(change.unit_cost);
          }
          if (change.notes !== undefined) {
            updates.push("notes = ?");
            values.push(change.notes);
          }

          if (updates.length > 0) {
            updates.push("updated_at = datetime('now')");
            values.push(change.id, versionId);
            db.prepare(
              `UPDATE quote_line_items SET ${updates.join(", ")} WHERE id = ? AND version_id = ?`
            ).run(...values);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  // Recalculate total
  const result = db
    .prepare(
      "SELECT SUM(quantity * unit_cost) as total FROM quote_line_items WHERE version_id = ?"
    )
    .get(versionId) as { total: number } | undefined;
  const newTotal = result?.total || 0;

  db.prepare("UPDATE quote_versions SET total = ? WHERE id = ?").run(
    newTotal,
    versionId
  );

  return getEstimate(estimateId);
}
