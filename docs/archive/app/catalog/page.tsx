import { CatalogContent } from "@/components/catalog/catalog-content";
import { PageHeader } from "@/components/page-header";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface CatalogItem {
  id: string;
  category_id: string;
  subcategory_id: string | null;
  code: string;
  name: string;
  description: string | null;
  price: number;
  unit: string;
  notes: string | null;
  default_qty: number;
  is_active: number;
  is_takeoff_item: number;
  sort_order: number;
}

interface Subcategory {
  id: string;
  category_id: string;
  name: string;
  selection_mode: string;
  hidden: number;
  sort_order: number;
}

interface Category {
  id: string;
  name: string;
  selection_mode: string;
  supports_takeoff: number;
  sort_order: number;
}

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

export default function CatalogPage() {
  // Fetch all categories
  const categories = db
    .prepare("SELECT * FROM catalog_categories ORDER BY sort_order")
    .all() as Category[];

  // Fetch all subcategories
  const subcategories = db
    .prepare("SELECT * FROM catalog_subcategories ORDER BY sort_order")
    .all() as Subcategory[];

  // Fetch all items
  const items = db
    .prepare("SELECT * FROM catalog_items ORDER BY sort_order")
    .all() as CatalogItem[];

  // Fetch all bundles with their items
  const bundleRows = db
    .prepare(
      "SELECT * FROM catalog_takeoff_bundles WHERE is_active = 1 ORDER BY sort_order, name"
    )
    .all() as BundleRow[];

  const bundlesData = bundleRows.map((bundle) => {
    const bundleItems = db
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
      toolType: bundle.tool_type as "count" | "linear" | "area",
      color: bundle.color,
      isActive: bundle.is_active === 1,
      sortOrder: bundle.sort_order,
      items: bundleItems.map((item) => ({
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

  // Calculate stats
  const totalCategories = categories.length;
  const totalItems = items.length;
  const activeItems = items.filter((item) => item.is_active === 1).length;
  const totalBundles = bundlesData.length;

  // Build nested structure for client component
  const catalogData = categories.map((category) => {
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
      supportsTakeoff: category.supports_takeoff === 1,
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
        isActive: item.is_active === 1,
        isTakeoffItem: item.is_takeoff_item === 1,
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
            isActive: item.is_active === 1,
            isTakeoffItem: item.is_takeoff_item === 1,
            sortOrder: item.sort_order,
          })),
        };
      }),
    };
  });

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        breadcrumbs={[{ label: "Catalog" }]}
        title="Service Catalog"
      />

      <div className="flex-1 p-6 lg:p-8">
        <div className="page-transition">
          {/* Stats Bar */}
          <div className="mb-8 grid grid-cols-4 gap-4">
            <div className="rounded-xl border border-border/50 bg-card p-4">
              <p className="text-muted-foreground text-sm">Categories</p>
              <p className="font-display font-semibold text-2xl">
                {totalCategories}
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-card p-4">
              <p className="text-muted-foreground text-sm">Total Items</p>
              <p className="font-display font-semibold text-2xl">
                {totalItems}
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-card p-4">
              <p className="text-muted-foreground text-sm">Active Items</p>
              <p className="font-display font-semibold text-2xl text-primary">
                {activeItems}
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-card p-4">
              <p className="text-muted-foreground text-sm">Takeoff Bundles</p>
              <p className="font-display font-semibold text-2xl text-primary">
                {totalBundles}
              </p>
            </div>
          </div>

          {/* Catalog Content */}
          <CatalogContent
            initialBundles={bundlesData}
            initialData={catalogData}
          />
        </div>
      </div>
    </div>
  );
}
