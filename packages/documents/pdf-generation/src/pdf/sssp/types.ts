// Types for Site-Specific Safety Plan (SSSP) PDF generation.
// Keep this JSON-serializable so an agent can fill it out from a template file.

export interface SsspContact {
  role: string;
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export interface SsspHazardControl {
  hazard: string;
  controls: string[];
}

export interface SsspScopeItem {
  title: string;
  details: string[];
}

export type SsspSection =
  | "water-truck"
  | "street-sweeping"
  | "portable-sanitation";

export interface SsspDocument {
  // Document control
  title?: string; // default: "Site-Specific Safety Plan (SSSP)"
  revision?: string;
  date?: string; // ISO or human-readable
  preparedBy?: string;
  approvedBy?: string;

  // Project
  projectName: string;
  projectAddress: string;
  /** Cover-page identifier line, e.g. "PHX07-GCON-LEWIS" */
  projectCode?: string;
  jobNumber?: string;
  gcName?: string;
  ownerName?: string;
  startDate?: string;
  duration?: string;
  workHours?: string;

  // Scope / execution
  scopeOfWork?: string;
  /** Optional structured scope bullets (preferred over scopeOfWork free-text). */
  scopeItems?: SsspScopeItem[];
  /**
   * Explicit optional service sections to include in the output document.
   * If omitted, section visibility falls back to legacy fields and heuristics.
   */
  sections?: SsspSection[];
  /** @deprecated Prefer `sections` for explicit section selection. */
  includeWaterTruckSection?: boolean | "auto";
  /** @deprecated Prefer `sections` for explicit section selection. */
  includeStreetSweepingSection?: boolean | "auto";
  /** @deprecated Prefer `sections` for explicit section selection. */
  includePortableSanitationSection?: boolean | "auto";
  crewSize?: string;
  equipment?: string[];
  subcontractors?: string[];

  // Site rules / access
  siteAccessProcess?: string;
  gateEscortRules?: string;
  parkingDeliveryRules?: string;
  restrictedAreas?: string;
  reportingRequirements?: string;

  // PPE
  baselinePpe?: string[];
  projectSpecificPpe?: string[];
  respiratoryRequired?: "yes" | "no" | "unknown";
  respiratoryDetails?: string;

  // Hazards / controls
  hazardsAndControls?: SsspHazardControl[];

  // Permits / plans
  requiredPermits?: string[];
  requiredPlansOrPrograms?: string[];

  // Training / communication
  trainingRequirements?: string[];
  toolboxTalkFrequency?: string;
  dailyJhaRequired?: "yes" | "no" | "unknown";
  jhaSubmission?: string;

  // Emergency
  addressFor911?: string;
  musterPoint?: string;
  nearestHospital?: string;
  hospitalDirections?: string;
  incidentReportingChain?: string;

  // Contacts + sign-off
  contacts?: SsspContact[];
  signatures?: Array<{ label: string; who?: string }>;
}
