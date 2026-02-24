// Catalog types for Desert Services estimates
// 2026 Pricing - Effective January 1st, 2026

// Line item for estimates (used by catalog functions)
export interface LineItem {
  cost: number;
  description: string;
  id: string;
  item: string; // catalog code e.g. "SWPPP-001"
  qty: number;
  sectionId?: string;
  total: number;
  uom: string;
}

export interface CatalogItem {
  code: string;
  defaultQty?: number;
  description: string;
  name: string;
  notes?: string;
  price: number;
  unit: string;
}

export type SelectionMode = "pick-one" | "pick-many";

export interface CatalogSubcategory {
  hidden?: boolean;
  id: string;
  items: CatalogItem[];
  name: string;
  selectionMode?: SelectionMode;
}

export interface CatalogCategory {
  id: string;
  items?: CatalogItem[];
  name: string;
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
  color: string;
  description: string;
  id: string;
  items: TakeoffBundleItem[];
  name: string;
  toolType: "count" | "linear" | "area";
  unit: "LF" | "SF" | "Each";
}
