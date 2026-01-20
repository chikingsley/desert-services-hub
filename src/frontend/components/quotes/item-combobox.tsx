"use client";

import { ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Catalog } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CatalogItemInfo {
  name: string;
  description: string;
  price: number;
  unit: string;
}

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
  name: string;
  description: string;
  price: number;
  unit: string;
  categoryId: string;
  categoryName: string;
  subcategoryId?: string;
  subcategoryName?: string;
}

function flattenCatalogItems(
  catalog: Catalog,
  filterCategoryId?: string
): FlattenedItem[] {
  const items: FlattenedItem[] = [];

  for (const category of catalog.categories) {
    // Skip if filtering by category and this isn't the one
    if (filterCategoryId && category.id !== filterCategoryId) {
      continue;
    }

    // Direct items under category
    if (category.items && category.items.length > 0) {
      for (const item of category.items) {
        items.push({
          id: `${category.id}::${item.code}`,
          name: item.name,
          description: item.description || "",
          price: item.price,
          unit: item.unit,
          categoryId: category.id,
          categoryName: category.name,
        });
      }
    }

    // Items in subcategories
    if (category.subcategories) {
      for (const sub of category.subcategories) {
        if (sub.hidden) {
          continue;
        }

        for (const item of sub.items) {
          items.push({
            id: `${category.id}::${sub.id}::${item.code}`,
            name: item.name,
            description: item.description || "",
            price: item.price,
            unit: item.unit,
            categoryId: category.id,
            categoryName: category.name,
            subcategoryId: sub.id,
            subcategoryName: sub.name,
          });
        }
      }
    }
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
      name: item.name,
      description: item.description,
      price: item.price,
      unit: item.unit,
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
