/**
 * Project Tracking Schema
 *
 * Extends the hub.db with project tracking fields.
 * This is the "checklist" layer on top of the raw project/estimate data.
 */
import { db } from "@contract/db/connection";

// ============================================
// Schema: Project Tracking (overlay on estimates)
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS project_tracking (
    id INTEGER PRIMARY KEY,
    estimate_id INTEGER UNIQUE NOT NULL,

    -- Contract Status
    has_contract INTEGER DEFAULT 0,
    contract_signed INTEGER DEFAULT 0,
    contract_file_path TEXT,

    -- Permit Requirements
    needs_dust_permit INTEGER DEFAULT 0,
    dust_permit_filed INTEGER DEFAULT 0,
    dust_permit_number TEXT,
    dust_permit_expiry TEXT,

    -- NOI/NDC
    needs_noi INTEGER DEFAULT 0,
    noi_filed INTEGER DEFAULT 0,
    noi_file_path TEXT,

    -- SWPPP
    needs_swppp INTEGER DEFAULT 0,
    swppp_plan_received INTEGER DEFAULT 0,
    swppp_file_path TEXT,

    -- Grading & Drainage
    needs_grading_drainage INTEGER DEFAULT 0,
    grading_drainage_received INTEGER DEFAULT 0,

    -- Payroll
    certified_payroll_required INTEGER DEFAULT 0,

    -- Insurance
    insurance_verified INTEGER DEFAULT 0,
    insurance_exception TEXT,

    -- Signs
    swppp_sign_ordered INTEGER DEFAULT 0,
    dust_sign_ordered INTEGER DEFAULT 0,

    -- General Status
    status TEXT DEFAULT 'active',
    notes TEXT,

    -- Timestamps
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// ============================================
// Schema: Tasks (per-project action items)
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS project_tasks (
    id INTEGER PRIMARY KEY,
    tracking_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    task_type TEXT,
    status TEXT DEFAULT 'pending',
    due_date TEXT,
    assigned_to TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    FOREIGN KEY (tracking_id) REFERENCES project_tracking(id)
  )
`);

// Indexes
db.run(
  "CREATE INDEX IF NOT EXISTS idx_project_tracking_estimate ON project_tracking(estimate_id)"
);
db.run(
  "CREATE INDEX IF NOT EXISTS idx_project_tracking_status ON project_tracking(status)"
);
db.run(
  "CREATE INDEX IF NOT EXISTS idx_project_tasks_tracking ON project_tasks(tracking_id)"
);
db.run(
  "CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON project_tasks(status)"
);

// Types
export type ProjectTracking = {
  id: number;
  estimate_id: number;
  has_contract: number;
  contract_signed: number;
  contract_file_path: string | null;
  needs_dust_permit: number;
  dust_permit_filed: number;
  dust_permit_number: string | null;
  dust_permit_expiry: string | null;
  needs_noi: number;
  noi_filed: number;
  noi_file_path: string | null;
  needs_swppp: number;
  swppp_plan_received: number;
  swppp_file_path: string | null;
  needs_grading_drainage: number;
  grading_drainage_received: number;
  certified_payroll_required: number;
  insurance_verified: number;
  insurance_exception: string | null;
  swppp_sign_ordered: number;
  dust_sign_ordered: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectTask = {
  id: number;
  tracking_id: number;
  description: string;
  task_type: string | null;
  status: string;
  due_date: string | null;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
};

// Joined view type for the main table
export type ProjectView = {
  // From estimates
  id: number;
  name: string;
  contractor: string | null;
  bid_status: string | null;
  awarded_value: number | null;
  location: string | null;
  monday_url: string | null;

  // From tracking (nullable if no tracking record yet)
  tracking_id: number | null;
  has_contract: number;
  contract_signed: number;
  needs_dust_permit: number;
  dust_permit_filed: number;
  needs_noi: number;
  noi_filed: number;
  needs_swppp: number;
  swppp_plan_received: number;
  certified_payroll_required: number;
  insurance_verified: number;
  status: string;
  notes: string | null;
};
