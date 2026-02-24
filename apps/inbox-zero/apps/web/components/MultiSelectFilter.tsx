"use client";

import { CheckIcon } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/utils";

interface MultiSelectFilterProps<_TData, _TValue> {
  maxDisplayedValues?: number;
  options: {
    label: string;
    value: string;
    icon?: React.ComponentType<{ className?: string }>;
  }[];
  selectedValues: Set<string>;
  setSelectedValues: (values: Set<string>) => void;
  title?: string;
}

export function MultiSelectFilter<TData, TValue>({
  title,
  options,
  selectedValues,
  setSelectedValues,
  maxDisplayedValues,
}: MultiSelectFilterProps<TData, TValue>) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="h-8 border-dashed" size="sm" variant="outline">
          {title}
          {selectedValues?.size > 0 && (
            <>
              <Separator className="mx-2 h-4" orientation="vertical" />
              <Badge
                className="rounded-sm px-1 font-normal lg:hidden"
                variant="secondary"
              >
                {selectedValues.size}
              </Badge>
              <div className="hidden space-x-1 lg:flex">
                {typeof maxDisplayedValues === "number" &&
                selectedValues.size > maxDisplayedValues ? (
                  <Badge
                    className="rounded-sm px-1 font-normal"
                    variant="secondary"
                  >
                    {selectedValues.size} selected
                  </Badge>
                ) : (
                  options
                    .filter((option) => selectedValues.has(option.value))
                    .map((option) => (
                      <Badge
                        className="rounded-sm px-1 font-normal"
                        key={option.value}
                        variant="secondary"
                      >
                        {option.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                className="justify-center text-center"
                onSelect={() =>
                  setSelectedValues(
                    new Set(options.map((option) => option.value))
                  )
                }
              >
                Select all
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            {selectedValues.size > 0 && (
              <>
                <CommandGroup>
                  <CommandItem
                    className="justify-center text-center"
                    onSelect={() => setSelectedValues(new Set())}
                  >
                    Clear filters
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedValues.has(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      const newSelectedValues = new Set(selectedValues);
                      if (isSelected) {
                        newSelectedValues.delete(option.value);
                      } else {
                        newSelectedValues.add(option.value);
                      }
                      setSelectedValues(newSelectedValues);
                    }}
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible"
                      )}
                    >
                      <CheckIcon className={cn("h-4 w-4")} />
                    </div>
                    {option.icon && (
                      <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{option.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function useMultiSelectFilter(options: string[]) {
  const [selectedValues, setSelectedValues] = React.useState<Set<string>>(
    new Set(options)
  );
  return { selectedValues, setSelectedValues };
}
