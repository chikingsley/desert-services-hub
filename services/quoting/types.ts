// Core types for quoting service

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

export interface QuoteSection {
  id: string;
  name: string;
  showSubtotal?: boolean;
}

export interface Quote {
  id?: string;
  estimateNumber: string;
  date: string;
  estimator: string;
  estimatorEmail: string;
  estimatorPhone?: string;
  billTo: {
    companyName: string;
    address?: string;
    address2?: string;
  };
  attn?: {
    name: string;
    title?: string;
    email?: string;
    phone?: string;
  };
  project: {
    name: string;
    name2?: string; // overflow line
  };
  siteAddress: {
    line1: string;
    line2?: string;
  };
  sections: QuoteSection[];
  lineItems: LineItem[];
  total: number;
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined";

// Database row type
export interface QuoteRow {
  id: string;
  estimate_number: string;
  revision_number: number;
  date: string;
  status: QuoteStatus;
  estimator_name: string | null;
  estimator_email: string | null;
  company_name: string | null;
  company_address: string | null;
  job_name: string | null;
  job_address: string | null;
  total: number;
  line_items: string | null; // JSON stringified
  sections: string | null; // JSON stringified
  created_at: string;
  updated_at: string;
}

// Catalog types
export interface CatalogItem {
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
