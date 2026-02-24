"use client";

import { Label, Radio, RadioGroup } from "@headlessui/react";
import { cn } from "@/utils";

export const frequencies = [
  {
    value: "monthly" as const,
    label: "Monthly",
    priceSuffix: "/month, billed monthly",
  },
  {
    value: "annually" as const,
    label: "Annually",
    priceSuffix: "/month, billed annually",
  },
];

export type Frequency = (typeof frequencies)[number];

export function PricingFrequencyToggle({
  frequency,
  setFrequency,
  className,
  children,
}: {
  frequency: Frequency;
  setFrequency: (frequency: Frequency) => void;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <RadioGroup
        className="grid grid-cols-2 gap-x-1 rounded-full p-1 text-center font-semibold text-xs leading-5 ring-1 ring-gray-200 ring-inset"
        onChange={setFrequency}
        value={frequency}
      >
        <Label className="sr-only">Payment frequency</Label>
        {frequencies.map((option) => (
          <Radio
            className={({ checked }) =>
              cn(
                checked ? "bg-black text-white" : "text-gray-500",
                "cursor-pointer rounded-full px-2.5 py-1"
              )
            }
            key={option.value}
            value={option}
          >
            <span>{option.label}</span>
          </Radio>
        ))}
      </RadioGroup>
      {children}
    </div>
  );
}

export function DiscountBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-blue-600/10 px-2.5 py-1 font-semibold text-blue-600 text-xs leading-5">
      {children}
    </span>
  );
}
