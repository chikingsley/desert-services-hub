"use client";

import type { Catalog } from "@/packages/estimates/catalog/types";
import { ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/apps/web/frontend/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/apps/web/frontend/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/apps/web/frontend/components/ui/popover";
import type { CatalogItemInfo } from "@/apps/web/frontend/lib/catalog-item-info";
import { cn } from "@/lib/utils";

interface ItemComboboxProps {
  catalog: Catalog;
  currentValue: string;
  categoryId?: string; // Optional: filter to items in this category
  onSelect: (item: CatalogItemInfo) => void;
  disabled?: boolean;
  className?: string;
}

interface FlattenedItem {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  defaultQty?: number;
  categoryId: string;
  categoryName: string;
  subcategoryId?: string;
  subcategoryName?: string;
}

function flattenCategory(
  category: Catalog["categories"][number],
  items: FlattenedItem[]
): void {
  for (const item of category.items ?? []) {
    items.push({
      id: `${category.id}::${item.code}`,
      code: item.code,
      name: item.name,
      description: item.description || "",
      price: item.price,
      unit: item.unit,
      defaultQty: item.defaultQty,
      categoryId: category.id,
      categoryName: category.name,
    });
  }
  for (const sub of category.subcategories ?? []) {
    if (sub.hidden) {
      continue;
    }
    for (const item of sub.items) {
      items.push({
        id: `${category.id}::${sub.id}::${item.code}`,
        code: item.code,
        name: item.name,
        description: item.description || "",
        price: item.price,
        unit: item.unit,
        defaultQty: item.defaultQty,
        categoryId: category.id,
        categoryName: category.name,
        subcategoryId: sub.id,
        subcategoryName: sub.name,
      });
    }
  }
}

function flattenCatalogItems(
  catalog: Catalog,
  filterCategoryId?: string
): FlattenedItem[] {
  const items: FlattenedItem[] = [];
  for (const category of catalog.categories) {
    if (filterCategoryId && category.id !== filterCategoryId) {
      continue;
    }
    flattenCategory(category, items);
  }
  return items;
}

export function ItemCombobox({
  catalog,
  currentValue,
  categoryId,
  onSelect,
  disabled,
  className,
}: ItemComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const flattenedItems = useMemo(
    () => flattenCatalogItems(catalog, categoryId),
    [catalog, categoryId]
  );

  const groupedItems = useMemo(() => {
    const groups: Record<string, FlattenedItem[]> = {};
    for (const item of flattenedItems) {
      const groupKey = item.subcategoryName || item.categoryName;
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(item);
    }
    return groups;
  }, [flattenedItems]);

  const handleSelect = (item: FlattenedItem) => {
    onSelect({
      code: item.code,
      name: item.name,
      description: item.description,
      price: item.price,
      unit: item.unit,
      defaultQty: item.defaultQty,
    });
    setOpen(false);
    setInputValue("");
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className={cn(
            "h-9 w-full justify-between border-border/50 bg-background text-left font-normal text-sm",
            className
          )}
          disabled={disabled}
          role="combobox"
          variant="outline"
        >
          <span className="truncate">{currentValue || "Select item..."}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] min-w-[300px] p-0"
      >
        <Command>
          <CommandInput
            className="h-9"
            onValueChange={setInputValue}
            placeholder="Search items..."
            value={inputValue}
          />
          <CommandList className="max-h-64">
            <CommandEmpty>No items found.</CommandEmpty>
            {Object.entries(groupedItems).map(([groupName, items]) => (
              <CommandGroup
                className="[&_[cmdk-group-heading]]:bg-muted/50 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:text-xs"
                heading={groupName}
                key={groupName}
              >
                {items.map((item) => (
                  <CommandItem
                    className="flex justify-between py-2"
                    key={item.id}
                    onSelect={() => handleSelect(item)}
                    value={`${item.name} ${item.description}`}
                  >
                    <span className="truncate font-medium">{item.name}</span>
                    <span className="ml-2 shrink-0 text-muted-foreground text-xs">
                      ${item.price.toFixed(2)}/{item.unit}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
