// Automation request status (what's the automation doing?)
export type RequestStatus =
  | "pending"
  | "running"
  | "needs_map"
  | "complete"
  | "failed";

// Actual permit status (what's the permit's state?)
// Note: Database stores Title Case
export type PermitStatus =
  | "Draft"
  | "Submitted"
  | "Pending Payment"
  | "Active"
  | "Superseded"
  | "Closed"
  | "Rejected";

// How was this version created?
export type VersionType = "new" | "renewal" | "revision";

// A single permit application (one version of a permit)
export interface PermitApplication {
  id: string;
  applicationNumber: string; // D0XXXXXX (e.g., D0062940)
  permitNumber?: string; // Assigned when active, shared across versions
  version: number; // 1, 2, 3...
  versionType: VersionType;
  projectName: string;
  company: string;
  address?: string; // Project address + city
  requestStatus: RequestStatus;
  permitStatus: PermitStatus;
  submittedAt?: string; // When application was submitted
  effectiveAt?: string; // When permit became active/effective
  expiresAt?: string; // When permit expires
  createdAt: string;
  updatedAt: string;
  error?: string;
  // Billing fields
  cost?: number; // Permit application cost in dollars
  invoiceNumber?: string; // Invoice reference number
}

// A permit with all its versions (for hierarchical display)
export interface Permit {
  permitNumber: string;
  company: string;
  projectName: string;
  address?: string; // Project address for display
  // The active/current version
  current: PermitApplication;
  // Previous versions (superseded)
  history: PermitApplication[];
}

export type DisplayStatusVariant =
  | "pending"
  | "running"
  | "attention"
  | "success"
  | "error"
  | "muted";

export interface DisplayStatus {
  label: string;
  variant: DisplayStatusVariant;
}

/**
 * Get display status for a permit application.
 * Automation states (requestStatus) take priority over permit status.
 */
export function getDisplayStatus(app: PermitApplication): DisplayStatus {
  // Automation states take priority
  if (app.requestStatus !== "complete") {
    switch (app.requestStatus) {
      case "running": {
        return { label: "Running", variant: "running" };
      }
      case "needs_map": {
        return { label: "Needs Map", variant: "attention" };
      }
      case "failed": {
        return { label: "Failed", variant: "error" };
      }
      case "pending": {
        return { label: "Pending", variant: "pending" };
      }
      default: {
        return { label: "Unknown", variant: "muted" };
      }
    }
  }

  // Show permit status when automation is complete
  switch (app.permitStatus) {
    case "Draft": {
      return { label: "Draft", variant: "pending" };
    }
    case "Submitted": {
      return { label: "Submitted", variant: "running" };
    }
    case "Pending Payment": {
      return { label: "Pending Payment", variant: "attention" };
    }
    case "Active": {
      return { label: "Active", variant: "success" };
    }
    case "Superseded": {
      return { label: "Superseded", variant: "muted" };
    }
    case "Closed": {
      return { label: "Closed", variant: "muted" };
    }
    case "Rejected": {
      return { label: "Rejected", variant: "error" };
    }
    default: {
      return { label: "Unknown", variant: "muted" };
    }
  }
}

export type PermitAction =
  | "view_vnc"
  | "open_vnc"
  | "start"
  | "cancel"
  | "retry"
  | "view_logs"
  | "revise"
  | "renew"
  | "close";

/**
 * Get available actions based on current state.
 * Automation state determines available actions first.
 */
export function getAvailableActions(app: PermitApplication): PermitAction[] {
  // Actions based on automation state (non-complete states)
  if (app.requestStatus !== "complete") {
    switch (app.requestStatus) {
      case "running": {
        return ["view_vnc", "cancel"];
      }
      case "needs_map": {
        return ["open_vnc", "cancel"];
      }
      case "pending": {
        return ["start"];
      }
      case "failed": {
        return ["retry", "view_logs"];
      }
      default: {
        return [];
      }
    }
  }

  // Actions based on permit status (when automation is complete)
  switch (app.permitStatus) {
    case "Active": {
      return ["revise", "renew", "close"];
    }
    case "Draft": {
      return ["start"];
    }
    default: {
      // Submitted, Superseded, Closed - no actions available
      return [];
    }
  }
}

// Version type display - for billing to identify permit type
export const versionTypeConfig: Record<
  VersionType,
  { label: string; color: string }
> = {
  new: { color: "text-blue-400", label: "New Permit" },
  renewal: { color: "text-green-400", label: "Renewal" },
  revision: { color: "text-orange-400", label: "Revision" },
};

// Legacy compatibility (remove later)
export type PermitRequest = PermitApplication;
export const statusConfig = {
  complete: { label: "Complete", variant: "success" as const },
  failed: { label: "Failed", variant: "error" as const },
  needs_map: { label: "Needs Map", variant: "attention" as const },
  pending: { label: "Pending", variant: "pending" as const },
  running: { label: "Running", variant: "running" as const },
};
