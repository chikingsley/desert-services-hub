// Types for Site-Specific Safety Plan (SSSP) PDF generation.
// Keep this JSON-serializable so an agent can fill it out from a template file.

export interface SsspContact {
  email?: string;
  name?: string;
  notes?: string;
  phone?: string;
  role: string;
}

export interface SsspHazardControl {
  controls: string[];
  hazard: string;
}

export interface SsspScopeItem {
  details: string[];
  title: string;
}

export type SsspSection =
  | "water-truck"
  | "street-sweeping"
  | "portable-sanitation";

export interface SsspDocument {
  // Emergency
  addressFor911?: string;
  approvedBy?: string;

  // PPE
  baselinePpe?: string[];

  // Contacts + sign-off
  contacts?: SsspContact[];
  crewSize?: string;
  dailyJhaRequired?: "yes" | "no" | "unknown";
  date?: string; // ISO or human-readable
  duration?: string;
  equipment?: string[];
  gateEscortRules?: string;
  gcName?: string;

  // Hazards / controls
  hazardsAndControls?: SsspHazardControl[];
  hospitalDirections?: string;
  incidentReportingChain?: string;
  /** @deprecated Prefer `sections` for explicit section selection. */
  includePortableSanitationSection?: boolean | "auto";
  /** @deprecated Prefer `sections` for explicit section selection. */
  includeStreetSweepingSection?: boolean | "auto";
  /** @deprecated Prefer `sections` for explicit section selection. */
  includeWaterTruckSection?: boolean | "auto";
  jhaSubmission?: string;
  jobNumber?: string;
  musterPoint?: string;
  nearestHospital?: string;
  ownerName?: string;
  parkingDeliveryRules?: string;
  preparedBy?: string;
  projectAddress: string;
  /** Cover-page identifier line, e.g. "PHX07-GCON-LEWIS" */
  projectCode?: string;

  // Project
  projectName: string;
  projectSpecificPpe?: string[];
  reportingRequirements?: string;

  // Permits / plans
  requiredPermits?: string[];
  requiredPlansOrPrograms?: string[];
  respiratoryDetails?: string;
  respiratoryRequired?: "yes" | "no" | "unknown";
  restrictedAreas?: string;
  revision?: string;
  /** Optional structured scope bullets (preferred over scopeOfWork free-text). */
  scopeItems?: SsspScopeItem[];

  // Scope / execution
  scopeOfWork?: string;
  /**
   * Explicit optional service sections to include in the output document.
   * If omitted, section visibility falls back to legacy fields and heuristics.
   */
  sections?: SsspSection[];
  signatures?: Array<{ label: string; who?: string }>;

  // Site rules / access
  siteAccessProcess?: string;
  startDate?: string;
  subcontractors?: string[];
  // Document control
  title?: string; // default: "Site-Specific Safety Plan (SSSP)"
  toolboxTalkFrequency?: string;

  // Training / communication
  trainingRequirements?: string[];
  workHours?: string;
}
