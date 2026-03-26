import { db, type SqlParam } from "@lib/db/client";
import type {
  EstimateLineItemRow,
  EstimateRow,
  EstimateSectionRow,
} from "@lib/db/types";
import {
  type BunRequest,
  getNextBaseNumber,
  getPreferredEstimateVersion,
  parseEstimateId,
} from "@/api/estimates/by-id/shared";

export async function handleDuplicateEstimate(
  req: BunRequest
): Promise<Response> {
  try {
    const id = parseEstimateId(req.params.id);
    if (!id) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const originalEstimate = (await db
      .query("SELECT * FROM estimates WHERE id = $1")
      .get(id)) as EstimateRow | undefined;

    if (!originalEstimate) {
      return Response.json({ error: "Estimate not found" }, { status: 404 });
    }

    const originalVersion = await getPreferredEstimateVersion(id);

    const originalSections = originalVersion
      ? ((await db
          .query(
            "SELECT * FROM estimate_sections WHERE version_id = $1 ORDER BY sort_order"
          )
          .all(originalVersion.id)) as EstimateSectionRow[])
      : [];

    const originalLineItems = originalVersion
      ? ((await db
          .query(
            "SELECT * FROM estimate_line_items WHERE version_id = $1 ORDER BY sort_order"
          )
          .all(originalVersion.id)) as EstimateLineItemRow[])
      : [];

    const newBaseNumber = await getNextBaseNumber();

    const result = await db.transaction(async () => {
      const insertResult = await db.run(
        `INSERT INTO estimates (base_number, takeoff_id, name, job_name, job_address, contractor, client_address, estimator, estimator_email, notes, status, is_locked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          newBaseNumber,
          originalEstimate.takeoff_id,
          `${originalEstimate.name} (Copy)`,
          `${originalEstimate.job_name ?? "Untitled Estimate"} (Copy)`,
          originalEstimate.job_address,
          originalEstimate.contractor,
          originalEstimate.client_address,
          originalEstimate.estimator,
          originalEstimate.estimator_email,
          originalEstimate.notes,
          "draft",
          0,
        ]
      );

      const newEstimateId = (
        insertResult as unknown as Array<{ id: number }>
      )[0].id;

      const newVersionId = crypto.randomUUID();
      await db
        .query(
          `INSERT INTO estimate_versions (id, estimate_id, version_number, total, is_current)
           VALUES ($1, $2, 1, $3, 1)`
        )
        .run(newVersionId, newEstimateId, originalVersion?.total ?? 0);

      const sectionIdMap = new Map<string, string>();
      if (originalSections.length > 0) {
        const sectionValues: SqlParam[] = [];
        const sectionPlaceholders: string[] = [];

        for (const section of originalSections) {
          const newSectionId = crypto.randomUUID();
          sectionIdMap.set(section.id, newSectionId);

          const offset = sectionValues.length;
          sectionPlaceholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`
          );
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

      if (originalLineItems.length > 0) {
        const itemValues: SqlParam[] = [];
        const itemPlaceholders: string[] = [];

        for (const item of originalLineItems) {
          const newLineItemId = crypto.randomUUID();
          const newSectionId = item.section_id
            ? (sectionIdMap.get(item.section_id) ?? null)
            : null;

          const offset = itemValues.length;
          itemPlaceholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`
          );
          itemValues.push(
            newLineItemId,
            newVersionId,
            newSectionId,
            item.item_name || null,
            item.description,
            item.quantity,
            item.unit,
            item.unit_price,
            item.notes,
            item.is_excluded,
            item.sort_order
          );
        }

        await db.run(
          `INSERT INTO estimate_line_items (id, version_id, section_id, item_name, description, quantity, unit, unit_price, notes, is_excluded, sort_order) VALUES ${itemPlaceholders.join(", ")}`,
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
