// Types for the quoting module
// Shared between CLI and web app

// Core estimate types (replaces Quote types)
export interface EstimateLineItem {
  description: string;
  id: string;
  item_name?: string | null;
  notes?: string | null;
  quantity: number;
  section_id?: string | null;
  sort_order: number;
  unit: string;
  unit_price: number;
}

export interface EstimateSection {
  id: string;
  name: string;
  show_subtotal: boolean;
  sort_order: number;
  title?: string | null;
}

export interface EstimateVersion {
  created_at: string;
  id: string;
  is_current: boolean;
  line_items: EstimateLineItem[];
  sections: EstimateSection[];
  total: number;
  version_number: number;
}

export interface Estimate {
  base_number: string;
  client_address?: string | null;
  client_email?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  created_at: string;
  estimator?: string | null;
  estimator_email?: string | null;
  id: string;
  is_locked: boolean;
  job_address?: string | null;
  job_name: string;
  notes?: string | null;
  status: "draft" | "sent" | "accepted" | "declined";
  takeoff_id?: string | null;
  updated_at: string;
  versions: EstimateVersion[];
}

// Input types for creating/updating estimates
export interface CreateEstimateInput {
  base_number?: string; // Auto-generated if not provided
  client_address?: string;
  client_email?: string;
  client_name?: string;
  client_phone?: string;
  estimator?: string;
  estimator_email?: string;
  is_locked?: boolean;
  job_address?: string;
  job_name: string;
  line_items?: Array<{
    section_id?: string;
    item_name?: string;
    description: string;
    quantity?: number;
    unit?: string;
    unit_price?: number;
    notes?: string;
  }>;
  notes?: string;
  sections?: Array<{
    id?: string;
    name: string;
    title?: string;
    show_subtotal?: boolean;
  }>;
  status?: "draft" | "sent" | "accepted" | "declined";
  takeoff_id?: string;
  total?: number;
}

export interface UpdateEstimateInput {
  client_email?: string;
  client_name?: string;
  client_phone?: string;
  is_locked?: boolean;
  job_address?: string;
  job_name?: string;
  notes?: string;
  status?: "draft" | "sent" | "accepted" | "declined";
}

// Line item modification for updates
export interface LineItemChange {
  action: "add" | "remove" | "update";
  description?: string;
  id?: string; // For update/remove
  item_name?: string;
  notes?: string;
  quantity?: number;
  section_id?: string;
  unit?: string;
  unit_price?: number;
}

// Estimate number format: YYMMDD##R#
// Example: 25122301R0 = Dec 23, 2025, estimate #1, original
export interface EstimateNumber {
  base: string; // YYMMDD##
  full: string; // YYMMDD##R#
  revision: number; // 0 = R0, 1 = R1, etc.
}
