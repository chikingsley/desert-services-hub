// Core types for Desert Services Hub

export interface Quote {
  id: string;
  base_number: string;
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
}

// Utility type for line item with calculated total
export interface LineItemWithTotal extends QuoteLineItem {
  total: number;
  margin: number;
  margin_percent: number;
}
