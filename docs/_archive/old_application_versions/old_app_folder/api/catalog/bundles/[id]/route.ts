import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

interface BundleRow {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  tool_type: string;
  color: string;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface BundleItemRow {
  id: string;
  bundle_id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  item_unit: string;
  item_price: number;
  is_required: number;
  quantity_multiplier: number;
  sort_order: number;
}

// GET /api/catalog/bundles/[id] - Get single bundle with items
export function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return params.then(({ id }) => {
    try {
      const bundle = db
        .prepare("SELECT * FROM catalog_takeoff_bundles WHERE id = ?")
        .get(id) as BundleRow | undefined;

      if (!bundle) {
        return NextResponse.json(
          { error: "Bundle not found" },
          { status: 404 }
        );
      }

      const items = db
        .prepare(
          `
          SELECT
            bi.id,
            bi.bundle_id,
            bi.item_id,
            i.code as item_code,
            i.name as item_name,
            i.unit as item_unit,
            i.price as item_price,
            bi.is_required,
            bi.quantity_multiplier,
            bi.sort_order
          FROM catalog_bundle_items bi
          JOIN catalog_items i ON bi.item_id = i.id
          WHERE bi.bundle_id = ?
          ORDER BY bi.sort_order
        `
        )
        .all(id) as BundleItemRow[];

      return NextResponse.json({
        id: bundle.id,
        name: bundle.name,
        description: bundle.description,
        unit: bundle.unit,
        toolType: bundle.tool_type,
        color: bundle.color,
        isActive: bundle.is_active === 1,
        sortOrder: bundle.sort_order,
        createdAt: bundle.created_at,
        updatedAt: bundle.updated_at,
        items: items.map((item) => ({
          id: item.id,
          itemId: item.item_id,
          code: item.item_code,
          name: item.item_name,
          unit: item.item_unit,
          price: item.item_price,
          isRequired: item.is_required === 1,
          quantityMultiplier: item.quantity_multiplier,
          sortOrder: item.sort_order,
        })),
      });
    } catch (error) {
      console.error("Error fetching bundle:", error);
      return NextResponse.json(
        { error: "Failed to fetch bundle" },
        { status: 500 }
      );
    }
  });
}

// PUT /api/catalog/bundles/[id] - Update bundle
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const bundle = db
      .prepare("SELECT * FROM catalog_takeoff_bundles WHERE id = ?")
      .get(id) as BundleRow | undefined;

    if (!bundle) {
      return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
    }

    const body = await request.json();
    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (body.name !== undefined) {
      updates.push("name = ?");
      values.push(body.name.trim());
    }
    if (body.description !== undefined) {
      updates.push("description = ?");
      values.push(body.description);
    }
    if (body.unit !== undefined) {
      updates.push("unit = ?");
      values.push(body.unit);
    }
    if (body.toolType !== undefined) {
      updates.push("tool_type = ?");
      values.push(body.toolType);
    }
    if (body.color !== undefined) {
      updates.push("color = ?");
      values.push(body.color);
    }
    if (body.isActive !== undefined) {
      updates.push("is_active = ?");
      values.push(body.isActive ? 1 : 0);
    }
    if (body.sortOrder !== undefined) {
      updates.push("sort_order = ?");
      values.push(body.sortOrder);
    }

    if (updates.length > 0) {
      updates.push("updated_at = CURRENT_TIMESTAMP");
      values.push(id);

      db.prepare(
        `UPDATE catalog_takeoff_bundles SET ${updates.join(", ")} WHERE id = ?`
      ).run(...values);
    }

    // Return updated bundle
    const updated = db
      .prepare("SELECT * FROM catalog_takeoff_bundles WHERE id = ?")
      .get(id) as BundleRow;

    const items = db
      .prepare(
        `
        SELECT
          bi.id,
          bi.bundle_id,
          bi.item_id,
          i.code as item_code,
          i.name as item_name,
          i.unit as item_unit,
          i.price as item_price,
          bi.is_required,
          bi.quantity_multiplier,
          bi.sort_order
        FROM catalog_bundle_items bi
        JOIN catalog_items i ON bi.item_id = i.id
        WHERE bi.bundle_id = ?
        ORDER BY bi.sort_order
      `
      )
      .all(id) as BundleItemRow[];

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      unit: updated.unit,
      toolType: updated.tool_type,
      color: updated.color,
      isActive: updated.is_active === 1,
      sortOrder: updated.sort_order,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
      items: items.map((item) => ({
        id: item.id,
        itemId: item.item_id,
        code: item.item_code,
        name: item.item_name,
        unit: item.item_unit,
        price: item.item_price,
        isRequired: item.is_required === 1,
        quantityMultiplier: item.quantity_multiplier,
        sortOrder: item.sort_order,
      })),
    });
  } catch (error) {
    console.error("Error updating bundle:", error);
    return NextResponse.json(
      { error: "Failed to update bundle" },
      { status: 500 }
    );
  }
}

// DELETE /api/catalog/bundles/[id] - Delete bundle
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const bundle = db
      .prepare("SELECT * FROM catalog_takeoff_bundles WHERE id = ?")
      .get(id) as BundleRow | undefined;

    if (!bundle) {
      return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
    }

    // Delete bundle items first (cascade should handle this, but be explicit)
    db.prepare("DELETE FROM catalog_bundle_items WHERE bundle_id = ?").run(id);
    db.prepare("DELETE FROM catalog_takeoff_bundles WHERE id = ?").run(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting bundle:", error);
    return NextResponse.json(
      { error: "Failed to delete bundle" },
      { status: 500 }
    );
  }
}
