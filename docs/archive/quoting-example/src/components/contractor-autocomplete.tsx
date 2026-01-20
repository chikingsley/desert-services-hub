"use client";

import { ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { useCallback, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { type Contractor, createContractor, fetchContractors } from "../api";

type ContractorAutocompleteProps = {
  value: string;
  onChange: (name: string, contractor?: Contractor) => void;
  disabled?: boolean;
  className?: string;
};

export function ContractorAutocomplete({
  value,
  onChange,
  disabled,
  className,
}: ContractorAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    address: "",
    email: "",
    phone: "",
  });

  // Search contractors
  const search = useCallback(async (term: string) => {
    if (!term || term.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const contractors = await fetchContractors(term, 10);
      setResults(contractors);
    } catch (err) {
      console.error("Failed to search contractors:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle input changes with debounced search
  const handleInputChange = useCallback(
    (newValue: string) => {
      setInputValue(newValue);
      setShowCreateForm(false);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => search(newValue), 300);
    },
    [search]
  );

  // Handle selection
  const handleSelect = useCallback(
    (contractorId: string) => {
      const contractor = results.find((c) => String(c.id) === contractorId);
      if (contractor) {
        onChange(contractor.name, contractor);
        setOpen(false);
        setInputValue("");
        setResults([]);
      }
    },
    [results, onChange]
  );

  // Handle create click
  const handleCreateClick = useCallback(() => {
    setCreateForm({
      name: inputValue,
      address: "",
      email: "",
      phone: "",
    });
    setShowCreateForm(true);
  }, [inputValue]);

  // Handle create submit
  const handleCreateSubmit = useCallback(async () => {
    if (!createForm.name.trim()) {
      return;
    }

    setCreating(true);
    try {
      const newContractor = await createContractor({
        name: createForm.name.trim(),
        address: createForm.address.trim() || undefined,
        email: createForm.email.trim() || undefined,
        phone: createForm.phone.trim() || undefined,
      });
      onChange(newContractor.name, newContractor);
      setOpen(false);
      setInputValue("");
      setResults([]);
      setShowCreateForm(false);
      setCreateForm({ name: "", address: "", email: "", phone: "" });
    } catch (err) {
      console.error("Failed to create contractor:", err);
    } finally {
      setCreating(false);
    }
  }, [createForm, onChange]);

  // Handle cancel create
  const handleCancelCreate = useCallback(() => {
    setShowCreateForm(false);
    setCreateForm({ name: "", address: "", email: "", phone: "" });
  }, []);

  return (
    <Popover
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
          setShowCreateForm(false);
        }
      }}
      open={open}
    >
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
          <span className="truncate">{value || "Search companies..."}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] p-0"
      >
        {showCreateForm ? (
          <div className="space-y-3 p-3">
            <div className="font-medium text-sm">Create New Company</div>
            <div className="space-y-2">
              <div>
                <Label className="text-xs" htmlFor="create-name">
                  Name *
                </Label>
                <Input
                  autoFocus
                  className="h-8 text-sm"
                  id="create-name"
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Company name"
                  value={createForm.name}
                />
              </div>
              <div>
                <Label className="text-xs" htmlFor="create-address">
                  Address
                </Label>
                <Input
                  className="h-8 text-sm"
                  id="create-address"
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, address: e.target.value }))
                  }
                  placeholder="123 Main St, City, State"
                  value={createForm.address}
                />
              </div>
              <div>
                <Label className="text-xs" htmlFor="create-email">
                  Email
                </Label>
                <Input
                  className="h-8 text-sm"
                  id="create-email"
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, email: e.target.value }))
                  }
                  placeholder="contact@company.com"
                  type="email"
                  value={createForm.email}
                />
              </div>
              <div>
                <Label className="text-xs" htmlFor="create-phone">
                  Phone
                </Label>
                <Input
                  className="h-8 text-sm"
                  id="create-phone"
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  placeholder="(555) 123-4567"
                  type="tel"
                  value={createForm.phone}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                disabled={creating}
                onClick={handleCancelCreate}
                size="sm"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button
                disabled={creating || !createForm.name.trim()}
                onClick={handleCreateSubmit}
                size="sm"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Create"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <Command shouldFilter={false}>
            <CommandInput
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              data-form-type="other"
              data-lpignore="true"
              onValueChange={handleInputChange}
              placeholder="Search companies..."
              spellCheck={false}
              value={inputValue}
            />
            <CommandList>
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : (
                <>
                  {results.length === 0 && inputValue.length >= 2 && (
                    <CommandEmpty>No companies found.</CommandEmpty>
                  )}
                  {results.length === 0 && inputValue.length < 2 && (
                    <CommandEmpty>Type at least 2 characters...</CommandEmpty>
                  )}
                  {results.length > 0 && (
                    <CommandGroup>
                      {results.map((contractor) => (
                        <CommandItem
                          key={contractor.id}
                          onSelect={handleSelect}
                          value={String(contractor.id)}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {contractor.name}
                            </span>
                            {contractor.email && (
                              <span className="text-muted-foreground text-xs">
                                {contractor.email}
                              </span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {inputValue.length >= 1 && (
                    <>
                      <CommandSeparator />
                      <CommandGroup>
                        <CommandItem
                          className="text-primary"
                          onSelect={handleCreateClick}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          <span>Create "{inputValue}"</span>
                        </CommandItem>
                      </CommandGroup>
                    </>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
