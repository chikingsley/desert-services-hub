export interface ContractWonBridgeResult {
  contractDocExtractsEnqueued: number;
  contractsClassified: number;
  contractsLinked: number;
  documentsBackfilled: number;
  errors: string[];
  estimatesMarkedLost: number;
  estimatesMarkedWon: number;
  mondayUpdates: number;
}

export interface WonCandidate {
  account_name: string | null;
  awarded_value: number | null;
  bid_value: number | null;
  email_id: number;
  email_received_at: string;
  estimate_id: number;
  estimate_name: string;
  match_type: "single_estimate" | "account_match";
  monday_item_id: string | null;
  project_id: number;
  project_name: string;
}

export interface LoserCandidate {
  account_name: string | null;
  estimate_id: number;
  estimate_name: string;
  monday_item_id: string | null;
}

export interface WonPhaseResult {
  errors: string[];
  estimatesMarkedWon: number;
  mondayUpdates: number;
  wonByProject: Map<number, number[]>;
}

export interface LoserPhaseResult {
  errors: string[];
  estimatesMarkedLost: number;
  mondayUpdates: number;
}

export interface DocToEnqueue {
  doc_id: number;
  email_id: number;
}

export interface ContractFields {
  contractor_name: string | null;
  document_type: string | null;
  po_number: string | null;
  project_address: string | null;
  project_name: string | null;
}

export interface ProjectMatch {
  project_id: number;
  project_name: string;
}

export interface ContractDocExtractPayload {
  doc_id: number;
  email_id: number;
}

export type ContractDocExtractEnqueueJob = (
  payload: ContractDocExtractPayload
) => Promise<void>;

export interface ContractAttachmentRow {
  attachment_id: string;
  content_type: string | null;
  id: number;
  name: string;
  size: number | null;
  storage_path: string | null;
}

export interface ContractAttachmentContext {
  emailId: number;
  fromEmail: string;
  mailboxEmail: string;
  messageId: string;
  subject: string;
}

// ── Job Payload Schemas ─────────────────────────────────────

import { z } from "zod";

const NON_EMPTY_STRING = z.string().trim().min(1);

export const CONTRACT_EMAIL_PAYLOAD_SCHEMA = z.object({
  emailId: z.number().int().positive(),
  messageId: NON_EMPTY_STRING,
  mailboxEmail: NON_EMPTY_STRING,
  subject: z.string(),
  fromEmail: z.string(),
  bodyText: z.string(),
  hasAttachments: z.boolean(),
});
export type ContractEmailJobPayload = z.infer<
  typeof CONTRACT_EMAIL_PAYLOAD_SCHEMA
>;
