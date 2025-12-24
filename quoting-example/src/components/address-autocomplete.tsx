"use client";

import { ChevronsUpDown, Loader2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
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
import { cn } from "@/lib/utils";
import { useAddressAutocomplete } from "../hooks/useAddressAutocomplete";

type AddressAutocompleteProps = {
  value: string;
  onChange: (address: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
};

export function AddressAutocomplete({
  value,
  onChange,
  disabled,
  className,
  placeholder = "Enter address...",
}: AddressAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [debouncedInput, setDebouncedInput] = useState("");

  const { suggestions, isLoading, selectPlace } =
    useAddressAutocomplete(debouncedInput);

  // Handle input changes with debounced API calls
  const handleInputChange = useCallback((newValue: string) => {
    setInputValue(newValue);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedInput(newValue);
    }, 300);
  }, []);

  // Handle place selection
  const handleSelect = useCallback(
    async (placeId: string) => {
      const address = await selectPlace(placeId);
      onChange(address);
      setOpen(false);
      setInputValue("");
    },
    [selectPlace, onChange]
  );

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            className
          )}
          disabled={disabled}
          role="combobox"
          variant="outline"
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            data-form-type="other"
            data-lpignore="true"
            onValueChange={handleInputChange}
            placeholder="Search address..."
            spellCheck={false}
            value={inputValue}
          />
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              <>
                <CommandEmpty>
                  {inputValue.length < 1
                    ? "Start typing to search..."
                    : "No addresses found."}
                </CommandEmpty>
                <CommandGroup>
                  {suggestions.map((suggestion) => (
                    <CommandItem
                      key={suggestion.placeId}
                      onSelect={handleSelect}
                      value={suggestion.placeId}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {suggestion.mainText}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {suggestion.secondaryText}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
