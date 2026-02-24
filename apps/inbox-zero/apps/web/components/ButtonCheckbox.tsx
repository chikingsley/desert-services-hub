import { Check, Minus } from "lucide-react";
import { cn } from "@/utils";

export function ButtonCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (shiftKey: boolean) => void;
}) {
  return (
    <button
      aria-checked={indeterminate ? "mixed" : checked}
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all",
        checked || indeterminate
          ? "border-blue-500 bg-blue-500 text-white"
          : "border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500"
      )}
      onClick={(e) => {
        e.stopPropagation();
        onChange(e.shiftKey);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      role="checkbox"
      type="button"
    >
      {checked && <Check className="size-3.5" strokeWidth={3} />}
      {indeterminate && !checked && (
        <Minus className="size-3.5" strokeWidth={3} />
      )}
    </button>
  );
}
