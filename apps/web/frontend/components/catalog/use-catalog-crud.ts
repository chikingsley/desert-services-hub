import { useCallback, useState } from "react";
import {
  deleteEntity,
  reorderCategories,
  saveCategory,
  saveItem,
  saveSubcategory,
  seedCatalog,
  toggleSubcategoryHidden,
  updateItem,
} from "@/apps/web/frontend/components/catalog/catalog-api";
import type {
  CatalogItemData,
  CategoryData,
  SubcategoryData,
} from "@/apps/web/frontend/components/catalog/catalog-content";

/** Find the display name of a category, subcategory, or item by id. */
function findEntityName(
  categories: CategoryData[],
  type: "category" | "subcategory" | "item",
  id: string
): string {
  if (type === "category") {
    return categories.find((c) => c.id === id)?.name ?? "";
  }
  if (type === "subcategory") {
    for (const cat of categories) {
      const s = cat.subcategories.find((sc) => sc.id === id);
      if (s) {
        return s.name;
      }
    }
    return "";
  }
  for (const cat of categories) {
    const direct = cat.items.find((i) => i.id === id);
    if (direct) {
      return direct.name;
    }
    for (const sub of cat.subcategories) {
      const si = sub.items.find((i) => i.id === id);
      if (si) {
        return si.name;
      }
    }
  }
  return "";
}

export function useCatalogCrud(
  initialData: CategoryData[],
  isReadOnly: boolean
) {
  const [categories, setCategories] = useState<CategoryData[]>(initialData);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Dialog states
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryData | null>(
    null
  );
  const [subcategoryDialogOpen, setSubcategoryDialogOpen] = useState(false);
  const [subcategoryParent, setSubcategoryParent] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [editingSubcategory, setEditingSubcategory] =
    useState<SubcategoryData | null>(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [itemParent, setItemParent] = useState<{
    categoryId: string;
    subcategoryId?: string;
    name: string;
    supportsTakeoff: boolean;
  } | null>(null);
  const [editingItem, setEditingItem] = useState<CatalogItemData | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "category" | "subcategory" | "item";
    id: string;
    name: string;
  } | null>(null);

  // Inline item update
  const handleItemUpdate = async (
    itemId: string,
    updates: Partial<CatalogItemData>
  ) => {
    try {
      await updateItem(itemId, updates);
      setCategories((prev) =>
        prev.map((cat) => ({
          ...cat,
          items: cat.items.map((i) =>
            i.id === itemId ? { ...i, ...updates } : i
          ),
          subcategories: cat.subcategories.map((sub) => ({
            ...sub,
            items: sub.items.map((i) =>
              i.id === itemId ? { ...i, ...updates } : i
            ),
          })),
        }))
      );
    } catch (error) {
      console.error("Error updating item:", error);
    }
  };

  // Seed catalog
  const handleSeed = async () => {
    if (isReadOnly) {
      return;
    }
    setIsSeeding(true);
    try {
      await seedCatalog();
      window.location.reload();
    } catch (error) {
      console.error("Error seeding catalog:", error);
    } finally {
      setIsSeeding(false);
    }
  };

  // Category CRUD
  const handleAddCategory = () => {
    setEditingCategory(null);
    setCategoryDialogOpen(true);
  };

  const handleEditCategory = (category: CategoryData) => {
    setEditingCategory(category);
    setCategoryDialogOpen(true);
  };

  const handleSaveCategory = async (data: {
    name: string;
    selectionMode: string;
  }) => {
    const newCat = await saveCategory(editingCategory?.id ?? null, data);
    if (newCat) {
      setCategories((prev) => [
        ...prev,
        {
          ...newCat,
          supportsTakeoff: newCat.supportsTakeoff ?? false,
          items: [],
          subcategories: [],
        },
      ]);
    } else if (editingCategory) {
      setCategories((prev) =>
        prev.map((c) => (c.id === editingCategory.id ? { ...c, ...data } : c))
      );
    }
  };

  // Generic delete target setter
  const requestDelete = (
    type: "category" | "subcategory" | "item",
    id: string
  ) => {
    setDeleteTarget({
      type,
      id,
      name: findEntityName(categories, type, id),
    });
    setDeleteDialogOpen(true);
  };

  // Subcategory CRUD
  const handleAddSubcategory = (categoryId: string, categoryName: string) => {
    setSubcategoryParent({ id: categoryId, name: categoryName });
    setEditingSubcategory(null);
    setSubcategoryDialogOpen(true);
  };

  const handleEditSubcategory = (
    categoryId: string,
    subcategory: SubcategoryData
  ) => {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) {
      return;
    }
    setSubcategoryParent({ id: categoryId, name: cat.name });
    setEditingSubcategory(subcategory);
    setSubcategoryDialogOpen(true);
  };

  const handleToggleSubcategoryHidden = async (
    subcategoryId: string,
    currentHidden: boolean
  ) => {
    try {
      await toggleSubcategoryHidden(subcategoryId, !currentHidden);
      setCategories((prev) =>
        prev.map((cat) => ({
          ...cat,
          subcategories: cat.subcategories.map((s) =>
            s.id === subcategoryId ? { ...s, hidden: !currentHidden } : s
          ),
        }))
      );
    } catch (error) {
      console.error("Error toggling subcategory visibility:", error);
    }
  };

  const handleSaveSubcategory = async (data: {
    name: string;
    selectionMode: string;
    hidden: boolean;
  }) => {
    if (!subcategoryParent) {
      return;
    }
    const newSubcat = await saveSubcategory(
      editingSubcategory?.id ?? null,
      subcategoryParent.id,
      data
    );
    if (newSubcat) {
      setCategories((prev) =>
        prev.map((cat) =>
          cat.id === subcategoryParent.id
            ? {
                ...cat,
                subcategories: [
                  ...cat.subcategories,
                  { ...newSubcat, items: [] },
                ],
              }
            : cat
        )
      );
    } else if (editingSubcategory) {
      setCategories((prev) =>
        prev.map((cat) => ({
          ...cat,
          subcategories: cat.subcategories.map((s) =>
            s.id === editingSubcategory.id ? { ...s, ...data } : s
          ),
        }))
      );
    }
  };

  // Item CRUD
  const handleAddItem = (
    categoryId: string,
    name: string,
    subcategoryId?: string
  ) => {
    const cat = categories.find((c) => c.id === categoryId);
    setItemParent({
      categoryId,
      subcategoryId,
      name,
      supportsTakeoff: cat?.supportsTakeoff ?? false,
    });
    setEditingItem(null);
    setItemDialogOpen(true);
  };

  const handleEditItem = (
    categoryId: string,
    item: CatalogItemData,
    subcategoryId?: string
  ) => {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) {
      return;
    }
    let parentName = cat.name;
    if (subcategoryId) {
      const sub = cat.subcategories.find((s) => s.id === subcategoryId);
      if (sub) {
        parentName = sub.name;
      }
    }
    setItemParent({
      categoryId,
      subcategoryId,
      name: parentName,
      supportsTakeoff: cat.supportsTakeoff,
    });
    setEditingItem(item);
    setItemDialogOpen(true);
  };

  const handleSaveItem = async (data: {
    code: string;
    name: string;
    description: string | null;
    price: number;
    unit: string;
    notes: string | null;
    defaultQty: number;
    isTakeoffItem?: boolean;
  }) => {
    if (!itemParent) {
      return;
    }
    const newItem = await saveItem(
      editingItem?.id ?? null,
      itemParent.categoryId,
      itemParent.subcategoryId,
      data
    );
    if (newItem) {
      const itemData = {
        ...newItem,
        isTakeoffItem: newItem.isTakeoffItem ?? false,
      };
      setCategories((prev) =>
        prev.map((cat) => {
          if (cat.id !== itemParent.categoryId) {
            return cat;
          }
          if (itemParent.subcategoryId) {
            return {
              ...cat,
              subcategories: cat.subcategories.map((sub) =>
                sub.id === itemParent.subcategoryId
                  ? { ...sub, items: [...sub.items, itemData] }
                  : sub
              ),
            };
          }
          return { ...cat, items: [...cat.items, itemData] };
        })
      );
    } else if (editingItem) {
      setCategories((prev) =>
        prev.map((cat) => ({
          ...cat,
          items: cat.items.map((i) =>
            i.id === editingItem.id
              ? {
                  ...i,
                  ...data,
                  isTakeoffItem: data.isTakeoffItem ?? i.isTakeoffItem,
                }
              : i
          ),
          subcategories: cat.subcategories.map((sub) => ({
            ...sub,
            items: sub.items.map((i) =>
              i.id === editingItem.id
                ? {
                    ...i,
                    ...data,
                    isTakeoffItem: data.isTakeoffItem ?? i.isTakeoffItem,
                  }
                : i
            ),
          })),
        }))
      );
    }
  };

  // Confirm delete
  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteEntity(deleteTarget.type, deleteTarget.id);
      setCategories((prev) => {
        if (deleteTarget.type === "category") {
          return prev.filter((c) => c.id !== deleteTarget.id);
        }
        if (deleteTarget.type === "subcategory") {
          return prev.map((cat) => ({
            ...cat,
            subcategories: cat.subcategories.filter(
              (s) => s.id !== deleteTarget.id
            ),
          }));
        }
        return prev.map((cat) => ({
          ...cat,
          items: cat.items.filter((i) => i.id !== deleteTarget.id),
          subcategories: cat.subcategories.map((sub) => ({
            ...sub,
            items: sub.items.filter((i) => i.id !== deleteTarget.id),
          })),
        }));
      });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    } catch (error) {
      console.error("Error deleting:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  // Category reordering
  const handleCategoryReorder = useCallback(
    async (sourceIndex: number, targetIndex: number) => {
      setCategories((prev) => {
        const next = [...prev];
        const [removed] = next.splice(sourceIndex, 1);
        next.splice(targetIndex, 0, removed);
        return next.map((cat, idx) => ({ ...cat, sortOrder: idx }));
      });
      try {
        const items = categories.map((cat, idx) => {
          let newIndex = idx;
          if (idx === sourceIndex) {
            newIndex = targetIndex;
          } else if (sourceIndex < targetIndex) {
            if (idx > sourceIndex && idx <= targetIndex) {
              newIndex = idx - 1;
            }
          } else if (idx >= targetIndex && idx < sourceIndex) {
            newIndex = idx + 1;
          }
          return { id: cat.id, sortOrder: newIndex };
        });
        await reorderCategories(items);
      } catch (error) {
        console.error("Failed to persist reorder:", error);
      }
    },
    [categories]
  );

  // Delete dialog helpers
  const getDeleteDescription = () => {
    if (deleteTarget?.type === "category") {
      return "This will permanently delete the category and all its subcategories and items.";
    }
    if (deleteTarget?.type === "subcategory") {
      return "This will permanently delete the subcategory and all its items.";
    }
    return "This will permanently delete this catalog item.";
  };

  const getDeleteTitle = () => {
    if (deleteTarget?.type === "category") {
      return "Delete Category";
    }
    if (deleteTarget?.type === "subcategory") {
      return "Delete Subcategory";
    }
    return "Delete Item";
  };

  return {
    categories,
    isSeeding,
    isDeleting,
    categoryDialogOpen,
    setCategoryDialogOpen,
    editingCategory,
    handleAddCategory,
    handleEditCategory,
    handleSaveCategory,
    handleDeleteCategory: (id: string) => requestDelete("category", id),
    handleCategoryReorder,
    subcategoryDialogOpen,
    setSubcategoryDialogOpen,
    subcategoryParent,
    editingSubcategory,
    handleAddSubcategory,
    handleEditSubcategory,
    handleSaveSubcategory,
    handleDeleteSubcategory: (id: string) => requestDelete("subcategory", id),
    handleToggleSubcategoryHidden,
    itemDialogOpen,
    setItemDialogOpen,
    itemParent,
    editingItem,
    handleAddItem,
    handleEditItem,
    handleSaveItem,
    handleDeleteItem: (id: string) => requestDelete("item", id),
    handleItemUpdate,
    deleteDialogOpen,
    setDeleteDialogOpen,
    deleteTarget,
    handleConfirmDelete,
    getDeleteDescription,
    getDeleteTitle,
    handleSeed,
  };
}
