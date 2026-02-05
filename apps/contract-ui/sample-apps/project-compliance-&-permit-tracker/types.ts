export enum TaskType {
  BINARY = "BINARY",
  STAGED = "STAGED",
  NARRATIVE = "NARRATIVE",
}

export enum PermitStage {
  NOT_STARTED = 0,
  PREPARED = 1,
  FILED = 2,
  RECEIVED = 3,
  SENT_TO_BILLING = 4,
  COMPLETED = 5,
}

export interface Checkpoint {
  id: string;
  label: string;
  isCompleted: boolean;
}

export type TaskStatus = boolean | PermitStage | string;

export interface ComplianceTask {
  id: string;
  name: string;
  type: TaskType;
  status: TaskStatus;
  isRequired: boolean;
  lastUpdated: string;
  category: "Permit" | "Signage" | "Document" | "Narrative";
  checkpoints: Checkpoint[];
}

export interface Project {
  id: string;
  name: string;
  client: string;
  contractNumber: string;
  status: "Active" | "On Hold" | "Completed";
  tasks: ComplianceTask[];
}

export interface ChatMessage {
  role: "user" | "agent";
  text: string;
  timestamp: string;
}
