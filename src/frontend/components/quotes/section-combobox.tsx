"use client";

import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";
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

interface SectionComboboxProps {
  catalog: Catalog;
  onSelect: (categoryId: string) => void;
  disabled?: boolean;
  className?: string;
}

export function SectionCombobox({
  catalog,
  onSelect,
  disabled,
  className,
}: SectionComboboxProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (categoryId: string) => {
    onSelect(categoryId);
    setOpen(false);
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
          <span className="truncate text-muted-foreground">Add section...</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] p-0"
      >
        <Command>
          <CommandInput className="h-9" placeholder="Search sections..." />
          <CommandList>
            <CommandEmpty>No section found.</CommandEmpty>
            <CommandGroup>
              {catalog.categories.map((category) => (
                <CommandItem
                  key={category.id}
                  onSelect={() => handleSelect(category.id)}
                  value={category.name}
                >
                  {category.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
