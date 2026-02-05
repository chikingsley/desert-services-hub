// Types for the quoting module
// Shared between CLI and web app

// Core estimate types (replaces Quote types)
export interface EstimateLineItem {
  id: string;
  section_id?: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  unit_price?: number;
  notes?: string | null;
  sort_order: number;
}

export interface EstimateSection {
  id: string;
  name: string;
  title?: string | null;
  show_subtotal: boolean;
  sort_order: number;
}

export interface EstimateVersion {
  id: string;
  version_number: number;
  total: number;
  is_current: boolean;
  created_at: string;
  sections: EstimateSection[];
  line_items: EstimateLineItem[];
}

export interface Estimate {
  id: string;
  base_number: string;
  takeoff_id?: string | null;
  job_name: string;
  job_address?: string | null;
  client_name?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  notes?: string | null;
  status: "draft" | "sent" | "accepted" | "declined";
  is_locked: boolean;
  created_at: string;
  updated_at: string;
  versions: EstimateVersion[];
}

// Input types for creating/updating estimates
export interface CreateEstimateInput {
  base_number?: string; // Auto-generated if not provided
  takeoff_id?: string;
  job_name: string;
  job_address?: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  notes?: string;
  status?: "draft" | "sent" | "accepted" | "declined";
  is_locked?: boolean;
  sections?: Array<{
    id?: string;
    name: string;
    title?: string;
    show_subtotal?: boolean;
  }>;
  line_items?: Array<{
    section_id?: string;
    description: string;
    quantity?: number;
    unit?: string;
    unit_cost?: number;
    notes?: string;
  }>;
  total?: number;
}

export interface UpdateEstimateInput {
  job_name?: string;
  job_address?: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  notes?: string;
  status?: "draft" | "sent" | "accepted" | "declined";
  is_locked?: boolean;
}

// Line item modification for updates
export interface LineItemChange {
  action: "add" | "remove" | "update";
  id?: string; // For update/remove
  section_id?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  unit_cost?: number;
  notes?: string;
}

// Estimate number format: YYMMDD##R#
// Example: 25122301R0 = Dec 23, 2025, estimate #1, original
export interface EstimateNumber {
  base: string; // YYMMDD##
  revision: number; // 0 = R0, 1 = R1, etc.
  full: string; // YYMMDD##R#
}
