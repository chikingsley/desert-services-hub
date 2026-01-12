import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { CatalogItemRow } from "@/lib/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/catalog/items/[id] - Get a single item
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const item = db
      .prepare("SELECT * FROM catalog_items WHERE id = ?")
      .get(id) as CatalogItemRow | undefined;

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: item.id,
      categoryId: item.category_id,
      subcategoryId: item.subcategory_id,
      code: item.code,
      name: item.name,
      description: item.description,
      price: item.price,
      unit: item.unit,
      notes: item.notes,
      defaultQty: item.default_qty,
      isActive: item.is_active === 1,
      isTakeoffItem: item.is_takeoff_item === 1,
      sortOrder: item.sort_order,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    });
  } catch (error) {
    console.error("Error fetching item:", error);
    return NextResponse.json(
      { error: "Failed to fetch item" },
      { status: 500 }
    );
  }
}

// PUT /api/catalog/items/[id] - Update an item
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      code,
      name,
      description,
      price,
      unit,
      notes,
      defaultQty,
      isActive,
      isTakeoffItem,
      sortOrder,
    } = body;

    const existing = db
      .prepare("SELECT * FROM catalog_items WHERE id = ?")
      .get(id) as CatalogItemRow | undefined;

    if (!existing) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (code !== undefined) {
      updates.push("code = ?");
      values.push(String(code).trim());
    }
    if (name !== undefined) {
      updates.push("name = ?");
      values.push(String(name).trim());
    }
    if (description !== undefined) {
      updates.push("description = ?");
      values.push(description === null ? null : String(description));
    }
    if (price !== undefined) {
      updates.push("price = ?");
      values.push(Number(price));
    }
    if (unit !== undefined) {
      updates.push("unit = ?");
      values.push(String(unit));
    }
    if (notes !== undefined) {
      updates.push("notes = ?");
      values.push(notes === null ? null : String(notes));
    }
    if (defaultQty !== undefined) {
      updates.push("default_qty = ?");
      values.push(Number(defaultQty));
    }
    if (isActive !== undefined) {
      updates.push("is_active = ?");
      values.push(isActive ? 1 : 0);
    }
    if (isTakeoffItem !== undefined) {
      updates.push("is_takeoff_item = ?");
      values.push(isTakeoffItem ? 1 : 0);
    }
    if (sortOrder !== undefined) {
      updates.push("sort_order = ?");
      values.push(Number(sortOrder));
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(id);

      db.prepare(`
        UPDATE catalog_items SET ${updates.join(", ")} WHERE id = ?
      `).run(...values);
    }

    const item = db
      .prepare("SELECT * FROM catalog_items WHERE id = ?")
      .get(id) as CatalogItemRow;

    return NextResponse.json({
      id: item.id,
      categoryId: item.category_id,
      subcategoryId: item.subcategory_id,
      code: item.code,
      name: item.name,
      description: item.description,
      price: item.price,
      unit: item.unit,
      notes: item.notes,
      defaultQty: item.default_qty,
      isActive: item.is_active === 1,
      isTakeoffItem: item.is_takeoff_item === 1,
      sortOrder: item.sort_order,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    });
  } catch (error) {
    console.error("Error updating item:", error);
    return NextResponse.json(
      { error: "Failed to update item" },
      { status: 500 }
    );
  }
}

// DELETE /api/catalog/items/[id] - Delete an item
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const existing = db
      .prepare("SELECT * FROM catalog_items WHERE id = ?")
      .get(id) as CatalogItemRow | undefined;

    if (!existing) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    db.prepare("DELETE FROM catalog_items WHERE id = ?").run(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting item:", error);
    return NextResponse.json(
      { error: "Failed to delete item" },
      { status: 500 }
    );
  }
}
