import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { CatalogSubcategoryRow } from "@/lib/types";

interface MaxOrderResult {
  max: number | null;
}

// GET /api/catalog/subcategories - List all subcategories (optionally filter by category)
export function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");

    let query = "SELECT * FROM catalog_subcategories";
    const params: string[] = [];

    if (categoryId) {
      query += " WHERE category_id = ?";
      params.push(categoryId);
    }

    query += " ORDER BY sort_order";

    const subcategories = db
      .prepare(query)
      .all(...params) as CatalogSubcategoryRow[];

    return NextResponse.json(
      subcategories.map((sub) => ({
        id: sub.id,
        categoryId: sub.category_id,
        name: sub.name,
        selectionMode: sub.selection_mode,
        hidden: sub.hidden === 1,
        sortOrder: sub.sort_order,
        createdAt: sub.created_at,
        updatedAt: sub.updated_at,
      }))
    );
  } catch (error) {
    console.error("Error fetching subcategories:", error);
    return NextResponse.json(
      { error: "Failed to fetch subcategories" },
      { status: 500 }
    );
  }
}

// POST /api/catalog/subcategories - Create a new subcategory
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      categoryId,
      name,
      selectionMode = "pick-many",
      hidden = false,
    } = body;

    if (!categoryId || typeof categoryId !== "string") {
      return NextResponse.json(
        { error: "Category ID is required" },
        { status: 400 }
      );
    }

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Verify category exists
    const category = db
      .prepare("SELECT id FROM catalog_categories WHERE id = ?")
      .get(categoryId);

    if (!category) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    // Get the next sort order within this category
    const maxOrder = db
      .prepare(
        "SELECT MAX(sort_order) as max FROM catalog_subcategories WHERE category_id = ?"
      )
      .get(categoryId) as MaxOrderResult | undefined;
    const sortOrder = (maxOrder?.max ?? -1) + 1;

    const id = randomUUID();
    db.prepare(`
      INSERT INTO catalog_subcategories (id, category_id, name, sort_order, selection_mode, hidden)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      categoryId,
      name.trim(),
      sortOrder,
      selectionMode,
      hidden ? 1 : 0
    );

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
    console.error("Error creating subcategory:", error);
    return NextResponse.json(
      { error: "Failed to create subcategory" },
      { status: 500 }
    );
  }
}
