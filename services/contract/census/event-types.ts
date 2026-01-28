/**
 * Event System Types
 *
 * Type definitions for the event-driven orchestration layer.
 * See EVENT_SYSTEM.md for full documentation.
 */

// =============================================================================
// STAKEHOLDER TYPES
// =============================================================================

/**
 * Role types for stakeholders
 * External roles are contacts at the GC/customer
 * Internal roles are Desert Services employees
 */
export type StakeholderRole =
  // External roles
  | "pm" // Project Manager
  | "super" // Superintendent
  | "billing_external" // Billing contact at GC
  | "owner_rep" // Owner's representative
  | "contact" // General contact
  // Internal roles
  | "internal_billing" // Desert Services billing team
  | "internal_ops" // Desert Services operations
  | "internal_permits"; // Desert Services permits team

export type StakeholderSource = "email" | "contract" | "manual" | "monday";

export interface Stakeholder {
  id: number;
  project_id: number | null;
  account_id: number | null;
  name: string;
  email: string;
  phone: string | null;
  role: StakeholderRole | null;
  is_primary: boolean;
  is_internal: boolean;
  notify_on: string[]; // Event types they receive
  source: StakeholderSource | null;
  source_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type StakeholderInsert = Omit<
  Stakeholder,
  "id" | "created_at" | "updated_at"
> & {
  notify_on?: string[]; // Will be JSON stringified
};

// =============================================================================
// PERMIT TYPES
// =============================================================================

export type PermitType = "dust" | "noi";

export type PermitStatus =
  | "draft" // Being prepared, not submitted
  | "submitted" // Submitted to county
  | "pending_payment" // Submitted but payment not processed
  | "processing" // Paid, county is processing
  | "active" // Issued and active
  | "expired" // Past expiration date
  | "closed" // Closed out
  | "superseded"; // Replaced by revision/renewal

export interface Permit {
  id: number;
  application_number: string | null; // D number
  permit_number: string | null; // F number
  project_id: number | null;
  account_id: number | null;
  permit_type: PermitType;
  status: PermitStatus | null;
  project_name: string | null;
  company_name: string | null;
  acreage: number | null;
  fee: number | null;
  site_address: string | null;
  parcel_number: string | null;
  submitted_at: string | null;
  paid_at: string | null;
  issued_at: string | null;
  expires_at: string | null;
  closed_at: string | null;
  customer_notified_at: string | null;
  internal_notified_at: string | null;
  auto_permit_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PermitInsert = Omit<Permit, "id" | "created_at" | "updated_at">;

// =============================================================================
// EVENT TYPES
// =============================================================================

/**
 * All possible event types
 */
export type EventType =
  // Permit events
  | "permit_submitted"
  | "permit_paid"
  | "permit_issued"
  | "permit_revised"
  | "permit_renewed"
  | "permit_closed"
  | "permit_expired"
  // Contract events
  | "contract_received"
  | "contract_extracted"
  | "contract_reconciled"
  | "contract_issues_sent"
  | "contract_approved"
  | "contract_signed"
  | "contract_rejected"
  // Plan events
  | "plan_ordered"
  | "plan_received"
  | "plan_delivered"
  // General events
  | "stakeholder_added"
  | "stakeholder_updated"
  | "project_created"
  | "project_status_changed";

export type EventSource = "auto-permit" | "email" | "manual" | "api" | "system";

export interface Event {
  id: number;
  project_id: number | null;
  permit_id: number | null;
  event_type: EventType;
  event_data: Record<string, unknown> | null; // JSON parsed
  source: EventSource | null;
  source_id: string | null;
  actor: string | null;
  created_at: string;
}

export type EventInsert = Omit<Event, "id" | "created_at"> & {
  event_data?: Record<string, unknown>; // Will be JSON stringified
};

// =============================================================================
// ACTION TYPES
// =============================================================================

/**
 * All possible action types
 */
export type ActionType =
  // Email actions
  | "send_customer_email"
  | "send_internal_billing"
  | "send_internal_ops"
  | "send_internal_permits"
  // System actions
  | "update_monday"
  | "create_notion_task"
  | "update_notion_page"
  | "sync_to_sharepoint";

export type ActionStatus =
  | "pending" // Waiting to execute
  | "running" // Currently executing
  | "complete" // Successfully completed
  | "failed" // Failed (can retry)
  | "skipped"; // Manually skipped

export interface ActionConfig {
  template?: string;
  recipients?: string[];
  subject?: string;
  [key: string]: unknown;
}

export interface Action {
  id: number;
  event_id: number | null;
  project_id: number | null;
  permit_id: number | null;
  action_type: ActionType;
  action_config: ActionConfig | null;
  status: ActionStatus;
  priority: number;
  attempt_count: number;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
}

export type ActionInsert = Omit<Action, "id" | "created_at"> & {
  action_config?: ActionConfig;
  result?: Record<string, unknown>;
};

// =============================================================================
// WORKFLOW TYPES
// =============================================================================

export interface WorkflowConditions {
  permit_type?: PermitType[];
  status?: string[];
  [key: string]: unknown;
}

export interface Workflow {
  id: number;
  name: string | null;
  description: string | null;
  event_type: EventType;
  action_type: ActionType;
  action_config: ActionConfig | null;
  is_active: boolean;
  priority: number;
  conditions: WorkflowConditions | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// HELPER TYPES FOR AGENT INTERACTIONS
// =============================================================================

/**
 * Summary of a project's stakeholders for agent display
 */
export interface StakeholderSummary {
  project_id: number;
  project_name: string;
  stakeholders: Array<{
    name: string;
    email: string;
    role: StakeholderRole | null;
    is_primary: boolean;
  }>;
  missing_roles: StakeholderRole[];
}

/**
 * Pending actions summary for agent display
 */
export interface PendingActionsSummary {
  project_id: number;
  project_name: string;
  actions: Array<{
    id: number;
    action_type: ActionType;
    status: ActionStatus;
    created_at: string;
  }>;
}

/**
 * Result of spawning actions for an event
 */
export interface SpawnActionsResult {
  event_id: number;
  actions_created: number;
  action_ids: number[];
}

/**
 * Result of executing an action
 */
export interface ExecuteActionResult {
  action_id: number;
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

// =============================================================================
// EVENT DATA PAYLOADS
// =============================================================================

/**
 * Event data for permit_submitted
 */
export interface PermitSubmittedData {
  application_number: string;
  project_name: string;
  company_name: string;
  acreage: number;
  fee: number;
  site_address?: string;
  submitted_at: string;
}

/**
 * Event data for permit_issued
 */
export interface PermitIssuedData {
  application_number: string;
  permit_number: string;
  issued_at: string;
  expires_at: string;
}

/**
 * Event data for contract_received
 */
export interface ContractReceivedData {
  contract_type: string;
  project_name: string;
  contractor_name: string;
  source: "email" | "docusign" | "procore" | "manual";
  source_id?: string;
  attachment_path?: string;
}
