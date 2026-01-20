// Core types for quoting service

export type LineItem = {
  id: string;
  item: string; // catalog code e.g. "SWPPP-001"
  description: string;
  qty: number;
  uom: string;
  cost: number;
  total: number;
  sectionId?: string;
};

export type QuoteSection = {
  id: string;
  name: string;
  showSubtotal?: boolean;
};

export type Quote = {
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
};

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined";

// Database row type
export type QuoteRow = {
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
};

// Catalog types
export type CatalogItem = {
  code: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  notes?: string;
  defaultQty?: number;
};

export type CatalogSubcategory = {
  id: string;
  name: string;
  items: CatalogItem[];
};

export type CatalogCategory = {
  id: string;
  name: string;
  items?: CatalogItem[];
  subcategories?: CatalogSubcategory[];
};

export type Catalog = {
  categories: CatalogCategory[];
};

