// Store for passing takeoff data to quote creation
// Uses sessionStorage to persist across page navigation

import type { TakeoffSummaryItem } from "@/lib/takeoff-to-quote";

export interface TakeoffQuoteData {
  takeoffId: string;
  takeoffName: string;
  summaryItems: TakeoffSummaryItem[];
}

const STORAGE_KEY = "takeoff-quote-data";

export function setTakeoffQuoteData(data: TakeoffQuoteData): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getTakeoffQuoteData(): TakeoffQuoteData | null {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as TakeoffQuoteData;
  } catch {
    return null;
  }
}

export function clearTakeoffQuoteData(): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.removeItem(STORAGE_KEY);
}
