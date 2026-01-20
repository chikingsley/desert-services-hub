import { NextResponse } from "next/server";
import { db } from "@/lib/db";

interface BundleRow {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  tool_type: string;
  color: string;
}

interface BundleItemRow {
  id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  item_unit: string;
  item_price: number;
  is_required: number;
  quantity_multiplier: number;
  sort_order: number;
}

// GET /api/catalog/takeoff-items - Get all takeoff bundles for measurement
export function GET() {
  try {
    // Fetch all active bundles
    const bundles = db
      .prepare(
        `
        SELECT id, name, description, unit, tool_type, color
        FROM catalog_takeoff_bundles
        WHERE is_active = 1
        ORDER BY sort_order, name
      `
      )
      .all() as BundleRow[];

    // Map bundles to takeoff item format
    const takeoffItems = bundles.map((bundle) => {
      // Get bundle items
      const items = db
        .prepare(
          `
          SELECT
            bi.id,
            bi.item_id,
            i.code as item_code,
            i.name as item_name,
            i.unit as item_unit,
            i.price as item_price,
            bi.is_required,
            bi.quantity_multiplier,
            bi.sort_order
          FROM catalog_bundle_items bi
          JOIN catalog_items i ON bi.item_id = i.id
          WHERE bi.bundle_id = ?
          ORDER BY bi.sort_order
        `
        )
        .all(bundle.id) as BundleItemRow[];

      // Map tool type
      let toolType: "count" | "linear" | "area" = "count";
      if (bundle.tool_type === "linear") {
        toolType = "linear";
      } else if (bundle.tool_type === "area") {
        toolType = "area";
      }

      return {
        id: bundle.id,
        code: `BUNDLE-${bundle.id.slice(0, 8).toUpperCase()}`,
        label: bundle.name,
        description: bundle.description,
        unit: bundle.unit,
        unitPrice: 0, // Bundle price is sum of items
        unitCost: 0,
        color: bundle.color,
        type: toolType,
        isBundle: true,
        bundleItems: items.map((item) => ({
          id: item.id,
          itemId: item.item_id,
          code: item.item_code,
          name: item.item_name,
          unit: item.item_unit,
          price: item.item_price,
          isRequired: item.is_required === 1,
          quantityMultiplier: item.quantity_multiplier,
        })),
        categoryId: null,
        categoryName: "Takeoff Bundles",
        subcategoryId: null,
        subcategoryName: null,
        notes: null,
        defaultQty: 1,
      };
    });

    return NextResponse.json(takeoffItems);
  } catch (error) {
    console.error("Error fetching takeoff items:", error);
    return NextResponse.json(
      { error: "Failed to fetch takeoff items" },
      { status: 500 }
    );
  }
}
