export interface ContractWonBridgeResult {
  contractsClassified: number;
  contractsLinked: number;
  contractDocExtractsEnqueued: number;
  documentsBackfilled: number;
  estimatesMarkedWon: number;
  estimatesMarkedLost: number;
  mondayUpdates: number;
  errors: string[];
}

export interface WonCandidate {
  email_id: number;
  project_id: number;
  project_name: string;
  estimate_id: number;
  estimate_name: string;
  account_name: string | null;
  monday_item_id: string | null;
  match_type: "single_estimate" | "account_match";
}

export interface LoserCandidate {
  estimate_id: number;
  estimate_name: string;
  account_name: string | null;
  monday_item_id: string | null;
}

export interface WonPhaseResult {
  estimatesMarkedWon: number;
  mondayUpdates: number;
  errors: string[];
  wonByProject: Map<number, number[]>;
}

export interface LoserPhaseResult {
  estimatesMarkedLost: number;
  mondayUpdates: number;
  errors: string[];
}

export interface DocToEnqueue {
  email_id: number;
  doc_id: number;
}

export interface ContractFields {
  project_name: string | null;
  contractor_name: string | null;
  project_address: string | null;
  po_number: string | null;
  document_type: string | null;
}

export interface ProjectMatch {
  project_id: number;
  project_name: string;
}

export interface ContractDocExtractPayload {
  email_id: number;
  doc_id: number;
}

export type ContractDocExtractEnqueueJob = (
  payload: ContractDocExtractPayload
) => Promise<void>;
