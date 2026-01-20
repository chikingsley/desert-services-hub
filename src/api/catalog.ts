/**
 * Catalog API handlers
 * Routes: GET /api/catalog, GET /api/catalog/takeoff-items
 */
import {
  getTakeoffItems as buildTakeoffItems,
  catalog,
  findItem,
  takeoffBundles,
} from "../../services/quoting/catalog";

function buildTakeoffItemCodeSet(): Set<string> {
  const codes = new Set<string>();
  for (const bundle of takeoffBundles) {
    for (const bundleItem of bundle.items) {
      codes.add(bundleItem.code);
    }
  }
  return codes;
}

// GET /api/catalog - Fetch catalog from the hardcoded service catalog
export function getCatalog(): Response {
  try {
    const takeoffItemCodes = buildTakeoffItemCodeSet();

    const categories = catalog.categories.map((category, categoryIndex) => {
      const mappedItems = (category.items ?? []).map((item, itemIndex) => ({
        id: `${category.id}:${item.code}`,
        code: item.code,
        name: item.name,
        description: item.description ?? null,
        price: item.price,
        unit: item.unit,
        notes: item.notes ?? null,
        defaultQty: item.defaultQty ?? 1,
        isActive: true,
        isTakeoffItem: takeoffItemCodes.has(item.code),
        sortOrder: itemIndex,
      }));

      const mappedSubcategories = (category.subcategories ?? []).map(
        (subcategory, subcategoryIndex) => ({
          id: subcategory.id,
          name: subcategory.name,
          selectionMode: "pick-many",
          hidden: false,
          sortOrder: subcategoryIndex,
          items: subcategory.items.map((item, itemIndex) => ({
            id: `${subcategory.id}:${item.code}`,
            code: item.code,
            name: item.name,
            description: item.description ?? null,
            price: item.price,
            unit: item.unit,
            notes: item.notes ?? null,
            defaultQty: item.defaultQty ?? 1,
            isActive: true,
            isTakeoffItem: takeoffItemCodes.has(item.code),
            sortOrder: itemIndex,
          })),
        })
      );

      const supportsTakeoff =
        mappedItems.some((item) => item.isTakeoffItem) ||
        mappedSubcategories.some((subcategory) =>
          subcategory.items.some((item) => item.isTakeoffItem)
        );

      return {
        id: category.id,
        name: category.name,
        selectionMode: "pick-many",
        supportsTakeoff,
        sortOrder: categoryIndex,
        items: mappedItems,
        subcategories: mappedSubcategories,
      };
    });

    const bundles = takeoffBundles.map((bundle, bundleIndex) => {
      const items = bundle.items.flatMap((bundleItem, itemIndex) => {
        const catalogItem = findItem(bundleItem.code);
        if (!catalogItem) {
          return [];
        }
        return [
          {
            id: `bi-${bundle.id}-${bundleItem.code}`,
            itemId: bundleItem.code,
            code: bundleItem.code,
            name: catalogItem.name,
            unit: catalogItem.unit,
            price: catalogItem.price,
            isRequired: bundleItem.isRequired,
            quantityMultiplier: bundleItem.quantityMultiplier,
            sortOrder: itemIndex,
          },
        ];
      });

      return {
        id: bundle.id,
        name: bundle.name,
        description: bundle.description ?? null,
        unit: bundle.unit,
        toolType: bundle.toolType,
        color: bundle.color,
        isActive: true,
        sortOrder: bundleIndex,
        items,
      };
    });

    return Response.json({ categories, bundles, readOnly: true });
  } catch (error) {
    console.error("Error fetching catalog:", error);
    return Response.json({ error: "Failed to fetch catalog" }, { status: 500 });
  }
}

// GET /api/catalog/takeoff-items - Fetch takeoff bundles formatted for the editor
export function getTakeoffItems(): Response {
  try {
    return Response.json(buildTakeoffItems());
  } catch (error) {
    console.error("Error fetching takeoff items:", error);
    return Response.json(
      { error: "Failed to fetch takeoff items" },
      { status: 500 }
    );
  }
}
