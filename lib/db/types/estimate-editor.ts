// ============================================
// Quoting App - SQLite Row Types
// ============================================

export interface EstimateRow {
  base_number: string | null;
  bid_status: string | null;
  client_address: string | null;
  client_email: string | null;
  client_name: string | null;
  client_phone: string | null;
  contractor: string | null;
  created_at: string;
  estimate_number: string | null;
  estimator: string | null;
  estimator_email: string | null;
  id: string;
  is_locked: number;
  job_address: string | null;
  job_name?: string | null;
  location?: string | null;
  name: string;
  notes: string | null;
  status?: string | null;
  takeoff_id: string | null;
  updated_at: string;
}

export interface EstimateVersionRow {
  created_at: string;
  estimate_id: string;
  id: string;
  is_current: number;
  total: number;
  version_number: number;
}

export interface EstimateSectionRow {
  created_at: string;
  id: string;
  name: string;
  show_subtotal: number;
  sort_order: number;
  title: string | null;
  version_id: string;
}

export interface EstimateLineItemRow {
  created_at: string;
  description: string;
  id: string;
  is_excluded: number;
  item_name: string | null;
  notes: string | null;
  quantity: number;
  section_id: string | null;
  sort_order: number;
  unit: string;
  unit_price: number;
  updated_at: string;
  version_id: string;
}

// ============================================
// Quoting App - Application Types
// ============================================

export interface QuotingEstimate {
  base_number: string;
  client_address: string | null;
  client_email: string | null;
  client_name: string | null;
  client_phone: string | null;
  created_at: string;
  estimate_date: string;
  estimator_email: string | null;
  estimator_name: string | null;
  id: string;
  is_locked: boolean;
  job_address: string | null;
  job_name: string;
  notes: string | null;
  status: "draft" | "sent" | "accepted" | "declined";
  takeoff_id: string | null;
  updated_at: string;
}

export interface EstimateVersion {
  change_summary: string | null;
  created_at: string;
  estimate_id: string;
  id: string;
  is_current: boolean;
  total: number;
  version_number: number;
}

export interface EstimateSection {
  created_at: string;
  id: string;
  name: string;
  show_subtotal: boolean;
  sort_order: number;
  title: string | null;
  version_id: string;
}

export interface EstimateLineItem {
  created_at: string;
  description: string;
  id: string;
  is_excluded: boolean;
  item_name: string | null;
  notes: string | null;
  quantity: number;
  section_id: string | null;
  sort_order: number;
  unit: string;
  unit_price: number;
  updated_at: string;
  version_id: string;
}

// ============================================
// Estimate Editor Types
// ============================================

export interface EditorLineItem {
  cost: number;
  description: string;
  id: string;
  isAlternate?: boolean;
  isStruck?: boolean;
  item: string;
  qty: number;
  sectionId?: string;
  subcategoryId?: string;
  total: number;
  uom: string;
}

export interface EditorSection {
  catalogCategoryId?: string;
  id: string;
  name: string;
  showSubtotal?: boolean;
  title?: string;
}

export interface EditorEstimate {
  billTo: {
    companyName: string;
    address: string;
    email: string;
    phone: string;
  };
  date: string;
  estimateNumber: string;
  estimator: string;
  estimatorEmail: string;
  estimatorPhone?: string;
  jobInfo: {
    siteName: string;
    address: string;
  };
  lineItems: EditorLineItem[];
  sections: EditorSection[];
  total: number;
}
