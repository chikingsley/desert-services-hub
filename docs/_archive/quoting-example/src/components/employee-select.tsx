"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useState } from "react";
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
import { type Employee, fetchEmployees } from "../api";

type EmployeeSelectProps = {
  value: string;
  onChange: (name: string, email: string) => void;
  disabled?: boolean;
  className?: string;
};

export function EmployeeSelect({
  value,
  onChange,
  disabled,
  className,
}: EmployeeSelectProps) {
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEmployees()
      .then(setEmployees)
      .catch((err) => console.error("Failed to fetch employees:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = (selectedName: string) => {
    const employee = employees.find((emp) => emp.name.trim() === selectedName);
    if (employee) {
      onChange(employee.name.trim(), employee.email);
    }
    setOpen(false);
  };

  if (loading) {
    return (
      <div className={cn("h-9 animate-pulse rounded-md bg-muted", className)} />
    );
  }

  // Find selected employee to display their name
  const selectedEmployee = employees.find((emp) => emp.name.trim() === value);
  const displayValue = selectedEmployee ? selectedEmployee.name.trim() : null;

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
          <span className="truncate">
            {displayValue || "Select estimator..."}
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
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            placeholder="Search estimator..."
            spellCheck={false}
          />
          <CommandList>
            <CommandEmpty>No estimator found.</CommandEmpty>
            <CommandGroup>
              {employees.map((employee) => (
                <CommandItem
                  key={employee.id}
                  onSelect={handleSelect}
                  value={employee.name.trim()}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === employee.name.trim()
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{employee.name.trim()}</span>
                    {employee.title && (
                      <span className="text-muted-foreground text-xs">
                        {employee.title}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
