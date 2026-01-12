import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type {
  CatalogCategoryRow,
  CatalogItemRow,
  CatalogSubcategoryRow,
} from "@/lib/types";

// GET /api/catalog - Fetch full catalog with categories, subcategories, and items
export function GET() {
  try {
    // Fetch all categories
    const categories = db
      .prepare("SELECT * FROM catalog_categories ORDER BY sort_order")
      .all() as CatalogCategoryRow[];

    // Fetch all subcategories
    const subcategories = db
      .prepare("SELECT * FROM catalog_subcategories ORDER BY sort_order")
      .all() as CatalogSubcategoryRow[];

    // Fetch all items
    const items = db
      .prepare(
        "SELECT * FROM catalog_items WHERE is_active = 1 ORDER BY sort_order"
      )
      .all() as CatalogItemRow[];

    // Build nested structure
    const catalog = categories.map((category) => {
      const categorySubcats = subcategories.filter(
        (sub) => sub.category_id === category.id
      );

      const categoryItems = items.filter(
        (item) => item.category_id === category.id && !item.subcategory_id
      );

      return {
        id: category.id,
        name: category.name,
        selectionMode: category.selection_mode,
        sortOrder: category.sort_order,
        items: categoryItems.map((item) => ({
          id: item.id,
          code: item.code,
          name: item.name,
          description: item.description,
          price: item.price,
          unit: item.unit,
          notes: item.notes,
          defaultQty: item.default_qty,
          sortOrder: item.sort_order,
        })),
        subcategories: categorySubcats.map((subcat) => {
          const subcatItems = items.filter(
            (item) => item.subcategory_id === subcat.id
          );

          return {
            id: subcat.id,
            name: subcat.name,
            selectionMode: subcat.selection_mode,
            hidden: subcat.hidden === 1,
            sortOrder: subcat.sort_order,
            items: subcatItems.map((item) => ({
              id: item.id,
              code: item.code,
              name: item.name,
              description: item.description,
              price: item.price,
              unit: item.unit,
              notes: item.notes,
              defaultQty: item.default_qty,
              sortOrder: item.sort_order,
            })),
          };
        }),
      };
    });

    return NextResponse.json({ categories: catalog });
  } catch (error) {
    console.error("Error fetching catalog:", error);
    return NextResponse.json(
      { error: "Failed to fetch catalog" },
      { status: 500 }
    );
  }
}
