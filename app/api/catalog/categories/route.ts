import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { CatalogCategoryRow } from "@/lib/types";

interface MaxOrderResult {
  max: number | null;
}

// GET /api/catalog/categories - List all categories
export function GET() {
  try {
    const categories = db
      .prepare("SELECT * FROM catalog_categories ORDER BY sort_order")
      .all() as CatalogCategoryRow[];

    return NextResponse.json(
      categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        selectionMode: cat.selection_mode,
        sortOrder: cat.sort_order,
        createdAt: cat.created_at,
        updatedAt: cat.updated_at,
      }))
    );
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

// POST /api/catalog/categories - Create a new category
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, selectionMode = "pick-many" } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Get the next sort order
    const maxOrder = db
      .prepare("SELECT MAX(sort_order) as max FROM catalog_categories")
      .get() as MaxOrderResult | undefined;
    const sortOrder = (maxOrder?.max ?? -1) + 1;

    const id = randomUUID();
    db.prepare(`
      INSERT INTO catalog_categories (id, name, sort_order, selection_mode)
      VALUES (?, ?, ?, ?)
    `).run(id, name.trim(), sortOrder, selectionMode);

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
    console.error("Error creating category:", error);
    return NextResponse.json(
      { error: "Failed to create category" },
      { status: 500 }
    );
  }
}
