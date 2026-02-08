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
  EstimateSection,
  EstimateSectionRow,
  EstimateVersionRow,
} from "@lib/db/types";
import {
  generateEstimatePDF,
  getEstimatePDFFilename,
} from "@lib/pdf/estimate/generate-estimate-pdf.server";
import { generateBaseNumber } from "@lib/utils";

// Bun extends Request with params from route matching
type BunRequest = Request & { params: { id: string } };

interface EstimateLineItemInput {
  section_id?: string;
  description?: string;
  item?: string;
  quantity?: number;
  qty?: number;
  unit?: string;
  uom?: string;
  unit_cost?: number;
  cost?: number;
  unit_price?: number;
  notes?: string;
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
    const { id } = req.params;

    const estimate = (await db
      .prepare("SELECT * FROM estimates WHERE id = ?")
      .get(id)) as EstimateRow | undefined;

    if (!estimate) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const version = (await db
      .prepare(
        "SELECT * FROM estimate_versions WHERE estimate_id = ? AND is_current = 1"
      )
      .get(id)) as EstimateVersionRow | undefined;

    if (!version) {
      return Response.json(
        { error: "No current version found" },
        { status: 404 }
      );
    }

    const sections = (await db
      .prepare(
        "SELECT * FROM estimate_sections WHERE version_id = ? ORDER BY sort_order"
      )
      .all(version.id)) as EstimateSectionRow[];

    const lineItems = (await db
      .prepare(
        "SELECT * FROM estimate_line_items WHERE version_id = ? ORDER BY sort_order"
      )
      .all(version.id)) as EstimateLineItemRow[];

    return Response.json({
      ...estimate,
      current_version: {
        ...version,
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
    const { id } = req.params;
    const body = (await req.json()) as Record<string, unknown>;

    // Update estimate metadata
    const jobName = (body.job_name as string) || "Untitled Estimate";
    const updateFields = [
      "base_number = ?",
      "name = ?",
      "job_address = ?",
      "client_name = ?",
      "client_email = ?",
      "client_phone = ?",
      "notes = ?",
      "bid_status = ?",
      "updated_at = now()",
    ];
    const updateValues: (string | null)[] = [
      body.base_number as string,
      jobName,
      (body.job_address as string) || null,
      (body.client_name as string) || null,
      (body.client_email as string) || null,
      (body.client_phone as string) || null,
      (body.notes as string) || null,
      (body.status as string) || "draft",
    ];

    // Only update takeoff_id if explicitly provided
    if ("takeoff_id" in body) {
      updateFields.push("takeoff_id = ?");
      updateValues.push((body.takeoff_id as string) || null);
    }

    updateValues.push(id);

    await db
      .prepare(`UPDATE estimates SET ${updateFields.join(", ")} WHERE id = ?`)
      .run(...updateValues);

    // Get current version
    const version = (await db
      .prepare(
        "SELECT id FROM estimate_versions WHERE estimate_id = ? AND is_current = 1"
      )
      .get(id)) as { id: string } | undefined;

    if (version) {
      await db.transaction(async () => {
        // Delete existing sections and line items
        await db
          .prepare("DELETE FROM estimate_line_items WHERE version_id = ?")
          .run(version.id);
        await db
          .prepare("DELETE FROM estimate_sections WHERE version_id = ?")
          .run(version.id);

        // Re-create sections
        const sectionIdMap = new Map<string, string>();
        const sections = body.sections as EstimateSection[] | undefined;
        if (sections && sections.length > 0) {
          const sectionValues: unknown[] = [];
          const sectionPlaceholders: string[] = [];
          let sortOrder = 0;
          for (const section of sections) {
            const sectionId = crypto.randomUUID();
            sectionIdMap.set(section.id, sectionId);
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

        // Re-create line items
        const lineItems = body.line_items as
          | EstimateLineItemInput[]
          | undefined;
        if (lineItems && lineItems.length > 0) {
          const itemValues: unknown[] = [];
          const itemPlaceholders: string[] = [];
          let sortOrder = 0;
          for (const item of lineItems) {
            const lineItemId = crypto.randomUUID();
            const cost = item.cost ?? 0;
            itemPlaceholders.push("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            itemValues.push(
              lineItemId,
              version.id,
              item.section_id
                ? (sectionIdMap.get(item.section_id) ?? null)
                : null,
              item.item || item.description || "",
              item.quantity ?? item.qty ?? 1,
              item.unit || item.uom || "EA",
              item.unit_cost ?? cost * 0.7,
              item.unit_price ?? cost,
              item.notes ||
                (item.item &&
                item.description &&
                item.description.trim() &&
                item.item !== item.description
                  ? item.description
                  : null) ||
                null,
              sortOrder
            );
            sortOrder += 1;
          }
          await db.run(
            `INSERT INTO estimate_line_items (id, version_id, section_id, description, quantity, unit, unit_cost, unit_price, notes, sort_order) VALUES ${itemPlaceholders.join(", ")}`,
            itemValues
          );
        }

        // Update version total
        await db
          .prepare("UPDATE estimate_versions SET total = ? WHERE id = ?")
          .run((body.total as number) || 0, version.id);
      });
    }

    // Get updated timestamp to return to client
    const updated = (await db
      .prepare("SELECT updated_at FROM estimates WHERE id = ?")
      .get(id)) as { updated_at: string } | null;

    return Response.json({ success: true, updated_at: updated?.updated_at });
  } catch (error) {
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
    const { id } = req.params;

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
    const { id } = req.params;

    const estimate = (await db
      .prepare("SELECT * FROM estimates WHERE id = ?")
      .get(id)) as EstimateRow | undefined;

    if (!estimate) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const version = (await db
      .prepare(
        "SELECT * FROM estimate_versions WHERE estimate_id = ? AND is_current = 1"
      )
      .get(id)) as EstimateVersionRow | undefined;

    if (!version) {
      return Response.json(
        { error: "No current version found" },
        { status: 404 }
      );
    }

    const sectionsData = (await db
      .prepare(
        "SELECT * FROM estimate_sections WHERE version_id = ? ORDER BY sort_order"
      )
      .all(version.id)) as EstimateSectionRow[];

    const lineItemsData = (await db
      .prepare(
        "SELECT * FROM estimate_line_items WHERE version_id = ? ORDER BY sort_order"
      )
      .all(version.id)) as EstimateLineItemRow[];

    // Convert to EditorEstimate format
    const sections: EditorSection[] = sectionsData.map((s) => ({
      id: s.id,
      name: s.name,
    }));

    const lineItems: EditorLineItem[] = lineItemsData.map((item) => ({
      id: item.id,
      item: item.description,
      description: item.notes || "",
      qty: item.quantity,
      uom: item.unit,
      cost: item.unit_price,
      total: item.quantity * item.unit_price,
      sectionId: item.section_id || undefined,
    }));

    const total = lineItems.reduce((sum, item) => sum + item.total, 0);

    const editorEstimate: EditorEstimate = {
      estimateNumber:
        estimate.base_number ?? estimate.estimate_number ?? estimate.name,
      date: estimate.created_at || new Date().toISOString(),
      estimator: "",
      estimatorEmail: estimate.estimator_email || "",
      billTo: {
        companyName: estimate.client_name || "",
        address: estimate.client_address || "",
        email: estimate.client_email || "",
        phone: estimate.client_phone || "",
      },
      jobInfo: {
        siteName: estimate.name || "",
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
    const { id } = req.params;

    const originalEstimate = (await db
      .prepare("SELECT * FROM estimates WHERE id = ?")
      .get(id)) as EstimateRow | undefined;

    if (!originalEstimate) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const originalVersion = (await db
      .prepare(
        "SELECT * FROM estimate_versions WHERE estimate_id = ? AND is_current = 1"
      )
      .get(id)) as EstimateVersionRow | undefined;

    if (!originalVersion) {
      return Response.json(
        { error: "No current version found" },
        { status: 404 }
      );
    }

    const originalSections = (await db
      .prepare(
        "SELECT * FROM estimate_sections WHERE version_id = ? ORDER BY sort_order"
      )
      .all(originalVersion.id)) as EstimateSectionRow[];

    const originalLineItems = (await db
      .prepare(
        "SELECT * FROM estimate_line_items WHERE version_id = ? ORDER BY sort_order"
      )
      .all(originalVersion.id)) as EstimateLineItemRow[];

    // Create new estimate in a transaction
    const newBaseNumber = await getNextBaseNumber();

    const result = await db.transaction(async () => {
      const insertResult = await db.run(
        `INSERT INTO estimates (base_number, takeoff_id, name, job_address, client_name, client_email, client_phone, notes, bid_status, is_locked)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
        [
          newBaseNumber,
          originalEstimate.takeoff_id,
          `${originalEstimate.name} (Copy)`,
          originalEstimate.job_address,
          originalEstimate.client_name,
          originalEstimate.client_email,
          originalEstimate.client_phone,
          originalEstimate.notes,
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
        .run(newVersionId, newEstimateId, originalVersion.total);

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
          itemPlaceholders.push("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
          itemValues.push(
            newLineItemId,
            newVersionId,
            newSectionId,
            item.description,
            item.quantity,
            item.unit,
            item.unit_cost,
            item.unit_price,
            item.notes,
            item.sort_order
          );
        }
        await db.run(
          `INSERT INTO estimate_line_items (id, version_id, section_id, description, quantity, unit, unit_cost, unit_price, notes, sort_order) VALUES ${itemPlaceholders.join(", ")}`,
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
    const { id } = req.params;

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
