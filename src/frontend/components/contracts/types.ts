/**
 * Contract pipeline types for the reconciliation dashboard.
 */

export const PIPELINE_STAGES = [
  "queue",
  "collected",
  "extracted",
  "validated",
  "reconciled",
  "done",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type ValidationSeverity = "error" | "warning" | "info";

export type ReconciliationOutcome =
  | "RECONCILED"
  | "MISMATCH"
  | "NEEDS_CLARIFICATION";

export interface ContractFlag {
  type: string;
  description: string;
  severity: ValidationSeverity;
}

export interface ContractMathCheck {
  estimateTotal: number;
  contractTotal: number;
  removedTotal: number;
  addedTotal: number;
  calculated: number;
  variance: number;
  matches: boolean;
}

export interface PipelineContract {
  id: string;
  subject: string;
  contractor: string;
  receivedDate: string;
  attachmentCount: number;
  stage: PipelineStage;
  estimateTotal: number | null;
  contractTotal: number | null;
  mathCheck: ContractMathCheck | null;
  outcome: ReconciliationOutcome | null;
  flags: ContractFlag[];
  notionUrl: string | null;
  mondayUrl: string | null;
}

export const STAGE_CONFIG: Record<
  PipelineStage,
  {
    label: string;
    shortLabel: string;
    verb: string;
    color: string;
    bgColor: string;
    borderColor: string;
    glowColor: string;
  }
> = {
  queue: {
    label: "In Queue",
    shortLabel: "Queue",
    verb: "Collect",
    color: "text-amber-600",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    glowColor: "shadow-amber-500/20",
  },
  collected: {
    label: "Collected",
    shortLabel: "Collected",
    verb: "Extract",
    color: "text-sky-600",
    bgColor: "bg-sky-500/10",
    borderColor: "border-sky-500/20",
    glowColor: "shadow-sky-500/20",
  },
  extracted: {
    label: "Extracted",
    shortLabel: "Extracted",
    verb: "Validate",
    color: "text-violet-600",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/20",
    glowColor: "shadow-violet-500/20",
  },
  validated: {
    label: "Validated",
    shortLabel: "Validated",
    verb: "Reconcile",
    color: "text-orange-600",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/20",
    glowColor: "shadow-orange-500/20",
  },
  reconciled: {
    label: "Reconciled",
    shortLabel: "Reconciled",
    verb: "Send Email",
    color: "text-emerald-600",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    glowColor: "shadow-emerald-500/20",
  },
  done: {
    label: "Done",
    shortLabel: "Done",
    verb: "Complete",
    color: "text-green-600",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
    glowColor: "shadow-green-500/20",
  },
};
