import type { TakeoffAnnotation } from "@/lib/pdf-takeoff";

export interface Takeoff {
  id: string;
  name: string;
  pdf_url: string | null;
  annotations: TakeoffAnnotation[];
  page_scales: Record<number, string>;
  status: "draft" | "in_progress" | "complete";
  created_at: string;
  updated_at: string;
}

export interface TakeoffInsert {
  name: string;
  pdf_url?: string | null;
  annotations?: TakeoffAnnotation[];
  page_scales?: Record<number, string>;
  status?: "draft" | "in_progress" | "complete";
}

/**
 * Get a takeoff by ID
 */
export async function getTakeoff(id: string): Promise<Takeoff | null> {
  const res = await fetch(`/api/takeoffs/${id}`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error("Failed to fetch takeoff");
  }
  return res.json();
}

/**
 * List all takeoffs
 */
export async function listTakeoffs(): Promise<Takeoff[]> {
  const res = await fetch("/api/takeoffs");
  if (!res.ok) {
    throw new Error("Failed to list takeoffs");
  }
  return res.json();
}

/**
 * Create a new takeoff
 */
export async function createTakeoff(takeoff: TakeoffInsert): Promise<Takeoff> {
  const res = await fetch("/api/takeoffs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(takeoff),
  });
  if (!res.ok) {
    throw new Error("Failed to create takeoff");
  }
  return res.json();
}

/**
 * Update an existing takeoff
 */
export async function updateTakeoff(
  id: string,
  updates: Partial<TakeoffInsert>
): Promise<Takeoff> {
  const res = await fetch(`/api/takeoffs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    throw new Error("Failed to update takeoff");
  }
  return res.json();
}

/**
 * Delete a takeoff
 */
export async function deleteTakeoff(id: string): Promise<void> {
  const res = await fetch(`/api/takeoffs/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error("Failed to delete takeoff");
  }
}

/**
 * Save takeoff annotations (convenience method for quick saves)
 */
export async function saveTakeoffAnnotations(
  id: string,
  annotations: TakeoffAnnotation[],
  pageScales: Record<number, string>
): Promise<Takeoff> {
  return updateTakeoff(id, {
    annotations,
    page_scales: pageScales,
    status: annotations.length > 0 ? "in_progress" : "draft",
  });
}
