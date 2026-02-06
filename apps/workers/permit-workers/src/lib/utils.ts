import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a date string for compact display (MM/DD/YY)
 */
export function formatDate(dateStr?: string): string {
  if (!dateStr) {
    return "—";
  }
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });
}

/**
 * Format currency for display
 */
export function formatCurrency(amount?: number | null): string {
  if (amount === undefined || amount === null) {
    return "—";
  }
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}
