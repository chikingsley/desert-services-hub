import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

interface BundleItemRow {
  id: string;
  bundle_id: string;
  item_id: string;
  is_required: number;
  quantity_multiplier: number;
  sort_order: number;
}

interface CatalogItemRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  price: number;
}

// POST /api/catalog/bundles/[id]/items - Add item to bundle
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bundleId } = await params;

  try {
    // Verify bundle exists
    const bundle = db
      .prepare("SELECT id FROM catalog_takeoff_bundles WHERE id = ?")
      .get(bundleId);

    if (!bundle) {
      return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
    }

    const body = await request.json();
    const { itemId, isRequired = true, quantityMultiplier = 1.0 } = body;

    if (!itemId) {
      return NextResponse.json(
        { error: "Item ID is required" },
        { status: 400 }
      );
    }

    // Verify item exists
    const item = db
      .prepare("SELECT * FROM catalog_items WHERE id = ?")
      .get(itemId) as CatalogItemRow | undefined;

    if (!item) {
      return NextResponse.json(
        { error: "Catalog item not found" },
        { status: 404 }
      );
    }

    // Check if item already in bundle
    const existing = db
      .prepare(
        "SELECT id FROM catalog_bundle_items WHERE bundle_id = ? AND item_id = ?"
      )
      .get(bundleId, itemId);

    if (existing) {
      return NextResponse.json(
        { error: "Item already in bundle" },
        { status: 400 }
      );
    }

    // Get next sort order
    const maxOrder = db
      .prepare(
        "SELECT MAX(sort_order) as max FROM catalog_bundle_items WHERE bundle_id = ?"
      )
      .get(bundleId) as { max: number | null } | undefined;
    const sortOrder = (maxOrder?.max ?? -1) + 1;

    const id = randomUUID();
    db.prepare(
      `
      INSERT INTO catalog_bundle_items (id, bundle_id, item_id, is_required, quantity_multiplier, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      bundleId,
      itemId,
      isRequired ? 1 : 0,
      quantityMultiplier,
      sortOrder
    );

    return NextResponse.json({
      id,
      itemId: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      price: item.price,
      isRequired,
      quantityMultiplier,
      sortOrder,
    });
  } catch (error) {
    console.error("Error adding item to bundle:", error);
    return NextResponse.json(
      { error: "Failed to add item to bundle" },
      { status: 500 }
    );
  }
}

// DELETE /api/catalog/bundles/[id]/items - Remove item from bundle
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bundleId } = await params;

  try {
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get("itemId");

    if (!itemId) {
      return NextResponse.json(
        { error: "Item ID is required" },
        { status: 400 }
      );
    }

    const bundleItem = db
      .prepare(
        "SELECT id FROM catalog_bundle_items WHERE bundle_id = ? AND item_id = ?"
      )
      .get(bundleId, itemId) as BundleItemRow | undefined;

    if (!bundleItem) {
      return NextResponse.json(
        { error: "Item not in bundle" },
        { status: 404 }
      );
    }

    db.prepare(
      "DELETE FROM catalog_bundle_items WHERE bundle_id = ? AND item_id = ?"
    ).run(bundleId, itemId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing item from bundle:", error);
    return NextResponse.json(
      { error: "Failed to remove item from bundle" },
      { status: 500 }
    );
  }
}

// PUT /api/catalog/bundles/[id]/items - Update item in bundle (isRequired, multiplier)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bundleId } = await params;

  try {
    const body = await request.json();
    const { itemId, isRequired, quantityMultiplier, sortOrder } = body;

    if (!itemId) {
      return NextResponse.json(
        { error: "Item ID is required" },
        { status: 400 }
      );
    }

    const bundleItem = db
      .prepare(
        "SELECT * FROM catalog_bundle_items WHERE bundle_id = ? AND item_id = ?"
      )
      .get(bundleId, itemId) as BundleItemRow | undefined;

    if (!bundleItem) {
      return NextResponse.json(
        { error: "Item not in bundle" },
        { status: 404 }
      );
    }

    const updates: string[] = [];
    const values: (number | string)[] = [];

    if (isRequired !== undefined) {
      updates.push("is_required = ?");
      values.push(isRequired ? 1 : 0);
    }
    if (quantityMultiplier !== undefined) {
      updates.push("quantity_multiplier = ?");
      values.push(quantityMultiplier);
    }
    if (sortOrder !== undefined) {
      updates.push("sort_order = ?");
      values.push(sortOrder);
    }

    if (updates.length > 0) {
      values.push(bundleId, itemId);
      db.prepare(
        `UPDATE catalog_bundle_items SET ${updates.join(", ")} WHERE bundle_id = ? AND item_id = ?`
      ).run(...values);
    }

    // Get updated item with catalog details
    const item = db
      .prepare("SELECT * FROM catalog_items WHERE id = ?")
      .get(itemId) as CatalogItemRow;

    const updated = db
      .prepare(
        "SELECT * FROM catalog_bundle_items WHERE bundle_id = ? AND item_id = ?"
      )
      .get(bundleId, itemId) as BundleItemRow;

    return NextResponse.json({
      id: updated.id,
      itemId: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      price: item.price,
      isRequired: updated.is_required === 1,
      quantityMultiplier: updated.quantity_multiplier,
      sortOrder: updated.sort_order,
    });
  } catch (error) {
    console.error("Error updating bundle item:", error);
    return NextResponse.json(
      { error: "Failed to update bundle item" },
      { status: 500 }
    );
  }
}
