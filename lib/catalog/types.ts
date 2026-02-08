// Catalog types for Desert Services estimates
// 2026 Pricing - Effective January 1st, 2026

// Line item for estimates (used by catalog functions)
export interface LineItem {
  id: string;
  item: string; // catalog code e.g. "SWPPP-001"
  description: string;
  qty: number;
  uom: string;
  cost: number;
  total: number;
  sectionId?: string;
}

export interface CatalogItem {
  code: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  notes?: string;
  defaultQty?: number;
}

export type SelectionMode = "pick-one" | "pick-many";

export interface CatalogSubcategory {
  id: string;
  name: string;
  selectionMode?: SelectionMode;
  hidden?: boolean;
  items: CatalogItem[];
}

export interface CatalogCategory {
  id: string;
  name: string;
  items?: CatalogItem[];
  subcategories?: CatalogSubcategory[];
}

export interface Catalog {
  categories: CatalogCategory[];
}

// Takeoff bundle types
export interface TakeoffBundleItem {
  code: string; // References a CatalogItem code
  isRequired: boolean;
  quantityMultiplier: number;
}

export interface TakeoffBundle {
  id: string;
  name: string;
  description: string;
  unit: "LF" | "SF" | "Each";
  toolType: "count" | "linear" | "area";
  color: string;
  items: TakeoffBundleItem[];
}
