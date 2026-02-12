/**
 * Estimate by ID API handlers
 * Routes: /api/estimates/:id, /api/estimates/:id/pdf, /api/estimates/:id/duplicate, /api/estimates/:id/takeoff
 */
import { db } from "@lib/db/hub";
import type {
  EditorEstimate,
  EditorLineItem,
  EditorSection,
  EstimateLineItemRow,
  EstimateRow,
  EstimateSectionRow,
  EstimateVersionRow,
} from "@lib/db/types";
import {
  EstimatePayloadValidationError,
  validateUpdateEstimatePayload,
} from "@lib/estimating/estimate-payload-validation";
import {
  generateEstimatePDF,
  getEstimatePDFFilename,
} from "@lib/pdf/estimate/generate-estimate-pdf.server";
import { generateBaseNumber } from "@lib/utils";

// Bun extends Request with params from route matching
type BunRequest = Request & { params: { id: string } };

async function getPreferredEstimateVersion(
  estimateId: number
): Promise<EstimateVersionRow | undefined> {
  return (await db
    .prepare(
      `SELECT *
       FROM estimate_versions
       WHERE estimate_id = ?
       ORDER BY is_current DESC, version_number DESC, created_at DESC
       LIMIT 1`
    )
    .get(estimateId)) as EstimateVersionRow | undefined;
}

function parseEstimateId(rawId: string): number | null {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

// Generate a unique base number (YYMMDD format with suffix for duplicates)
async function getNextBaseNumber(): Promise<string> {
  const baseNumber = generateBaseNumber();

  const existing = (await db
    .prepare(
      `SELECT base_number FROM estimates
       WHERE base_number LIKE ?
       ORDER BY base_number DESC
       LIMIT 1`
    )
    .get(`${baseNumber}%`)) as { base_number: string } | undefined;

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

// GET /api/estimates/:id - Get a single estimate with versions, sections, line items
export async function getEstimate(req: BunRequest): Promise<Response> {
  try {
    const id = parseEstimateId(req.params.id);
    if (!id) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const estimate = (await db
      .prepare("SELECT * FROM estimates WHERE id = ?")
      .get(id)) as EstimateRow | undefined;

    if (!estimate) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const version = await getPreferredEstimateVersion(id);

    const sections = version
      ? ((await db
          .prepare(
            "SELECT * FROM estimate_sections WHERE version_id = ? ORDER BY sort_order"
          )
          .all(version.id)) as EstimateSectionRow[])
      : [];

    const lineItems = version
      ? ((await db
          .prepare(
            "SELECT * FROM estimate_line_items WHERE version_id = ? ORDER BY sort_order"
          )
          .all(version.id)) as EstimateLineItemRow[])
      : [];

    const currentVersion =
      version ??
      ({
        id: `legacy-${id}`,
        estimate_id: String(id),
        version_number: 1,
        total: 0,
        is_current: 1,
        created_at: estimate.created_at,
      } satisfies EstimateVersionRow);

    return Response.json({
      id: estimate.id,
      base_number: estimate.base_number ?? estimate.estimate_number,
      takeoff_id: estimate.takeoff_id,
      job_name: estimate.job_name || estimate.name,
      job_address: estimate.job_address,
      client_name: estimate.client_name ?? estimate.contractor,
      client_address: estimate.client_address ?? estimate.location,
      client_email: estimate.client_email,
      client_phone: estimate.client_phone,
      estimator: estimate.estimator,
      estimator_email: estimate.estimator_email,
      notes: estimate.notes,
      status: estimate.status ?? estimate.bid_status ?? "draft",
      is_locked: estimate.is_locked,
      created_at: estimate.created_at,
      updated_at: estimate.updated_at,
      current_version: {
        ...currentVersion,
        sections,
        line_items: lineItems,
      },
    });
  } catch (error) {
    console.error("Failed to fetch estimate:", error);
    return Response.json(
      { error: "Failed to fetch estimate" },
      { status: 500 }
    );
  }
}

// PUT /api/estimates/:id - Update an estimate
export async function updateEstimate(req: BunRequest): Promise<Response> {
  try {
    const id = parseEstimateId(req.params.id);
    if (!id) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }
    const existing = (await db
      .prepare("SELECT * FROM estimates WHERE id = ?")
      .get(id)) as EstimateRow | undefined;
    if (!existing) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const body = await req.json();
    const payload = validateUpdateEstimatePayload(body, existing);

    const updateFields = ["updated_at = now()"];
    const updateValues: Array<string | number | null> = [];

    if (payload.base_number !== undefined) {
      updateFields.push("base_number = ?");
      updateValues.push(payload.base_number);
    }
    if (payload.job_name !== undefined) {
      const jobName = payload.job_name || "Untitled Estimate";
      updateFields.push("name = ?");
      updateValues.push(jobName);
      updateFields.push("job_name = ?");
      updateValues.push(jobName);
    }
    if (payload.job_address !== undefined) {
      updateFields.push("job_address = ?");
      updateValues.push(payload.job_address || null);
    }
    if (payload.client_name !== undefined) {
      updateFields.push("client_name = ?");
      updateValues.push(payload.client_name || null);
    }
    if (payload.client_address !== undefined) {
      updateFields.push("client_address = ?");
      updateValues.push(payload.client_address || null);
    }
    if (payload.client_email !== undefined) {
      updateFields.push("client_email = ?");
      updateValues.push(payload.client_email || null);
    }
    if (payload.client_phone !== undefined) {
      updateFields.push("client_phone = ?");
      updateValues.push(payload.client_phone || null);
    }
    if (payload.notes !== undefined) {
      updateFields.push("notes = ?");
      updateValues.push(payload.notes || null);
    }
    if (payload.status !== undefined) {
      const status = payload.status || "draft";
      updateFields.push("bid_status = ?");
      updateValues.push(status);
      updateFields.push("status = ?");
      updateValues.push(status);
    }
    if (payload.is_locked !== undefined) {
      updateFields.push("is_locked = ?");
      updateValues.push(payload.is_locked ? 1 : 0);
    }
    if (payload.takeoff_id !== undefined) {
      updateFields.push("takeoff_id = ?");
      updateValues.push(payload.takeoff_id || null);
    }

    updateValues.push(id);
    await db
      .prepare(`UPDATE estimates SET ${updateFields.join(", ")} WHERE id = ?`)
      .run(...updateValues);

    const shouldReplaceLineItems = payload.line_items !== undefined;
    const shouldReplaceSections = payload.sections !== undefined;
    const shouldTouchVersion =
      shouldReplaceLineItems || payload.total !== undefined;

    if (shouldTouchVersion) {
      // Get current version
      let version = (await getPreferredEstimateVersion(id)) as
        | EstimateVersionRow
        | undefined;

      if (!version) {
        const versionId = crypto.randomUUID();
        await db
          .prepare(
            `INSERT INTO estimate_versions (id, estimate_id, version_number, total, is_current)
             VALUES (?, ?, 1, 0, 1)`
          )
          .run(versionId, id);
        version = {
          id: versionId,
          estimate_id: String(id),
          version_number: 1,
          total: 0,
          is_current: 1,
          created_at: new Date().toISOString(),
        };
      } else if (version.is_current !== 1) {
        await db
          .prepare(
            `UPDATE estimate_versions
             SET is_current = CASE WHEN id = ? THEN 1 ELSE 0 END
             WHERE estimate_id = ?`
          )
          .run(version.id, id);
        version = { ...version, is_current: 1 };
      }

      await db.transaction(async () => {
        if (shouldReplaceLineItems) {
          const sectionIdMap = new Map<string, string>();
          const validSectionIds = new Set<string>();

          if (shouldReplaceSections) {
            await db
              .prepare("DELETE FROM estimate_line_items WHERE version_id = ?")
              .run(version.id);
            await db
              .prepare("DELETE FROM estimate_sections WHERE version_id = ?")
              .run(version.id);

            const sections = payload.sections ?? [];
            if (sections.length > 0) {
              const sectionValues: unknown[] = [];
              const sectionPlaceholders: string[] = [];
              let sortOrder = 0;
              for (const section of sections) {
                const sectionId = crypto.randomUUID();
                sectionIdMap.set(section.id, sectionId);
                validSectionIds.add(sectionId);
                sectionPlaceholders.push("(?, ?, ?, ?, ?, ?)");
                sectionValues.push(
                  sectionId,
                  version.id,
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
            }
          } else {
            await db
              .prepare("DELETE FROM estimate_line_items WHERE version_id = ?")
              .run(version.id);
            const existingSections = (await db
              .prepare("SELECT id FROM estimate_sections WHERE version_id = ?")
              .all(version.id)) as Array<{ id: string }>;
            for (const section of existingSections) {
              validSectionIds.add(section.id);
            }
          }

          const lineItems = payload.line_items ?? [];
          if (lineItems.length > 0) {
            const itemValues: unknown[] = [];
            const itemPlaceholders: string[] = [];
            let sortOrder = 0;
            for (const item of lineItems) {
              const lineItemId = crypto.randomUUID();
              let sectionId: string | null = null;
              if (item.section_id) {
                if (shouldReplaceSections) {
                  sectionId = sectionIdMap.get(item.section_id) ?? null;
                } else if (validSectionIds.has(item.section_id)) {
                  sectionId = item.section_id;
                }
              }

              itemPlaceholders.push("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
              itemValues.push(
                lineItemId,
                version.id,
                sectionId,
                item.item_name,
                item.description,
                item.quantity,
                item.unit,
                item.unit_cost,
                item.unit_price,
                item.notes ?? null,
                item.is_excluded ? 1 : 0,
                sortOrder
              );
              sortOrder += 1;
            }
            await db.run(
              `INSERT INTO estimate_line_items (id, version_id, section_id, item_name, description, quantity, unit, unit_cost, unit_price, notes, is_excluded, sort_order) VALUES ${itemPlaceholders.join(", ")}`,
              itemValues
            );
          }

          const computedTotal = lineItems.reduce(
            (sum, item) => sum + item.quantity * item.unit_price,
            0
          );
          const total = payload.total ?? computedTotal;
          await db
            .prepare("UPDATE estimate_versions SET total = ? WHERE id = ?")
            .run(total, version.id);
        } else if (payload.total !== undefined) {
          await db
            .prepare("UPDATE estimate_versions SET total = ? WHERE id = ?")
            .run(payload.total, version.id);
        }
      });
    }

    // Get updated timestamp to return to client
    const updated = (await db
      .prepare("SELECT updated_at FROM estimates WHERE id = ?")
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

// DELETE /api/estimates/:id - Delete an estimate
export async function deleteEstimate(req: BunRequest): Promise<Response> {
  try {
    const id = parseEstimateId(req.params.id);
    if (!id) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const estimate = await db
      .prepare("SELECT id FROM estimates WHERE id = ?")
      .get(id);

    if (!estimate) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    await db.prepare("DELETE FROM estimates WHERE id = ?").run(id);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to delete estimate:", error);
    return Response.json(
      { error: "Failed to delete estimate" },
      { status: 500 }
    );
  }
}

// GET /api/estimates/:id/pdf - Generate and download PDF
export async function getEstimatePdf(req: BunRequest): Promise<Response> {
  try {
    const id = parseEstimateId(req.params.id);
    if (!id) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const estimate = (await db
      .prepare("SELECT * FROM estimates WHERE id = ?")
      .get(id)) as EstimateRow | undefined;

    if (!estimate) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const version = await getPreferredEstimateVersion(id);

    const sectionsData = version
      ? ((await db
          .prepare(
            "SELECT * FROM estimate_sections WHERE version_id = ? ORDER BY sort_order"
          )
          .all(version.id)) as EstimateSectionRow[])
      : [];

    const lineItemsData = version
      ? ((await db
          .prepare(
            "SELECT * FROM estimate_line_items WHERE version_id = ? ORDER BY sort_order"
          )
          .all(version.id)) as EstimateLineItemRow[])
      : [];

    // Convert to EditorEstimate format
    const sections: EditorSection[] = sectionsData.map((s) => ({
      id: s.id,
      name: s.name,
    }));

    const lineItems: EditorLineItem[] = lineItemsData.map((item) => ({
      id: item.id,
      item: item.item_name || item.description,
      description: item.description || item.notes || "",
      qty: item.quantity,
      uom: item.unit,
      cost: item.unit_price,
      total: item.quantity * item.unit_price,
      sectionId: item.section_id || undefined,
      isAlternate: item.is_excluded === 1,
    }));

    const total = lineItems.reduce((sum, item) => sum + item.total, 0);

    const editorEstimate: EditorEstimate = {
      estimateNumber:
        estimate.base_number ?? estimate.estimate_number ?? estimate.name,
      date: estimate.created_at || new Date().toISOString(),
      estimator: estimate.estimator || "",
      estimatorEmail: estimate.estimator_email || "",
      billTo: {
        companyName: estimate.client_name || "",
        address: estimate.client_address || "",
        email: estimate.client_email || "",
        phone: estimate.client_phone || "",
      },
      jobInfo: {
        siteName: estimate.job_name || estimate.name || "",
        address: estimate.job_address || "",
      },
      sections,
      lineItems,
      total,
    };

    const pdfBytes = await generateEstimatePDF(editorEstimate);
    const filename = getEstimatePDFFilename(editorEstimate);

    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBytes.length.toString(),
      },
    });
  } catch (error) {
    console.error("Failed to generate PDF:", error);
    return Response.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}

// POST /api/estimates/:id/duplicate - Duplicate an estimate
export async function duplicateEstimate(req: BunRequest): Promise<Response> {
  try {
    const id = parseEstimateId(req.params.id);
    if (!id) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const originalEstimate = (await db
      .prepare("SELECT * FROM estimates WHERE id = ?")
      .get(id)) as EstimateRow | undefined;

    if (!originalEstimate) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const originalVersion = await getPreferredEstimateVersion(id);

    const originalSections = originalVersion
      ? ((await db
          .prepare(
            "SELECT * FROM estimate_sections WHERE version_id = ? ORDER BY sort_order"
          )
          .all(originalVersion.id)) as EstimateSectionRow[])
      : [];

    const originalLineItems = originalVersion
      ? ((await db
          .prepare(
            "SELECT * FROM estimate_line_items WHERE version_id = ? ORDER BY sort_order"
          )
          .all(originalVersion.id)) as EstimateLineItemRow[])
      : [];

    // Create new estimate in a transaction
    const newBaseNumber = await getNextBaseNumber();

    const result = await db.transaction(async () => {
      const insertResult = await db.run(
        `INSERT INTO estimates (base_number, takeoff_id, name, job_name, job_address, client_name, client_address, client_email, client_phone, notes, bid_status, status, is_locked)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
        [
          newBaseNumber,
          originalEstimate.takeoff_id,
          `${originalEstimate.name} (Copy)`,
          `${originalEstimate.job_name || originalEstimate.name} (Copy)`,
          originalEstimate.job_address,
          originalEstimate.client_name,
          originalEstimate.client_address,
          originalEstimate.client_email,
          originalEstimate.client_phone,
          originalEstimate.notes,
          "draft",
          "draft",
          0,
        ]
      );
      const newEstimateId = (
        insertResult as unknown as Array<{ id: number }>
      )[0].id;

      // Create new version
      const newVersionId = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO estimate_versions (id, estimate_id, version_number, total, is_current)
         VALUES (?, ?, 1, ?, 1)`
        )
        .run(newVersionId, newEstimateId, originalVersion?.total ?? 0);

      // Copy sections (batch insert)
      const sectionIdMap = new Map<string, string>();
      if (originalSections.length > 0) {
        const sectionValues: unknown[] = [];
        const sectionPlaceholders: string[] = [];
        for (const section of originalSections) {
          const newSectionId = crypto.randomUUID();
          sectionIdMap.set(section.id, newSectionId);
          sectionPlaceholders.push("(?, ?, ?, ?, ?, ?)");
          sectionValues.push(
            newSectionId,
            newVersionId,
            section.name,
            section.title,
            section.show_subtotal,
            section.sort_order
          );
        }
        await db.run(
          `INSERT INTO estimate_sections (id, version_id, name, title, show_subtotal, sort_order) VALUES ${sectionPlaceholders.join(", ")}`,
          sectionValues
        );
      }

      // Copy line items (batch insert)
      if (originalLineItems.length > 0) {
        const itemValues: unknown[] = [];
        const itemPlaceholders: string[] = [];
        for (const item of originalLineItems) {
          const newLineItemId = crypto.randomUUID();
          const newSectionId = item.section_id
            ? (sectionIdMap.get(item.section_id) ?? null)
            : null;
          itemPlaceholders.push("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
          itemValues.push(
            newLineItemId,
            newVersionId,
            newSectionId,
            item.item_name || null,
            item.description,
            item.quantity,
            item.unit,
            item.unit_cost,
            item.unit_price,
            item.notes,
            item.is_excluded,
            item.sort_order
          );
        }
        await db.run(
          `INSERT INTO estimate_line_items (id, version_id, section_id, item_name, description, quantity, unit, unit_cost, unit_price, notes, is_excluded, sort_order) VALUES ${itemPlaceholders.join(", ")}`,
          itemValues
        );
      }

      return { id: newEstimateId, base_number: newBaseNumber };
    });

    return Response.json(result);
  } catch (error) {
    console.error("Failed to duplicate estimate:", error);
    return Response.json(
      { error: "Failed to duplicate estimate" },
      { status: 500 }
    );
  }
}

// GET /api/estimates/:id/takeoff - Get linked takeoff
export async function getEstimateTakeoff(req: BunRequest): Promise<Response> {
  try {
    const id = parseEstimateId(req.params.id);
    if (!id) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const estimate = (await db
      .prepare("SELECT takeoff_id FROM estimates WHERE id = ?")
      .get(id)) as { takeoff_id: string | null } | undefined;

    if (!estimate?.takeoff_id) {
      return Response.json({ takeoff: null });
    }

    const takeoff = (await db
      .prepare(
        `SELECT id, name, status, created_at, updated_at
         FROM takeoffs
         WHERE id = ?`
      )
      .get(estimate.takeoff_id)) as
      | {
          id: string;
          name: string;
          status: string;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!takeoff) {
      return Response.json({ takeoff: null });
    }

    return Response.json({ takeoff });
  } catch (error) {
    console.error("Failed to get linked takeoff:", error);
    return Response.json(
      { error: "Failed to get linked takeoff" },
      { status: 500 }
    );
  }
}
