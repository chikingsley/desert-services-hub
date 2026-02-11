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
