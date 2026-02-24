"use client";

import { format } from "date-fns/format";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils";

export function SetDateDropdown({
  onChange,
  value,
  placeholder,
  disabled,
}: {
  onChange: (date?: Date) => void;
  value?: Date;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Popover modal={true}>
      <PopoverTrigger asChild>
        <Button
          className={cn(
            "w-full pl-3 text-left font-normal",
            !value && "text-muted-foreground"
          )}
          disabled={disabled}
          variant="outline"
        >
          {value ? (
            format(value, "PPP")
          ) : (
            <span>{placeholder || "Set a date"}</span>
          )}
          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          disabled={(date) =>
            date > new Date() || date < new Date("1900-01-01")
          }
          initialFocus
          mode="single"
          onSelect={onChange}
          selected={value}
        />
      </PopoverContent>
    </Popover>
  );
}
