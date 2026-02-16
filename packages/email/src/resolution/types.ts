import type {
  EstimateCandidateResult,
  EstimateMatchCandidate,
  EstimateMatchDecision,
} from "@lib/db/repositories/estimate-email";
import type { ProjectMatchResult } from "@lib/db/repositories/project";

export type ProjectResolutionStatus =
  | "email_not_found"
  | "already_linked"
  | "linked_conversation_anchor"
  | "linked_deterministic"
  | "no_signal"
  | "ambiguous"
  | "subject_guard_rejected";

export interface ProjectResolutionResult {
  status: ProjectResolutionStatus;
  emailId: number;
  projectId: number | null;
  detail: string;
  matchResult?: ProjectMatchResult | null;
}

export type EstimateResolutionStatus =
  | "email_not_found"
  | "already_linked"
  | "linked_project_single"
  | "linked_project_canonical"
  | "linked_deterministic"
  | "no_signal"
  | "ambiguous";

export interface EstimateAmbiguousPayload {
  candidates: EstimateMatchCandidate[];
  decision: EstimateMatchDecision;
  matchResult: EstimateCandidateResult;
}

export interface EstimateResolutionResult {
  status: EstimateResolutionStatus;
  emailId: number;
  estimateId: number | null;
  detail: string;
  ambiguous?: EstimateAmbiguousPayload;
}
