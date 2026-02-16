import type {
  CatalogItemData,
  CategoryData,
  SubcategoryData,
} from "@/apps/web/frontend/components/catalog/catalog-content";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

async function apiFetch(
  url: string,
  method: string,
  body?: unknown
): Promise<Response> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = JSON_HEADERS;
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`API ${method} ${url} failed`);
  }
  return res;
}

export async function updateItem(
  itemId: string,
  updates: Partial<CatalogItemData>
): Promise<void> {
  await apiFetch(`/api/catalog/items/${itemId}`, "PUT", updates);
}

export async function seedCatalog(): Promise<void> {
  await apiFetch("/api/catalog/seed", "POST");
}

export async function saveCategory(
  editingId: string | null,
  data: { name: string; selectionMode: string }
): Promise<CategoryData | null> {
  if (editingId) {
    await apiFetch(`/api/catalog/categories/${editingId}`, "PUT", data);
    return null;
  }
  const res = await apiFetch("/api/catalog/categories", "POST", data);
  return (await res.json()) as CategoryData;
}

export async function toggleSubcategoryHidden(
  subcategoryId: string,
  hidden: boolean
): Promise<void> {
  await apiFetch(`/api/catalog/subcategories/${subcategoryId}`, "PUT", {
    hidden,
  });
}

export async function saveSubcategory(
  editingId: string | null,
  parentId: string,
  data: { name: string; selectionMode: string; hidden: boolean }
): Promise<SubcategoryData | null> {
  if (editingId) {
    await apiFetch(`/api/catalog/subcategories/${editingId}`, "PUT", data);
    return null;
  }
  const res = await apiFetch("/api/catalog/subcategories", "POST", {
    categoryId: parentId,
    ...data,
  });
  return (await res.json()) as SubcategoryData;
}

export async function saveItem(
  editingId: string | null,
  categoryId: string,
  subcategoryId: string | undefined,
  data: {
    code: string;
    name: string;
    description: string | null;
    price: number;
    unit: string;
    notes: string | null;
    defaultQty: number;
    isTakeoffItem?: boolean;
  }
): Promise<CatalogItemData | null> {
  if (editingId) {
    await apiFetch(`/api/catalog/items/${editingId}`, "PUT", data);
    return null;
  }
  const res = await apiFetch("/api/catalog/items", "POST", {
    categoryId,
    subcategoryId,
    ...data,
  });
  return (await res.json()) as CatalogItemData;
}

export async function deleteEntity(
  type: "category" | "subcategory" | "item",
  id: string
): Promise<void> {
  const paths: Record<string, string> = {
    category: `/api/catalog/categories/${id}`,
    subcategory: `/api/catalog/subcategories/${id}`,
    item: `/api/catalog/items/${id}`,
  };
  await apiFetch(paths[type], "DELETE");
}

export async function reorderCategories(
  items: { id: string; sortOrder: number }[]
): Promise<void> {
  await apiFetch("/api/catalog/reorder", "POST", {
    type: "categories",
    items,
  });
}
