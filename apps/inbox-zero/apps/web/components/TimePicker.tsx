"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/utils";

interface TimePickerProps {
  className?: string;
  disabled?: boolean;
  id?: string;
  label?: string;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
}

export function TimePicker({
  id = "time-picker",
  label = "Time",
  value,
  onChange,
  className,
  disabled = false,
  required = false,
}: TimePickerProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        className={cn(
          "w-32 appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none",
          className
        )}
        disabled={disabled}
        id={id}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        type="time"
        value={value}
      />
    </div>
  );
}
