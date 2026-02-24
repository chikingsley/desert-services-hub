"use client";

import { Database, Plus, Search } from "lucide-react";
import { useState } from "react";
import type { Bundle } from "@/apps/web/frontend/components/catalog/bundles-section";
import { BundlesSection } from "@/apps/web/frontend/components/catalog/bundles-section";
import { CatalogCategoryCard } from "@/apps/web/frontend/components/catalog/catalog-category-card";
import { CategoryDialog } from "@/apps/web/frontend/components/catalog/category-dialog";
import { DeleteConfirmDialog } from "@/apps/web/frontend/components/catalog/delete-confirm-dialog";
import { DraggableCategory } from "@/apps/web/frontend/components/catalog/draggable-category";
import { ItemDialog } from "@/apps/web/frontend/components/catalog/item-dialog";
import { SubcategoryDialog } from "@/apps/web/frontend/components/catalog/subcategory-dialog";
import { useCatalogCrud } from "@/apps/web/frontend/components/catalog/use-catalog-crud";
import { Button } from "@/apps/web/frontend/components/ui/button";
import { Input } from "@/apps/web/frontend/components/ui/input";

export interface CatalogItemData {
  code: string;
  defaultQty: number;
  description: string | null;
  id: string;
  isActive: boolean;
  isTakeoffItem: boolean;
  name: string;
  notes: string | null;
  price: number;
  sortOrder: number;
  unit: string;
}

export interface SubcategoryData {
  hidden: boolean;
  id: string;
  items: CatalogItemData[];
  name: string;
  selectionMode: string;
  sortOrder: number;
}

export interface CategoryData {
  id: string;
  items: CatalogItemData[];
  name: string;
  selectionMode: string;
  sortOrder: number;
  subcategories: SubcategoryData[];
  supportsTakeoff: boolean;
}

interface CatalogContentProps {
  initialBundles?: Bundle[];
  initialData: CategoryData[];
  onAddCategoryClick?: () => void;
  readOnly?: boolean;
  showAddCategory?: boolean;
}

export function CatalogContent({
  initialData,
  initialBundles = [],
  readOnly = false,
  showAddCategory: _showAddCategory,
  onAddCategoryClick: _onAddCategoryClick,
}: CatalogContentProps) {
  const isReadOnly = Boolean(readOnly);
  const {
    categories,
    isSeeding,
    isDeleting,
    categoryDialogOpen,
    setCategoryDialogOpen,
    editingCategory,
    handleAddCategory,
    handleEditCategory,
    handleSaveCategory,
    handleDeleteCategory,
    handleCategoryReorder,
    subcategoryDialogOpen,
    setSubcategoryDialogOpen,
    subcategoryParent,
    editingSubcategory,
    handleAddSubcategory,
    handleEditSubcategory,
    handleSaveSubcategory,
    handleDeleteSubcategory,
    handleToggleSubcategoryHidden,
    itemDialogOpen,
    setItemDialogOpen,
    itemParent,
    editingItem,
    handleAddItem,
    handleEditItem,
    handleSaveItem,
    handleDeleteItem,
    handleItemUpdate,
    deleteDialogOpen,
    setDeleteDialogOpen,
    deleteTarget,
    handleConfirmDelete,
    getDeleteDescription,
    getDeleteTitle,
    handleSeed,
  } = useCatalogCrud(initialData, isReadOnly);
  const [bundles, setBundles] = useState<Bundle[]>(initialBundles);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );

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
            {!isReadOnly && (
              <Button onClick={handleAddCategory} size="sm" variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Add Category
              </Button>
            )}
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
                    {(() => {
                      if (searchQuery) {
                        return "Try a different search term.";
                      }
                      if (isReadOnly) {
                        return "No catalog items are available yet.";
                      }
                      return "Seed from the JSON catalog or add categories manually.";
                    })()}
                  </p>
                </div>
                {!(searchQuery || isReadOnly) && (
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
            filteredCategories.map((category, index) => {
              const card = (
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
                  readOnly={isReadOnly}
                />
              );

              if (isReadOnly) {
                return <div key={category.id}>{card}</div>;
              }

              return (
                <DraggableCategory
                  categoryId={category.id}
                  categoryName={category.name}
                  index={index}
                  key={category.id}
                  onDrop={handleCategoryReorder}
                >
                  {card}
                </DraggableCategory>
              );
            })
          )}
        </div>

        {/* Takeoff Bundles Section */}
        <BundlesSection
          bundles={bundles}
          categories={categories}
          onBundlesChange={setBundles}
          readOnly={isReadOnly}
        />
      </div>

      {!isReadOnly && (
        <>
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
      )}
    </>
  );
}
