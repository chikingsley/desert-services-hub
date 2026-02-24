"use client";

import { CheckIcon, XIcon } from "lucide-react";
import type { MouseEvent } from "react";
import { cn } from "@/utils";

interface YesNoIndicatorProps {
  /** When "wrong", the X button becomes a dropdown trigger (no onClick call, no stopPropagation) */
  dropdownTrigger?: "wrong";
  onClick?: (value: boolean) => void;
  size?: "sm" | "md";
  value: boolean | null | undefined;
  /** Force the X button to show as active (red) even when value !== false */
  wrongActive?: boolean;
}

export function YesNoIndicator({
  value,
  onClick,
  size = "md",
  dropdownTrigger,
  wrongActive,
}: YesNoIndicatorProps) {
  const iconSize = size === "sm" ? "size-3.5" : "size-4";
  const isInteractive = !!onClick || !!dropdownTrigger;

  if (!isInteractive) {
    if (value === true) {
      return (
        <span
          aria-label="Correct"
          className="inline-flex rounded-full bg-green-100 p-1.5 text-green-600 dark:bg-green-900/30 dark:text-green-400"
          role="status"
        >
          <CheckIcon className={iconSize} />
        </span>
      );
    }
    if (value === false) {
      return (
        <span
          aria-label="Wrong"
          className="inline-flex rounded-full bg-red-100 p-1.5 text-red-600 dark:bg-red-900/30 dark:text-red-400"
          role="status"
        >
          <XIcon className={iconSize} />
        </span>
      );
    }
    return <span className="text-muted-foreground text-xs">&mdash;</span>;
  }

  const handleCheckClick = (e: MouseEvent) => {
    if (dropdownTrigger) {
      e.stopPropagation();
    }
    if (value !== true) {
      onClick?.(true);
    }
  };

  const handleXClick = (_e: MouseEvent) => {
    if (dropdownTrigger === "wrong") {
      // Let the click propagate to the DropdownMenuTrigger parent
      return;
    }
    if (value !== false) {
      onClick?.(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        aria-label="Correct"
        className={cn(
          "rounded-full p-1.5 transition-colors",
          value === true && !wrongActive
            ? "bg-green-100 text-green-600 hover:opacity-80 dark:bg-green-900/30 dark:text-green-400"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
        onClick={handleCheckClick}
        onPointerDown={dropdownTrigger ? (e) => e.stopPropagation() : undefined}
        type="button"
      >
        <CheckIcon className={iconSize} />
      </button>
      <button
        aria-label="Wrong"
        className={cn(
          "rounded-full p-1.5 transition-colors",
          value === false || wrongActive
            ? "bg-red-100 text-red-600 hover:opacity-80 dark:bg-red-900/30 dark:text-red-400"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
        onClick={handleXClick}
        type="button"
      >
        <XIcon className={iconSize} />
      </button>
    </div>
  );
}
