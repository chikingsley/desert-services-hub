import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type {
  CatalogCategoryRow,
  CatalogItemRow,
  CatalogSubcategoryRow,
} from "@/lib/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/catalog/categories/[id] - Get a single category
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const category = db
      .prepare("SELECT * FROM catalog_categories WHERE id = ?")
      .get(id) as CatalogCategoryRow | undefined;

    if (!category) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    // Get subcategories and items
    const subcategories = db
      .prepare(
        "SELECT * FROM catalog_subcategories WHERE category_id = ? ORDER BY sort_order"
      )
      .all(id) as CatalogSubcategoryRow[];

    const items = db
      .prepare(
        "SELECT * FROM catalog_items WHERE category_id = ? ORDER BY sort_order"
      )
      .all(id) as CatalogItemRow[];

    return NextResponse.json({
      id: category.id,
      name: category.name,
      selectionMode: category.selection_mode,
      sortOrder: category.sort_order,
      createdAt: category.created_at,
      updatedAt: category.updated_at,
      subcategories: subcategories.map((sub) => ({
        id: sub.id,
        name: sub.name,
        selectionMode: sub.selection_mode,
        hidden: sub.hidden === 1,
        sortOrder: sub.sort_order,
      })),
      items: items.map((item) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        description: item.description,
        price: item.price,
        unit: item.unit,
        notes: item.notes,
        defaultQty: item.default_qty,
        subcategoryId: item.subcategory_id,
        isActive: item.is_active === 1,
        sortOrder: item.sort_order,
      })),
    });
  } catch (error) {
    console.error("Error fetching category:", error);
    return NextResponse.json(
      { error: "Failed to fetch category" },
      { status: 500 }
    );
  }
}

// PUT /api/catalog/categories/[id] - Update a category
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, selectionMode, sortOrder } = body;

    const existing = db
      .prepare("SELECT * FROM catalog_categories WHERE id = ?")
      .get(id) as CatalogCategoryRow | undefined;

    if (!existing) {
      return NextResponse.json(
        { error: "Category not found" },
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
    if (sortOrder !== undefined) {
      updates.push("sort_order = ?");
      values.push(Number(sortOrder));
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(id);

      db.prepare(`
        UPDATE catalog_categories SET ${updates.join(", ")} WHERE id = ?
      `).run(...values);
    }

    const category = db
      .prepare("SELECT * FROM catalog_categories WHERE id = ?")
      .get(id) as CatalogCategoryRow;

    return NextResponse.json({
      id: category.id,
      name: category.name,
      selectionMode: category.selection_mode,
      sortOrder: category.sort_order,
      createdAt: category.created_at,
      updatedAt: category.updated_at,
    });
  } catch (error) {
    console.error("Error updating category:", error);
    return NextResponse.json(
      { error: "Failed to update category" },
      { status: 500 }
    );
  }
}

// DELETE /api/catalog/categories/[id] - Delete a category
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const existing = db
      .prepare("SELECT * FROM catalog_categories WHERE id = ?")
      .get(id) as CatalogCategoryRow | undefined;

    if (!existing) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    // Delete category (cascade will handle subcategories and items)
    db.prepare("DELETE FROM catalog_categories WHERE id = ?").run(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting category:", error);
    return NextResponse.json(
      { error: "Failed to delete category" },
      { status: 500 }
    );
  }
}
