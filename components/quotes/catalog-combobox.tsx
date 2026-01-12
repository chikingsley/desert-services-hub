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

interface CatalogComboboxProps {
  catalog: Catalog;
  onSelect: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

interface FlattenedItem {
  value: string;
  label: string;
  price: string;
  categoryId: string;
  categoryName: string;
  subcategoryId?: string;
  subcategoryName?: string;
  isPickOne?: boolean;
}

function flattenCatalog(catalog: Catalog): FlattenedItem[] {
  const items: FlattenedItem[] = [];

  for (const category of catalog.categories) {
    if (category.items && category.items.length > 0) {
      for (const item of category.items) {
        items.push({
          value: `${category.id}::${item.code}`,
          label: item.name,
          price: `$${item.price.toFixed(2)}/${item.unit}`,
          categoryId: category.id,
          categoryName: category.name,
        });
      }
    }

    if (category.subcategories) {
      for (const sub of category.subcategories) {
        if (sub.hidden) {
          continue;
        }

        if (sub.id === "dust-permits") {
          items.push({
            value: `${category.id}::DUST-PERMIT`,
            label: "Dust Permit (by acreage)",
            price: "Enter acreage to calculate",
            categoryId: category.id,
            categoryName: category.name,
            subcategoryId: sub.id,
            subcategoryName: sub.name,
          });
          continue;
        }

        const isPickOne = sub.selectionMode === "pick-one";
        for (const item of sub.items) {
          items.push({
            value: `${category.id}::${sub.id}::${item.code}`,
            label: item.name,
            price: `$${item.price.toFixed(2)}/${item.unit}`,
            categoryId: category.id,
            categoryName: category.name,
            subcategoryId: sub.id,
            subcategoryName: sub.name,
            isPickOne,
          });
        }
      }
    }
  }

  return items;
}

export function CatalogCombobox({
  catalog,
  onSelect,
  disabled,
  className,
}: CatalogComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const flattenedItems = useMemo(() => flattenCatalog(catalog), [catalog]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, FlattenedItem[]> = {};
    for (const item of flattenedItems) {
      const groupKey = item.categoryName;
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(item);
    }
    return groups;
  }, [flattenedItems]);

  const handleSelect = (value: string) => {
    onSelect(value);
    setOpen(false);
    setInputValue("");
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className={cn("h-10 w-full justify-between font-normal", className)}
          disabled={disabled}
          role="combobox"
          variant="outline"
        >
          <span className="truncate text-muted-foreground">
            Select a service...
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] p-0"
      >
        <Command>
          <CommandInput
            className="h-9"
            onValueChange={setInputValue}
            placeholder="Search services..."
            value={inputValue}
          />
          <CommandList className="max-h-80">
            <CommandEmpty>No service found.</CommandEmpty>
            {Object.entries(groupedItems).map(([categoryName, items]) => (
              <CommandGroup
                className="[&_[cmdk-group-heading]]:bg-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-foreground"
                heading={categoryName}
                key={categoryName}
              >
                {items.map((item) => (
                  <CommandItem
                    className="flex justify-between"
                    key={item.value}
                    onSelect={() => handleSelect(item.value)}
                    value={`${item.label} ${item.categoryName} ${item.subcategoryName || ""}`}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{item.label}</span>
                      {item.subcategoryName && (
                        <span className="flex items-center gap-1 text-muted-foreground text-xs">
                          {item.subcategoryName}
                          {item.isPickOne && (
                            <span className="text-amber-500">(pick one)</span>
                          )}
                        </span>
                      )}
                    </div>
                    <span className="ml-2 text-muted-foreground text-xs">
                      {item.price}
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
