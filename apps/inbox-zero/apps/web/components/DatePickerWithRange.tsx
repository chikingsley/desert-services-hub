"use client";

import { differenceInDays, subDays } from "date-fns";
import { format } from "date-fns/format";
import { CalendarIcon, ChevronDown } from "lucide-react";
import type * as React from "react";
import { useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { List } from "@/components/List";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils";

function getRelativeDateLabel(days: number) {
  if (days === 1) {
    return "Last day";
  }
  if (days === 7) {
    return "Last week";
  }
  if (days === 30) {
    return "Last month";
  }
  if (days === 90) {
    return "Last 3 months";
  }
  if (days === 365) {
    return "Last year";
  }
  return "All";
}

interface DatePickerWithRangeProps
  extends React.HTMLAttributes<HTMLDivElement> {
  dateDropdown: string;
  dateRange?: DateRange;
  onSetDateDropdown: (option: { label: string; value: string }) => void;
  onSetDateRange: (dateRange?: DateRange) => void;
  selectOptions: { label: string; value: string }[];
}

export function DatePickerWithRange({
  dateRange,
  onSetDateRange,
  selectOptions,
  dateDropdown,
  onSetDateDropdown,
}: DatePickerWithRangeProps) {
  const now = useMemo(() => new Date(), []);
  const days =
    dateRange?.from && dateRange?.to
      ? differenceInDays(dateRange.to, dateRange.from)
      : 0;
  const relativeDateLabel = getRelativeDateLabel(days);

  return (
    <Popover modal={true}>
      <PopoverTrigger asChild>
        <Button
          className={cn(
            "min-w-52 justify-between whitespace-nowrap px-3 text-left font-normal",
            !dateRange && "text-muted-foreground"
          )}
          id="date"
          variant="outline"
        >
          <div className="flex items-center">
            <CalendarIcon className="mr-2 hidden h-4 w-4 sm:block" />
            {relativeDateLabel ||
              (dateRange?.from ? (
                dateRange.to ? (
                  <>
                    {format(dateRange.from, "LLL dd, y")} -{" "}
                    {format(dateRange.to, "LLL dd, y")}
                  </>
                ) : (
                  format(dateRange.from, "LLL dd, y")
                )
              ) : (
                <span>Pick a date</span>
              ))}
          </div>
          <ChevronDown className="ml-2 h-4 w-4 text-gray-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          defaultMonth={dateRange?.from}
          initialFocus
          mode="range"
          numberOfMonths={2}
          onSelect={onSetDateRange}
          rightContent={
            <List
              className="min-w-32"
              items={selectOptions}
              onSelect={({ label, value }) => {
                onSetDateDropdown({ label, value });
                // When "All" is selected (value "0"), pass undefined to skip date filtering
                if (value === "0") {
                  onSetDateRange(undefined);
                } else {
                  onSetDateRange({
                    from: subDays(now, Number.parseInt(value)),
                    to: now,
                  });
                }
              }}
              value={
                selectOptions.find((option) => option.label === dateDropdown)
                  ?.value
              }
            />
          }
          selected={dateRange}
        />
      </PopoverContent>
    </Popover>
  );
}
