import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type ReorderType = "categories" | "subcategories" | "items";

interface ReorderItem {
  id: string;
  sortOrder: number;
}

function getTableName(type: ReorderType): string {
  switch (type) {
    case "categories":
      return "catalog_categories";
    case "subcategories":
      return "catalog_subcategories";
    case "items":
      return "catalog_items";
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown type: ${_exhaustive}`);
    }
  }
}

// POST /api/catalog/reorder - Batch update sort orders for drag-and-drop
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, items } = body;

    const validTypes: ReorderType[] = ["categories", "subcategories", "items"];
    if (!(type && validTypes.includes(type as ReorderType))) {
      return NextResponse.json(
        {
          error:
            "Invalid type. Must be 'categories', 'subcategories', or 'items'",
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Items array is required" },
        { status: 400 }
      );
    }

    const tableName = getTableName(type as ReorderType);

    const updateOrder = db.prepare(`
      UPDATE ${tableName} SET sort_order = ?, updated_at = datetime('now') WHERE id = ?
    `);

    const reorder = db.transaction(() => {
      for (const item of items as ReorderItem[]) {
        if (typeof item.id !== "string" || typeof item.sortOrder !== "number") {
          throw new Error(
            "Each item must have id (string) and sortOrder (number)"
          );
        }
        updateOrder.run(item.sortOrder, item.id);
      }
    });

    reorder();

    return NextResponse.json({ success: true, updated: items.length });
  } catch (error) {
    console.error("Error reordering:", error);
    return NextResponse.json(
      { error: "Failed to reorder items", details: String(error) },
      { status: 500 }
    );
  }
}
