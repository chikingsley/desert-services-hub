// ============================================
// Quoting App - SQLite Row Types
// ============================================

export interface EstimateRow {
  id: string;
  name: string;
  job_name?: string | null;
  estimate_number: string | null;
  contractor: string | null;
  location?: string | null;
  base_number: string | null;
  takeoff_id: string | null;
  job_address: string | null;
  client_name: string | null;
  client_address: string | null;
  client_email: string | null;
  client_phone: string | null;
  notes: string | null;
  bid_status: string | null;
  status?: string | null;
  is_locked: number;
  estimator: string | null;
  estimator_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface EstimateVersionRow {
  id: string;
  estimate_id: string;
  version_number: number;
  total: number;
  is_current: number;
  created_at: string;
}

export interface EstimateSectionRow {
  id: string;
  version_id: string;
  name: string;
  title: string | null;
  show_subtotal: number;
  sort_order: number;
  created_at: string;
}

export interface EstimateLineItemRow {
  id: string;
  version_id: string;
  section_id: string | null;
  item_name: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  is_excluded: number;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ============================================
// Quoting App - Application Types
// ============================================

export interface QuotingEstimate {
  id: string;
  base_number: string;
  takeoff_id: string | null;
  estimate_date: string;
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

export interface EstimateVersion {
  id: string;
  estimate_id: string;
  version_number: number;
  change_summary: string | null;
  total: number;
  is_current: boolean;
  created_at: string;
}

export interface EstimateSection {
  id: string;
  version_id: string;
  name: string;
  title: string | null;
  show_subtotal: boolean;
  sort_order: number;
  created_at: string;
}

export interface EstimateLineItem {
  id: string;
  version_id: string;
  section_id: string | null;
  item_name: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  is_excluded: boolean;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ============================================
// Estimate Editor Types
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
  isAlternate?: boolean;
  isStruck?: boolean;
}

export interface EditorSection {
  id: string;
  name: string;
  title?: string;
  showSubtotal?: boolean;
  catalogCategoryId?: string;
}

export interface EditorEstimate {
  estimateNumber: string;
  date: string;
  estimator: string;
  estimatorEmail: string;
  estimatorPhone?: string;
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
