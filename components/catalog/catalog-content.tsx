"use client";

import { Database, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Bundle } from "./bundles-section";
import { BundlesSection } from "./bundles-section";
import { CatalogCategoryCard } from "./catalog-category-card";
import { CategoryDialog } from "./category-dialog";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { DraggableCategory } from "./draggable-category";
import { ItemDialog } from "./item-dialog";
import { SubcategoryDialog } from "./subcategory-dialog";

export interface CatalogItemData {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  unit: string;
  notes: string | null;
  defaultQty: number;
  isActive: boolean;
  isTakeoffItem: boolean;
  sortOrder: number;
}

export interface SubcategoryData {
  id: string;
  name: string;
  selectionMode: string;
  hidden: boolean;
  sortOrder: number;
  items: CatalogItemData[];
}

export interface CategoryData {
  id: string;
  name: string;
  selectionMode: string;
  supportsTakeoff: boolean;
  sortOrder: number;
  items: CatalogItemData[];
  subcategories: SubcategoryData[];
}

interface CatalogContentProps {
  initialData: CategoryData[];
  initialBundles?: Bundle[];
  showAddCategory?: boolean;
  onAddCategoryClick?: () => void;
}

export function CatalogContent({
  initialData,
  initialBundles = [],
  showAddCategory: _showAddCategory,
  onAddCategoryClick: _onAddCategoryClick,
}: CatalogContentProps) {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryData[]>(initialData);
  const [bundles, setBundles] = useState<Bundle[]>(initialBundles);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );
  const [isSeeding, setIsSeeding] = useState(false);

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
  const [_editingItemSubcategoryId, setEditingItemSubcategoryId] = useState<
    string | undefined
  >(undefined);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "category" | "subcategory" | "item";
    id: string;
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedCategories(new Set(categories.map((c) => c.id)));
  };

  const collapseAll = () => {
    setExpandedCategories(new Set());
  };

  // Filter categories and items based on search query
  const filteredCategories = categories
    .map((category) => {
      if (!searchQuery) {
        return category;
      }

      const query = searchQuery.toLowerCase();

      // Filter direct items
      const filteredItems = category.items.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.code.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query)
      );

      // Filter subcategory items
      const filteredSubcategories = category.subcategories
        .map((subcat) => ({
          ...subcat,
          items: subcat.items.filter(
            (item) =>
              item.name.toLowerCase().includes(query) ||
              item.code.toLowerCase().includes(query) ||
              item.description?.toLowerCase().includes(query)
          ),
        }))
        .filter(
          (subcat) =>
            subcat.items.length > 0 || subcat.name.toLowerCase().includes(query)
        );

      return {
        ...category,
        items: filteredItems,
        subcategories: filteredSubcategories,
      };
    })
    .filter(
      (category) =>
        category.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        category.items.length > 0 ||
        category.subcategories.length > 0
    );

  const handleItemUpdate = async (
    itemId: string,
    updates: Partial<CatalogItemData>
  ) => {
    try {
      const res = await fetch(`/api/catalog/items/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        throw new Error("Failed to update item");
      }

      // Update local state
      setCategories((prev) =>
        prev.map((category) => ({
          ...category,
          items: category.items.map((item) =>
            item.id === itemId ? { ...item, ...updates } : item
          ),
          subcategories: category.subcategories.map((subcat) => ({
            ...subcat,
            items: subcat.items.map((item) =>
              item.id === itemId ? { ...item, ...updates } : item
            ),
          })),
        }))
      );
    } catch (error) {
      console.error("Error updating item:", error);
    }
  };

  // Seed catalog from JSON
  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      const res = await fetch("/api/catalog/seed", { method: "POST" });
      if (!res.ok) {
        throw new Error("Failed to seed catalog");
      }
      router.refresh();
    } catch (error) {
      console.error("Error seeding catalog:", error);
    } finally {
      setIsSeeding(false);
    }
  };

  // Category handlers
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
    if (editingCategory) {
      // Update existing
      const res = await fetch(`/api/catalog/categories/${editingCategory.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error("Failed to update category");
      }

      setCategories((prev) =>
        prev.map((cat) =>
          cat.id === editingCategory.id
            ? { ...cat, name: data.name, selectionMode: data.selectionMode }
            : cat
        )
      );
    } else {
      // Create new
      const res = await fetch("/api/catalog/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error("Failed to create category");
      }
      const newCategory = await res.json();

      setCategories((prev) => [
        ...prev,
        {
          id: newCategory.id,
          name: newCategory.name,
          selectionMode: newCategory.selectionMode,
          supportsTakeoff: newCategory.supportsTakeoff ?? false,
          sortOrder: newCategory.sortOrder,
          items: [],
          subcategories: [],
        },
      ]);
    }
  };

  const handleDeleteCategory = (categoryId: string) => {
    const category = categories.find((c) => c.id === categoryId);
    if (!category) {
      return;
    }

    setDeleteTarget({
      type: "category",
      id: categoryId,
      name: category.name,
    });
    setDeleteDialogOpen(true);
  };

  // Subcategory handlers
  const handleAddSubcategory = (categoryId: string, categoryName: string) => {
    setSubcategoryParent({ id: categoryId, name: categoryName });
    setEditingSubcategory(null);
    setSubcategoryDialogOpen(true);
  };

  const handleEditSubcategory = (
    categoryId: string,
    subcategory: SubcategoryData
  ) => {
    const category = categories.find((c) => c.id === categoryId);
    if (!category) {
      return;
    }

    setSubcategoryParent({ id: categoryId, name: category.name });
    setEditingSubcategory(subcategory);
    setSubcategoryDialogOpen(true);
  };

  const handleDeleteSubcategory = (subcategoryId: string) => {
    // Find the subcategory name
    let subcategoryName = "";
    for (const category of categories) {
      const subcat = category.subcategories.find((s) => s.id === subcategoryId);
      if (subcat) {
        subcategoryName = subcat.name;
        break;
      }
    }

    setDeleteTarget({
      type: "subcategory",
      id: subcategoryId,
      name: subcategoryName,
    });
    setDeleteDialogOpen(true);
  };

  const handleToggleSubcategoryHidden = async (
    subcategoryId: string,
    currentHidden: boolean
  ) => {
    try {
      const res = await fetch(`/api/catalog/subcategories/${subcategoryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: !currentHidden }),
      });
      if (!res.ok) {
        throw new Error("Failed to toggle subcategory visibility");
      }

      // Update local state
      setCategories((prev) =>
        prev.map((category) => ({
          ...category,
          subcategories: category.subcategories.map((s) =>
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

    if (editingSubcategory) {
      // Update existing subcategory
      const res = await fetch(
        `/api/catalog/subcategories/${editingSubcategory.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );
      if (!res.ok) {
        throw new Error("Failed to update subcategory");
      }

      // Update local state
      setCategories((prev) =>
        prev.map((category) => ({
          ...category,
          subcategories: category.subcategories.map((subcat) =>
            subcat.id === editingSubcategory.id
              ? { ...subcat, ...data }
              : subcat
          ),
        }))
      );
    } else {
      // Create new subcategory
      const res = await fetch("/api/catalog/subcategories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: subcategoryParent.id, ...data }),
      });
      if (!res.ok) {
        throw new Error("Failed to create subcategory");
      }
      const newSubcat = await res.json();

      setCategories((prev) =>
        prev.map((cat) =>
          cat.id === subcategoryParent.id
            ? {
                ...cat,
                subcategories: [
                  ...cat.subcategories,
                  {
                    id: newSubcat.id,
                    name: newSubcat.name,
                    selectionMode: newSubcat.selectionMode,
                    hidden: newSubcat.hidden,
                    sortOrder: newSubcat.sortOrder,
                    items: [],
                  },
                ],
              }
            : cat
        )
      );
    }
  };

  // Item handlers
  const handleAddItem = (
    categoryId: string,
    name: string,
    subcategoryId?: string
  ) => {
    const category = categories.find((c) => c.id === categoryId);
    setItemParent({
      categoryId,
      subcategoryId,
      name,
      supportsTakeoff: category?.supportsTakeoff ?? false,
    });
    setEditingItem(null);
    setEditingItemSubcategoryId(undefined);
    setItemDialogOpen(true);
  };

  const handleEditItem = (
    categoryId: string,
    item: CatalogItemData,
    subcategoryId?: string
  ) => {
    // Find the parent name
    const category = categories.find((c) => c.id === categoryId);
    if (!category) {
      return;
    }

    let parentName = category.name;
    if (subcategoryId) {
      const subcategory = category.subcategories.find(
        (s) => s.id === subcategoryId
      );
      if (subcategory) {
        parentName = subcategory.name;
      }
    }

    setItemParent({
      categoryId,
      subcategoryId,
      name: parentName,
      supportsTakeoff: category.supportsTakeoff,
    });
    setEditingItem(item);
    setEditingItemSubcategoryId(subcategoryId);
    setItemDialogOpen(true);
  };

  const handleDeleteItem = (itemId: string) => {
    // Find the item name
    let itemName = "";
    for (const category of categories) {
      const item = category.items.find((i) => i.id === itemId);
      if (item) {
        itemName = item.name;
        break;
      }
      for (const subcat of category.subcategories) {
        const subcatItem = subcat.items.find((i) => i.id === itemId);
        if (subcatItem) {
          itemName = subcatItem.name;
          break;
        }
      }
      if (itemName) {
        break;
      }
    }

    setDeleteTarget({
      type: "item",
      id: itemId,
      name: itemName,
    });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);
    try {
      if (deleteTarget.type === "category") {
        const res = await fetch(`/api/catalog/categories/${deleteTarget.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          throw new Error("Failed to delete category");
        }
        setCategories((prev) =>
          prev.filter((cat) => cat.id !== deleteTarget.id)
        );
      } else if (deleteTarget.type === "subcategory") {
        const res = await fetch(
          `/api/catalog/subcategories/${deleteTarget.id}`,
          {
            method: "DELETE",
          }
        );
        if (!res.ok) {
          throw new Error("Failed to delete subcategory");
        }
        setCategories((prev) =>
          prev.map((category) => ({
            ...category,
            subcategories: category.subcategories.filter(
              (s) => s.id !== deleteTarget.id
            ),
          }))
        );
      } else if (deleteTarget.type === "item") {
        const res = await fetch(`/api/catalog/items/${deleteTarget.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          throw new Error("Failed to delete item");
        }
        setCategories((prev) =>
          prev.map((category) => ({
            ...category,
            items: category.items.filter((item) => item.id !== deleteTarget.id),
            subcategories: category.subcategories.map((subcat) => ({
              ...subcat,
              items: subcat.items.filter((item) => item.id !== deleteTarget.id),
            })),
          }))
        );
      }

      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    } catch (error) {
      console.error("Error deleting:", error);
    } finally {
      setIsDeleting(false);
    }
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

    if (editingItem) {
      // Update existing item
      const res = await fetch(`/api/catalog/items/${editingItem.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error("Failed to update item");
      }

      // Update local state
      setCategories((prev) =>
        prev.map((category) => ({
          ...category,
          items: category.items.map((item) =>
            item.id === editingItem.id
              ? {
                  ...item,
                  ...data,
                  isTakeoffItem: data.isTakeoffItem ?? item.isTakeoffItem,
                }
              : item
          ),
          subcategories: category.subcategories.map((subcat) => ({
            ...subcat,
            items: subcat.items.map((item) =>
              item.id === editingItem.id
                ? {
                    ...item,
                    ...data,
                    isTakeoffItem: data.isTakeoffItem ?? item.isTakeoffItem,
                  }
                : item
            ),
          })),
        }))
      );
    } else {
      // Create new item
      const res = await fetch("/api/catalog/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: itemParent.categoryId,
          subcategoryId: itemParent.subcategoryId,
          ...data,
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to create item");
      }
      const newItem = await res.json();

      const itemData: CatalogItemData = {
        id: newItem.id,
        code: newItem.code,
        name: newItem.name,
        description: newItem.description,
        price: newItem.price,
        unit: newItem.unit,
        notes: newItem.notes,
        defaultQty: newItem.defaultQty,
        isActive: newItem.isActive,
        isTakeoffItem: newItem.isTakeoffItem ?? false,
        sortOrder: newItem.sortOrder,
      };

      setCategories((prev) =>
        prev.map((cat) => {
          if (cat.id !== itemParent.categoryId) {
            return cat;
          }

          if (itemParent.subcategoryId) {
            return {
              ...cat,
              subcategories: cat.subcategories.map((subcat) =>
                subcat.id === itemParent.subcategoryId
                  ? { ...subcat, items: [...subcat.items, itemData] }
                  : subcat
              ),
            };
          }
          return { ...cat, items: [...cat.items, itemData] };
        })
      );
    }
  };

  // Category reordering handler
  const handleCategoryReorder = useCallback(
    async (sourceIndex: number, targetIndex: number) => {
      // Update local state first for immediate feedback
      setCategories((prev) => {
        const newCategories = [...prev];
        const [removed] = newCategories.splice(sourceIndex, 1);
        newCategories.splice(targetIndex, 0, removed);

        // Update sort orders
        return newCategories.map((cat, idx) => ({
          ...cat,
          sortOrder: idx,
        }));
      });

      // Persist to API
      try {
        const reorderedItems = categories.map((cat, idx) => {
          // Calculate new index after move
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

        await fetch("/api/catalog/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "categories", items: reorderedItems }),
        });
      } catch (error) {
        console.error("Failed to persist reorder:", error);
        // Could revert state here if needed
      }
    },
    [categories]
  );

  // Helper functions to avoid nested ternaries
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

  return (
    <>
      <div className="space-y-6">
        {/* Search and Controls */}
        <div className="flex items-center gap-4">
          <div className="relative max-w-md flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items by name, code, or description..."
              value={searchQuery}
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <button
                className="text-muted-foreground text-sm transition-colors hover:text-foreground"
                onClick={expandAll}
                type="button"
              >
                Expand All
              </button>
              <span className="text-muted-foreground/30">|</span>
              <button
                className="text-muted-foreground text-sm transition-colors hover:text-foreground"
                onClick={collapseAll}
                type="button"
              >
                Collapse All
              </button>
            </div>
            <Button onClick={handleAddCategory} size="sm" variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Add Category
            </Button>
          </div>
        </div>

        {/* Category Cards */}
        <div className="space-y-4">
          {filteredCategories.length === 0 ? (
            <div className="rounded-xl border border-border/50 bg-card p-12 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="rounded-full bg-muted p-4">
                  <Database className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-display font-semibold text-lg">
                    {searchQuery ? "No matches found" : "No categories yet"}
                  </p>
                  <p className="mt-1 text-muted-foreground text-sm">
                    {searchQuery
                      ? "Try a different search term."
                      : "Seed from the JSON catalog or add categories manually."}
                  </p>
                </div>
                {!searchQuery && (
                  <div className="mt-2 flex gap-3">
                    <Button
                      disabled={isSeeding}
                      onClick={handleSeed}
                      variant="outline"
                    >
                      <Database className="mr-2 h-4 w-4" />
                      {isSeeding ? "Seeding..." : "Seed from JSON"}
                    </Button>
                    <Button onClick={handleAddCategory}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Category
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            filteredCategories.map((category, index) => (
              <DraggableCategory
                categoryId={category.id}
                categoryName={category.name}
                index={index}
                key={category.id}
                onDrop={handleCategoryReorder}
              >
                <CatalogCategoryCard
                  category={category}
                  index={index}
                  isExpanded={expandedCategories.has(category.id)}
                  onAddItem={(subcategoryId?: string, parentName?: string) =>
                    handleAddItem(
                      category.id,
                      parentName || category.name,
                      subcategoryId
                    )
                  }
                  onAddSubcategory={() =>
                    handleAddSubcategory(category.id, category.name)
                  }
                  onDeleteCategory={() => handleDeleteCategory(category.id)}
                  onDeleteItem={handleDeleteItem}
                  onDeleteSubcategory={handleDeleteSubcategory}
                  onEditCategory={() => handleEditCategory(category)}
                  onEditItem={(item, subcategoryId) =>
                    handleEditItem(category.id, item, subcategoryId)
                  }
                  onEditSubcategory={(subcategory) =>
                    handleEditSubcategory(category.id, subcategory)
                  }
                  onItemUpdate={handleItemUpdate}
                  onToggle={() => toggleCategory(category.id)}
                  onToggleSubcategoryHidden={handleToggleSubcategoryHidden}
                />
              </DraggableCategory>
            ))
          )}
        </div>

        {/* Takeoff Bundles Section */}
        <BundlesSection
          bundles={bundles}
          categories={categories}
          onBundlesChange={setBundles}
        />
      </div>

      {/* Dialogs */}
      <CategoryDialog
        category={editingCategory || undefined}
        onOpenChange={setCategoryDialogOpen}
        onSave={handleSaveCategory}
        open={categoryDialogOpen}
      />

      {subcategoryParent && (
        <SubcategoryDialog
          categoryId={subcategoryParent.id}
          categoryName={subcategoryParent.name}
          onOpenChange={setSubcategoryDialogOpen}
          onSave={handleSaveSubcategory}
          open={subcategoryDialogOpen}
          subcategory={editingSubcategory || undefined}
        />
      )}

      {itemParent && (
        <ItemDialog
          categoryId={itemParent.categoryId}
          item={editingItem || undefined}
          onOpenChange={setItemDialogOpen}
          onSave={handleSaveItem}
          open={itemDialogOpen}
          parentName={itemParent.name}
          subcategoryId={itemParent.subcategoryId}
          supportsTakeoff={itemParent.supportsTakeoff}
        />
      )}

      <DeleteConfirmDialog
        description={getDeleteDescription()}
        isLoading={isDeleting}
        itemName={deleteTarget?.name || ""}
        onConfirm={handleConfirmDelete}
        onOpenChange={setDeleteDialogOpen}
        open={deleteDialogOpen}
        title={getDeleteTitle()}
      />
    </>
  );
}
