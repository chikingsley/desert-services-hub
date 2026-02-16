export type PermitIntent =
  | "request_document_copy"
  | "request_status_update"
  | "action_request_start_or_file"
  | "missing_info_or_correction"
  | "other_permit_related"
  | "not_related";

export interface PermitIntentRow {
  id: number;
  received_at: string;
  from_email: string;
  from_domain: string;
  subject: string;
  body_preview: string;
  attachment_names: string | null;
  classification: string | null;
  conversation_id: string | null;
  project_id: number | null;
}

export interface PermitIntentHeuristic {
  intent: PermitIntent;
  reason: string;
  hasPermitSignal: boolean;
}

export interface PermitIntentModelResult {
  intent: PermitIntent;
  confidence: number;
  reason: string;
  needsHumanReview: boolean;
}

export const SIGNAL_WEBSEARCH_QUERY =
  '"dust permit" OR "dust control permit" OR noi OR "notice of intent" OR "adeq permit"';
