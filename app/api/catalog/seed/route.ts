import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import catalogData from "@/scripts/seed/catalog.json";

interface CatalogItem {
  code: string;
  name: string;
  description?: string;
  price: number;
  unit: string;
  notes?: string;
  defaultQty?: number;
}

interface Subcategory {
  id: string;
  name: string;
  selectionMode?: string;
  hidden?: boolean;
  items: CatalogItem[];
}

interface Category {
  id: string;
  name: string;
  selectionMode?: string;
  items?: CatalogItem[];
  subcategories?: Subcategory[];
}

interface Catalog {
  categories: Category[];
}

export function POST() {
  try {
    const catalog = catalogData as Catalog;

    // Clear existing data (in reverse order due to foreign keys)
    db.exec("DELETE FROM catalog_items");
    db.exec("DELETE FROM catalog_subcategories");
    db.exec("DELETE FROM catalog_categories");

    const insertCategory = db.prepare(`
      INSERT INTO catalog_categories (id, name, sort_order, selection_mode)
      VALUES (?, ?, ?, ?)
    `);

    const insertSubcategory = db.prepare(`
      INSERT INTO catalog_subcategories (id, category_id, name, sort_order, selection_mode, hidden)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertItem = db.prepare(`
      INSERT INTO catalog_items (
        id, category_id, subcategory_id, code, name, description,
        price, unit, notes, default_qty, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let categoryCount = 0;
    let subcategoryCount = 0;
    let itemCount = 0;

    // Wrap in transaction for better performance and atomicity
    const seedData = db.transaction(() => {
      for (let catIdx = 0; catIdx < catalog.categories.length; catIdx++) {
        const category = catalog.categories[catIdx];

        // Insert category
        insertCategory.run(
          category.id,
          category.name,
          catIdx,
          category.selectionMode || "pick-many"
        );
        categoryCount++;

        // Handle direct items (categories without subcategories)
        if (category.items && category.items.length > 0) {
          for (let itemIdx = 0; itemIdx < category.items.length; itemIdx++) {
            const item = category.items[itemIdx];
            const itemId = `${category.id}-${item.code}`;

            insertItem.run(
              itemId,
              category.id,
              null, // no subcategory
              item.code,
              item.name,
              item.description || null,
              item.price,
              item.unit,
              item.notes || null,
              item.defaultQty || 1,
              itemIdx
            );
            itemCount++;
          }
        }

        // Handle subcategories
        if (category.subcategories && category.subcategories.length > 0) {
          for (
            let subIdx = 0;
            subIdx < category.subcategories.length;
            subIdx++
          ) {
            const subcategory = category.subcategories[subIdx];

            // Insert subcategory
            insertSubcategory.run(
              subcategory.id,
              category.id,
              subcategory.name,
              subIdx,
              subcategory.selectionMode || "pick-many",
              subcategory.hidden ? 1 : 0
            );
            subcategoryCount++;

            // Insert items in subcategory
            if (subcategory.items && subcategory.items.length > 0) {
              for (
                let itemIdx = 0;
                itemIdx < subcategory.items.length;
                itemIdx++
              ) {
                const item = subcategory.items[itemIdx];
                const itemId = `${subcategory.id}-${item.code}`;

                insertItem.run(
                  itemId,
                  category.id,
                  subcategory.id,
                  item.code,
                  item.name,
                  item.description || null,
                  item.price,
                  item.unit,
                  item.notes || null,
                  item.defaultQty || 1,
                  itemIdx
                );
                itemCount++;
              }
            }
          }
        }
      }
    });

    seedData();

    return NextResponse.json({
      success: true,
      message: "Catalog seeded successfully",
      stats: {
        categories: categoryCount,
        subcategories: subcategoryCount,
        items: itemCount,
      },
    });
  } catch (error) {
    console.error("Error seeding catalog:", error);
    return NextResponse.json(
      { error: "Failed to seed catalog", details: String(error) },
      { status: 500 }
    );
  }
}
