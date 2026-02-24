"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/apps/web/frontend/components/ui/badge";
import { Button } from "@/apps/web/frontend/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/apps/web/frontend/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/apps/web/frontend/components/ui/popover";
import { cn } from "@/lib/utils";

export interface FacetOption {
  count?: number;
  label: string;
  value: string;
}

interface FacetedMultiSelectProps {
  className?: string;
  onApply: (values: string[]) => void;
  options: FacetOption[];
  searchPlaceholder?: string;
  selectedValues: string[];
  title: string;
}

export function FacetedMultiSelect({
  title,
  options,
  selectedValues,
  onApply,
  className,
  searchPlaceholder,
}: FacetedMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [draftValues, setDraftValues] = useState<string[]>(selectedValues);

  useEffect(() => {
    if (!open) {
      setDraftValues(selectedValues);
    }
  }, [open, selectedValues]);

  const selectedSet = useMemo(() => new Set(draftValues), [draftValues]);

  const triggerLabel = useMemo(() => {
    if (selectedValues.length === 0) {
      return title;
    }

    const labels = options
      .filter((option) => selectedValues.includes(option.value))
      .map((option) => option.label);

    if (labels.length === 0) {
      return title;
    }

    if (labels.length <= 2) {
      return `${title}: ${labels.join(", ")}`;
    }

    return `${title}: ${labels.length} selected`;
  }, [options, selectedValues, title]);

  const toggleValue = (value: string) => {
    setDraftValues((current) => {
      if (current.includes(value)) {
        return current.filter((item) => item !== value);
      }
      return [...current, value];
    });
  };

  const handleApply = () => {
    onApply(draftValues);
    setOpen(false);
  };

  const handleClear = () => {
    setDraftValues([]);
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          className={cn("min-w-[190px] justify-between", className)}
          size="sm"
          variant="outline"
        >
          <span className="truncate">{triggerLabel}</span>
          <span className="ml-2 flex items-center gap-2">
            {selectedValues.length > 0 ? (
              <Badge variant="secondary">{selectedValues.length}</Badge>
            ) : null}
            <ChevronsUpDown className="h-4 w-4 opacity-60" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-0">
        <Command>
          <CommandInput
            placeholder={
              searchPlaceholder || `Filter ${title.toLowerCase()}...`
            }
          />
          <CommandList>
            <CommandEmpty>No options found.</CommandEmpty>
            {options.map((option) => {
              const checked = selectedSet.has(option.value);
              return (
                <CommandItem
                  key={option.value}
                  onSelect={() => toggleValue(option.value)}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-sm border",
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input"
                    )}
                  >
                    {checked ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="flex-1 truncate">{option.label}</span>
                  {typeof option.count === "number" ? (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {option.count}
                    </span>
                  ) : null}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>

        <div className="flex items-center justify-between border-t p-2">
          <Button onClick={handleClear} size="sm" variant="ghost">
            Clear
          </Button>
          <Button onClick={handleApply} size="sm">
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
