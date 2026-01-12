// Core types for Desert Services Hub

// ============================================
// SQLite Database Row Types
// These match the exact schema in lib/db/index.ts
// ============================================

/** Quote row from SQLite - is_locked is 0|1 in DB */
export interface QuoteRow {
  id: string;
  base_number: string;
  takeoff_id: string | null;
  job_name: string;
  job_address: string | null;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  notes: string | null;
  status: string;
  is_locked: number; // SQLite stores as 0 or 1
  created_at: string;
  updated_at: string;
}

/** Quote version row from SQLite */
export interface QuoteVersionRow {
  id: string;
  quote_id: string;
  version_number: number;
  total: number;
  is_current: number; // SQLite stores as 0 or 1
  created_at: string;
}

/** Quote section row from SQLite */
export interface QuoteSectionRow {
  id: string;
  version_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

/** Quote line item row from SQLite */
export interface QuoteLineItemRow {
  id: string;
  version_id: string;
  section_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  unit_price: number;
  is_excluded: number; // SQLite stores as 0 or 1
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Catalog category row from SQLite */
export interface CatalogCategoryRow {
  id: string;
  name: string;
  sort_order: number;
  selection_mode: string;
  created_at: string;
  updated_at: string;
}

/** Catalog subcategory row from SQLite */
export interface CatalogSubcategoryRow {
  id: string;
  category_id: string;
  name: string;
  sort_order: number;
  selection_mode: string;
  hidden: number; // SQLite stores as 0 or 1
  created_at: string;
  updated_at: string;
}

/** Catalog item row from SQLite */
export interface CatalogItemRow {
  id: string;
  category_id: string;
  subcategory_id: string | null;
  code: string;
  name: string;
  description: string | null;
  price: number;
  unit: string;
  notes: string | null;
  default_qty: number;
  is_active: number; // SQLite stores as 0 or 1
  is_takeoff_item: number; // SQLite stores as 0 or 1
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Takeoff row from SQLite */
export interface TakeoffRow {
  id: string;
  name: string;
  pdf_url: string | null;
  annotations: string; // JSON string
  page_scales: string; // JSON string
  status: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// Application Types (transformed from DB rows)
// ============================================

export interface Quote {
  id: string;
  base_number: string;
  takeoff_id: string | null;
  quote_date: string;
  estimator_name: string | null;
  estimator_email: string | null;
  job_name: string;
  job_address: string | null;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_address: string | null;
  notes: string | null;
  status: "draft" | "sent" | "accepted" | "declined";
  is_locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuoteVersion {
  id: string;
  quote_id: string;
  version_number: number;
  change_summary: string | null;
  total: number;
  is_current: boolean;
  created_at: string;
}

export interface QuoteSection {
  id: string;
  version_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface QuoteLineItem {
  id: string;
  version_id: string;
  section_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  unit_price: number;
  is_excluded: boolean;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface QuoteSend {
  id: string;
  version_id: string;
  estimate_number: string;
  recipient_company: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  sent_at: string | null;
  status: "draft" | "sent" | "viewed" | "accepted" | "declined" | "superseded";
  created_at: string;
}

export interface CatalogItem {
  id: string;
  item_type: string;
  description: string;
  default_unit: string;
  default_unit_cost: number;
  default_unit_price: number;
  category: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Extended types with relations
export interface QuoteWithVersion extends Quote {
  current_version?: QuoteVersion & {
    sections: QuoteSection[];
    line_items: QuoteLineItem[];
  };
}

// Utility type for creating new quotes
export interface NewQuote {
  job_name: string;
  job_address?: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  notes?: string;
  takeoff_id?: string;
}

// Utility type for line item with calculated total
export interface LineItemWithTotal extends QuoteLineItem {
  total: number;
  margin: number;
  margin_percent: number;
}

// ============================================
// Catalog Types (from quoting-example)
// ============================================

export type SelectionMode = "pick-one" | "pick-many";

export interface CatalogServiceItem {
  code: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  notes?: string;
  defaultQty?: number;
}

export interface CatalogSubcategory {
  id: string;
  name: string;
  selectionMode?: SelectionMode;
  hidden?: boolean;
  items: CatalogServiceItem[];
}

export interface CatalogCategory {
  id: string;
  name: string;
  selectionMode?: SelectionMode;
  items?: CatalogServiceItem[];
  subcategories?: CatalogSubcategory[];
}

export interface Catalog {
  categories: CatalogCategory[];
}

// Helper to find an item by code in a category
export function findItemInCategory(
  category: CatalogCategory,
  code: string
): { item: CatalogServiceItem; subcategory?: CatalogSubcategory } | null {
  if (category.items) {
    const item = category.items.find((i) => i.code === code);
    if (item) {
      return { item };
    }
  }
  if (category.subcategories) {
    for (const sub of category.subcategories) {
      const item = sub.items.find((i) => i.code === code);
      if (item) {
        return { item, subcategory: sub };
      }
    }
  }
  return null;
}

// ============================================
// Quote Editor Types (inline editing)
// ============================================

export interface EditorLineItem {
  id: string;
  item: string;
  description: string;
  qty: number;
  uom: string;
  cost: number;
  total: number;
  sectionId?: string;
  subcategoryId?: string;
  isStruck?: boolean;
}

export interface EditorSection {
  id: string;
  name: string; // Original catalog category name
  title?: string; // Editable display title (defaults to name)
  catalogCategoryId?: string; // Links to catalog category for filtering
}

export interface EditorQuote {
  estimateNumber: string;
  date: string;
  estimator: string;
  estimatorEmail: string;
  billTo: {
    companyName: string;
    address: string;
    email: string;
    phone: string;
  };
  jobInfo: {
    siteName: string;
    address: string;
  };
  sections: EditorSection[];
  lineItems: EditorLineItem[];
  total: number;
}
