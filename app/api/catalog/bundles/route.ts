import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

interface BundleRow {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  tool_type: string;
  color: string;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface BundleItemRow {
  id: string;
  bundle_id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  item_unit: string;
  item_price: number;
  is_required: number;
  quantity_multiplier: number;
  sort_order: number;
}

// GET /api/catalog/bundles - List all bundles with their items
export function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("activeOnly") !== "false";

    let query = "SELECT * FROM catalog_takeoff_bundles WHERE 1=1";
    if (activeOnly) {
      query += " AND is_active = 1";
    }
    query += " ORDER BY sort_order, name";

    const bundles = db.prepare(query).all() as BundleRow[];

    // Get items for each bundle
    const bundlesWithItems = bundles.map((bundle) => {
      const items = db
        .prepare(
          `
          SELECT
            bi.id,
            bi.bundle_id,
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

      return {
        id: bundle.id,
        name: bundle.name,
        description: bundle.description,
        unit: bundle.unit,
        toolType: bundle.tool_type,
        color: bundle.color,
        isActive: bundle.is_active === 1,
        sortOrder: bundle.sort_order,
        createdAt: bundle.created_at,
        updatedAt: bundle.updated_at,
        items: items.map((item) => ({
          id: item.id,
          itemId: item.item_id,
          code: item.item_code,
          name: item.item_name,
          unit: item.item_unit,
          price: item.item_price,
          isRequired: item.is_required === 1,
          quantityMultiplier: item.quantity_multiplier,
          sortOrder: item.sort_order,
        })),
      };
    });

    return NextResponse.json(bundlesWithItems);
  } catch (error) {
    console.error("Error fetching bundles:", error);
    return NextResponse.json(
      { error: "Failed to fetch bundles" },
      { status: 500 }
    );
  }
}

// POST /api/catalog/bundles - Create a new bundle
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description = null,
      unit,
      toolType,
      color = "#3b82f6",
    } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!unit || typeof unit !== "string") {
      return NextResponse.json({ error: "Unit is required" }, { status: 400 });
    }

    if (!(toolType && ["count", "linear", "area"].includes(toolType))) {
      return NextResponse.json(
        { error: "Tool type must be count, linear, or area" },
        { status: 400 }
      );
    }

    // Get next sort order
    const maxOrder = db
      .prepare("SELECT MAX(sort_order) as max FROM catalog_takeoff_bundles")
      .get() as { max: number | null } | undefined;
    const sortOrder = (maxOrder?.max ?? -1) + 1;

    const id = randomUUID();
    db.prepare(
      `
      INSERT INTO catalog_takeoff_bundles (id, name, description, unit, tool_type, color, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(id, name.trim(), description, unit, toolType, color, sortOrder);

    const bundle = db
      .prepare("SELECT * FROM catalog_takeoff_bundles WHERE id = ?")
      .get(id) as BundleRow;

    return NextResponse.json({
      id: bundle.id,
      name: bundle.name,
      description: bundle.description,
      unit: bundle.unit,
      toolType: bundle.tool_type,
      color: bundle.color,
      isActive: bundle.is_active === 1,
      sortOrder: bundle.sort_order,
      createdAt: bundle.created_at,
      updatedAt: bundle.updated_at,
      items: [],
    });
  } catch (error) {
    console.error("Error creating bundle:", error);
    return NextResponse.json(
      { error: "Failed to create bundle" },
      { status: 500 }
    );
  }
}
