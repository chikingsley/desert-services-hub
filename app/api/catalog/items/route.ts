import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { CatalogItemRow } from "@/lib/types";

interface MaxOrderResult {
  max: number | null;
}

// GET /api/catalog/items - List items (optionally filter by category or subcategory)
export function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");
    const subcategoryId = searchParams.get("subcategoryId");
    const activeOnly = searchParams.get("activeOnly") !== "false";

    let query = "SELECT * FROM catalog_items WHERE 1=1";
    const params: string[] = [];

    if (categoryId) {
      query += " AND category_id = ?";
      params.push(categoryId);
    }
    if (subcategoryId) {
      query += " AND subcategory_id = ?";
      params.push(subcategoryId);
    }
    if (activeOnly) {
      query += " AND is_active = 1";
    }

    query += " ORDER BY sort_order";

    const items = db.prepare(query).all(...params) as CatalogItemRow[];

    return NextResponse.json(
      items.map((item) => ({
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
      }))
    );
  } catch (error) {
    console.error("Error fetching items:", error);
    return NextResponse.json(
      { error: "Failed to fetch items" },
      { status: 500 }
    );
  }
}

// POST /api/catalog/items - Create a new item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      categoryId,
      subcategoryId = null,
      code,
      name,
      description = null,
      price,
      unit = "Each",
      notes = null,
      defaultQty = 1,
      isTakeoffItem = false,
    } = body;

    if (!categoryId || typeof categoryId !== "string") {
      return NextResponse.json(
        { error: "Category ID is required" },
        { status: 400 }
      );
    }

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (typeof price !== "number") {
      return NextResponse.json(
        { error: "Price must be a number" },
        { status: 400 }
      );
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

    // If subcategory is provided, verify it exists
    if (subcategoryId) {
      const subcategory = db
        .prepare("SELECT id FROM catalog_subcategories WHERE id = ?")
        .get(subcategoryId);

      if (!subcategory) {
        return NextResponse.json(
          { error: "Subcategory not found" },
          { status: 404 }
        );
      }
    }

    // Get the next sort order
    let maxOrderQuery =
      "SELECT MAX(sort_order) as max FROM catalog_items WHERE category_id = ?";
    const maxOrderParams: (string | null)[] = [categoryId];

    if (subcategoryId) {
      maxOrderQuery += " AND subcategory_id = ?";
      maxOrderParams.push(subcategoryId);
    } else {
      maxOrderQuery += " AND subcategory_id IS NULL";
    }

    const maxOrder = db.prepare(maxOrderQuery).get(...maxOrderParams) as
      | MaxOrderResult
      | undefined;
    const sortOrder = (maxOrder?.max ?? -1) + 1;

    const id = randomUUID();
    db.prepare(`
      INSERT INTO catalog_items (
        id, category_id, subcategory_id, code, name, description,
        price, unit, notes, default_qty, is_takeoff_item, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      categoryId,
      subcategoryId,
      code.trim(),
      name.trim(),
      description,
      price,
      unit,
      notes,
      defaultQty,
      isTakeoffItem ? 1 : 0,
      sortOrder
    );

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
    console.error("Error creating item:", error);
    return NextResponse.json(
      { error: "Failed to create item" },
      { status: 500 }
    );
  }
}
