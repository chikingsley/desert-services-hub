"use client";

import {
  ChevronDown,
  ChevronRight,
  Edit2,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  CatalogItemData,
  CategoryData,
  SubcategoryData,
} from "./catalog-content";
import { CatalogItemRow } from "./catalog-item-row";

// Regex for stripping number prefix (at module level for performance)
const NUMBER_PREFIX_REGEX = /^\d+\.\s*/;

// Strip leading numbering like "1. " or "10. " from category names
function stripNumberPrefix(name: string): string {
  return name.replace(NUMBER_PREFIX_REGEX, "");
}

interface CatalogCategoryCardProps {
  category: CategoryData;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onItemUpdate: (itemId: string, updates: Partial<CatalogItemData>) => void;
  onEditCategory: () => void;
  onDeleteCategory: () => void;
  onAddSubcategory: () => void;
  onAddItem: (subcategoryId?: string, parentName?: string) => void;
  onEditItem: (item: CatalogItemData, subcategoryId?: string) => void;
  onDeleteItem: (itemId: string) => void;
  onEditSubcategory: (subcategory: SubcategoryData) => void;
  onDeleteSubcategory: (subcategoryId: string) => void;
  onToggleSubcategoryHidden: (
    subcategoryId: string,
    currentHidden: boolean
  ) => void;
  readOnly?: boolean;
}

export function CatalogCategoryCard({
  category,
  index,
  isExpanded,
  onToggle,
  onItemUpdate,
  onEditCategory,
  onDeleteCategory,
  onAddSubcategory,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onEditSubcategory,
  onDeleteSubcategory,
  onToggleSubcategoryHidden,
  readOnly = false,
}: CatalogCategoryCardProps) {
  // Display name with dynamic numbering (strip any existing number prefix)
  const displayName = `${index + 1}. ${stripNumberPrefix(category.name)}`;
  const [expandedSubcategories, setExpandedSubcategories] = useState<
    Set<string>
  >(new Set());

  const toggleSubcategory = (subcatId: string) => {
    setExpandedSubcategories((prev) => {
      const next = new Set(prev);
      if (next.has(subcatId)) {
        next.delete(subcatId);
      } else {
        next.add(subcatId);
      }
      return next;
    });
  };

  const totalItems =
    category.items.length +
    category.subcategories.reduce((sum, sub) => sum + sub.items.length, 0);

  const handleDeleteCategory = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteCategory();
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-card transition-all duration-200 hover:border-border">
      {/* Category Header */}
      <div
        className="group flex cursor-pointer items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/30"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <button
          className="rounded p-0.5 transition-colors hover:bg-muted"
          type="button"
        >
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display font-semibold text-base">
            {displayName}
          </h3>
          <p className="text-muted-foreground text-xs">
            {totalItems} item{totalItems !== 1 ? "s" : ""} •{" "}
            <span className="capitalize">
              {category.selectionMode.replace("-", " ")}
            </span>
          </p>
        </div>

        {/* Visible action buttons */}
        {!readOnly && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              className="h-7 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onAddItem(undefined, category.name);
              }}
              size="sm"
              title="Add Item"
              variant="ghost"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Item
            </Button>
            <Button
              className="h-7 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onAddSubcategory();
              }}
              size="sm"
              title="Add Subcategory"
              variant="ghost"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Subcategory
            </Button>
            <div className="mx-1 h-5 w-px bg-border/50" />
            <Button
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                onEditCategory();
              }}
              size="icon"
              title="Edit category"
              variant="ghost"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleDeleteCategory}
              size="icon"
              title="Delete category"
              variant="ghost"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-border/50 border-t">
          {/* Direct Items (no subcategory) */}
          {category.items.length > 0 && (
            <div className="divide-y divide-border/30">
              {category.items.map((item) => (
                <CatalogItemRow
                  item={item}
                  key={item.id}
                  onDelete={() => onDeleteItem(item.id)}
                  onEdit={() => onEditItem(item)}
                  onUpdate={(updates) => onItemUpdate(item.id, updates)}
                  readOnly={readOnly}
                />
              ))}
            </div>
          )}

          {/* Subcategories */}
          {category.subcategories.map((subcategory) => (
            <SubcategorySection
              isExpanded={expandedSubcategories.has(subcategory.id)}
              key={subcategory.id}
              onAddItem={() => onAddItem(subcategory.id, subcategory.name)}
              onDeleteItem={onDeleteItem}
              onDeleteSubcategory={() => onDeleteSubcategory(subcategory.id)}
              onEditItem={(item) => onEditItem(item, subcategory.id)}
              onEditSubcategory={() => onEditSubcategory(subcategory)}
              onItemUpdate={onItemUpdate}
              onToggle={() => toggleSubcategory(subcategory.id)}
              onToggleHidden={() =>
                onToggleSubcategoryHidden(subcategory.id, subcategory.hidden)
              }
              readOnly={readOnly}
              subcategory={subcategory}
            />
          ))}

          {/* Empty state */}
          {category.items.length === 0 &&
            category.subcategories.length === 0 && (
              <div className="px-5 py-8 text-center">
                <p className="mb-3 text-muted-foreground text-sm">
                  No items in this category yet.
                </p>
                {!readOnly && (
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      onClick={() => onAddItem(undefined, category.name)}
                      size="sm"
                      variant="outline"
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add Item
                    </Button>
                    <Button
                      onClick={onAddSubcategory}
                      size="sm"
                      variant="outline"
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add Subcategory
                    </Button>
                  </div>
                )}
              </div>
            )}
        </div>
      )}
    </div>
  );
}

interface SubcategorySectionProps {
  subcategory: SubcategoryData;
  isExpanded: boolean;
  onToggle: () => void;
  onItemUpdate: (itemId: string, updates: Partial<CatalogItemData>) => void;
  onAddItem: () => void;
  onEditItem: (item: CatalogItemData) => void;
  onDeleteItem: (itemId: string) => void;
  onEditSubcategory: () => void;
  onDeleteSubcategory: () => void;
  onToggleHidden: () => void;
  readOnly?: boolean;
}

function SubcategorySection({
  subcategory,
  isExpanded,
  onToggle,
  onItemUpdate,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onEditSubcategory,
  onDeleteSubcategory,
  onToggleHidden,
  readOnly = false,
}: SubcategorySectionProps) {
  const handleToggleHidden = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleHidden();
  };

  return (
    <div className="border-border/30 border-t">
      {/* Subcategory Header */}
      <div
        className="group flex cursor-pointer items-center gap-3 bg-muted/20 px-5 py-3 transition-colors hover:bg-muted/40"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <button
          className="rounded p-0.5 transition-colors hover:bg-muted"
          type="button"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <h4 className="truncate font-medium text-sm">
            {subcategory.name}
            {subcategory.hidden && (
              <span className="ml-2 text-muted-foreground/60 text-xs">
                (Hidden)
              </span>
            )}
          </h4>
          <p className="text-muted-foreground text-xs">
            {subcategory.items.length} item
            {subcategory.items.length !== 1 ? "s" : ""} •{" "}
            <span className="capitalize">
              {subcategory.selectionMode.replace("-", " ")}
            </span>
          </p>
        </div>

        {/* Visible action buttons */}
        {!readOnly && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              className="h-6 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onAddItem();
              }}
              size="sm"
              title="Add Item"
              variant="ghost"
            >
              <Plus className="mr-1 h-3 w-3" />
              Item
            </Button>
            <div className="mx-1 h-4 w-px bg-border/50" />
            <Button
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onEditSubcategory();
              }}
              size="icon"
              title="Edit subcategory"
              variant="ghost"
            >
              <Edit2 className="h-3 w-3" />
            </Button>
            <Button
              className="h-6 w-6"
              onClick={handleToggleHidden}
              size="icon"
              title={
                subcategory.hidden ? "Show subcategory" : "Hide subcategory"
              }
              variant="ghost"
            >
              {subcategory.hidden ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
            </Button>
            <Button
              className="h-6 w-6 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteSubcategory();
              }}
              size="icon"
              title="Delete subcategory"
              variant="ghost"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Subcategory Items */}
      {isExpanded &&
        (subcategory.items.length > 0 ? (
          <div className="divide-y divide-border/30 bg-muted/10">
            {subcategory.items.map((item) => (
              <CatalogItemRow
                indented
                item={item}
                key={item.id}
                onDelete={() => onDeleteItem(item.id)}
                onEdit={() => onEditItem(item)}
                onUpdate={(updates) => onItemUpdate(item.id, updates)}
                readOnly={readOnly}
              />
            ))}
          </div>
        ) : (
          <div className="bg-muted/10 px-5 py-4 text-center">
            <p className="mb-2 text-muted-foreground text-xs">No items yet</p>
            {!readOnly && (
              <Button
                className="h-7 text-xs"
                onClick={onAddItem}
                size="sm"
                variant="outline"
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Item
              </Button>
            )}
          </div>
        ))}
    </div>
  );
}
