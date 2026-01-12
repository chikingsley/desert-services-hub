import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { CatalogItemRow, CatalogSubcategoryRow } from "@/lib/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/catalog/subcategories/[id] - Get a single subcategory with items
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const subcategory = db
      .prepare("SELECT * FROM catalog_subcategories WHERE id = ?")
      .get(id) as CatalogSubcategoryRow | undefined;

    if (!subcategory) {
      return NextResponse.json(
        { error: "Subcategory not found" },
        { status: 404 }
      );
    }

    const items = db
      .prepare(
        "SELECT * FROM catalog_items WHERE subcategory_id = ? ORDER BY sort_order"
      )
      .all(id) as CatalogItemRow[];

    return NextResponse.json({
      id: subcategory.id,
      categoryId: subcategory.category_id,
      name: subcategory.name,
      selectionMode: subcategory.selection_mode,
      hidden: subcategory.hidden === 1,
      sortOrder: subcategory.sort_order,
      createdAt: subcategory.created_at,
      updatedAt: subcategory.updated_at,
      items: items.map((item) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        description: item.description,
        price: item.price,
        unit: item.unit,
        notes: item.notes,
        defaultQty: item.default_qty,
        isActive: item.is_active === 1,
        sortOrder: item.sort_order,
      })),
    });
  } catch (error) {
    console.error("Error fetching subcategory:", error);
    return NextResponse.json(
      { error: "Failed to fetch subcategory" },
      { status: 500 }
    );
  }
}

// PUT /api/catalog/subcategories/[id] - Update a subcategory
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, selectionMode, hidden, sortOrder } = body;

    const existing = db
      .prepare("SELECT * FROM catalog_subcategories WHERE id = ?")
      .get(id) as CatalogSubcategoryRow | undefined;

    if (!existing) {
      return NextResponse.json(
        { error: "Subcategory not found" },
        { status: 404 }
      );
    }

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (name !== undefined) {
      updates.push("name = ?");
      values.push(String(name).trim());
    }
    if (selectionMode !== undefined) {
      updates.push("selection_mode = ?");
      values.push(String(selectionMode));
    }
    if (hidden !== undefined) {
      updates.push("hidden = ?");
      values.push(hidden ? 1 : 0);
    }
    if (sortOrder !== undefined) {
      updates.push("sort_order = ?");
      values.push(Number(sortOrder));
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(id);

      db.prepare(`
        UPDATE catalog_subcategories SET ${updates.join(", ")} WHERE id = ?
      `).run(...values);
    }

    const subcategory = db
      .prepare("SELECT * FROM catalog_subcategories WHERE id = ?")
      .get(id) as CatalogSubcategoryRow;

    return NextResponse.json({
      id: subcategory.id,
      categoryId: subcategory.category_id,
      name: subcategory.name,
      selectionMode: subcategory.selection_mode,
      hidden: subcategory.hidden === 1,
      sortOrder: subcategory.sort_order,
      createdAt: subcategory.created_at,
      updatedAt: subcategory.updated_at,
    });
  } catch (error) {
    console.error("Error updating subcategory:", error);
    return NextResponse.json(
      { error: "Failed to update subcategory" },
      { status: 500 }
    );
  }
}

// DELETE /api/catalog/subcategories/[id] - Delete a subcategory
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const existing = db
      .prepare("SELECT * FROM catalog_subcategories WHERE id = ?")
      .get(id) as CatalogSubcategoryRow | undefined;

    if (!existing) {
      return NextResponse.json(
        { error: "Subcategory not found" },
        { status: 404 }
      );
    }

    // Delete subcategory (cascade will handle items)
    db.prepare("DELETE FROM catalog_subcategories WHERE id = ?").run(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting subcategory:", error);
    return NextResponse.json(
      { error: "Failed to delete subcategory" },
      { status: 500 }
    );
  }
}
