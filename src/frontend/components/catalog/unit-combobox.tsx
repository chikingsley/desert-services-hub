"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useState } from "react";
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
import { cn } from "@/lib/utils";

// Standard units - consolidated list
const STANDARD_UNITS = [
  { value: "Each", label: "Each", description: "Per item" },
  { value: "LF", label: "LF", description: "Linear Foot" },
  { value: "SF", label: "SF", description: "Square Foot" },
  { value: "Hour", label: "Hour", description: "Hourly rate" },
  { value: "Day", label: "Day", description: "Daily rate" },
  { value: "Week", label: "Week", description: "Weekly rate" },
  { value: "Month", label: "Month", description: "Monthly rate" },
  { value: "Visit", label: "Visit", description: "Per visit" },
  { value: "Pull", label: "Pull", description: "Per pickup" },
  { value: "Ton", label: "Ton", description: "Per ton" },
  { value: "Unit", label: "Unit", description: "Per unit" },
  { value: "EA/Mo", label: "EA/Mo", description: "Each per month" },
  { value: "LF/Mo", label: "LF/Mo", description: "Linear foot per month" },
];

interface UnitComboboxProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function UnitCombobox({
  value,
  onChange,
  disabled,
  className,
}: UnitComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [customUnits, setCustomUnits] = useState<string[]>([]);

  // Combine standard and custom units
  const allUnits = [
    ...STANDARD_UNITS,
    ...customUnits.map((u) => ({ value: u, label: u, description: "Custom" })),
  ];

  const selectedUnit = allUnits.find((u) => u.value === value);

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue);
    setOpen(false);
    setInputValue("");
  };

  const handleAddCustom = () => {
    const trimmed = inputValue.trim();
    if (
      trimmed &&
      !allUnits.some((u) => u.value.toLowerCase() === trimmed.toLowerCase())
    ) {
      setCustomUnits((prev) => [...prev, trimmed]);
      onChange(trimmed);
    }
    setOpen(false);
    setInputValue("");
  };

  // Check if input matches any existing unit
  const inputMatchesExisting = allUnits.some(
    (u) => u.value.toLowerCase() === inputValue.trim().toLowerCase()
  );
  const showAddOption = inputValue.trim() && !inputMatchesExisting;

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className={cn(
            "h-10 w-full justify-between font-normal",
            !value && "text-muted-foreground",
            className
          )}
          disabled={disabled}
          role="combobox"
          variant="outline"
        >
          <span className="truncate">
            {selectedUnit ? selectedUnit.label : value || "Select unit..."}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[200px] p-0">
        <Command>
          <CommandInput
            className="h-9"
            onValueChange={setInputValue}
            placeholder="Search or add..."
            value={inputValue}
          />
          <CommandList>
            <CommandEmpty>
              {inputValue.trim() ? (
                <button
                  className="flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent"
                  onClick={handleAddCustom}
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                  Add "{inputValue.trim()}"
                </button>
              ) : (
                "No unit found."
              )}
            </CommandEmpty>
            <CommandGroup>
              {allUnits.map((unit) => (
                <CommandItem
                  key={unit.value}
                  onSelect={() => handleSelect(unit.value)}
                  value={unit.value}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === unit.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-1 items-center justify-between">
                    <span>{unit.label}</span>
                    <span className="text-muted-foreground text-xs">
                      {unit.description}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {showAddOption && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={handleAddCustom}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add "{inputValue.trim()}"
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
