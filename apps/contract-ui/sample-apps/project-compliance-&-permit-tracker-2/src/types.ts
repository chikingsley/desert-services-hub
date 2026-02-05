export enum TaskType {
  BINARY = "BINARY",
  STAGED = "STAGED",
  NARRATIVE = "NARRATIVE",
}

export enum ProjectStage {
  INITIATE = "Initiate",
  ESTIMATE = "Estimate",
  PLANNING = "Planning",
  EXECUTION = "Execution",
  CLOSURE = "Closure",
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

export interface ThreadItem {
  id: string;
  taskId?: string;
  taskName?: string;
  type: "email" | "file" | "status" | "comment";
  sender: string;
  content: string;
  timestamp: string;
  attachments?: { name: string; type: string; url: string }[];
  isActionRequired?: boolean;
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
  primaryAction?: string; // Next immediate step
  checkpoints: Checkpoint[];
  history: ThreadItem[];
}

export interface Project {
  id: string;
  name: string;
  client: string;
  contractNumber: string;
  stage: ProjectStage;
  status: "Active" | "On Hold" | "Completed";
  tasks: ComplianceTask[];
}

export interface ChatMessage {
  role: "user" | "agent";
  text: string;
  timestamp: string;
}

// Email types for inbox feed
export interface EmailAttachment {
  id: string;
  name: string;
  type: string;
  size?: string;
  url: string;
}

export interface EmailTag {
  projectId: string;
  projectName: string;
  taskId?: string;
  taskName?: string;
}

export interface Email {
  id: string;
  from: {
    name: string;
    email: string;
  };
  to: string[];
  cc?: string[];
  subject: string;
  preview: string;
  body: string;
  timestamp: string;
  isRead: boolean;
  isStarred: boolean;
  isActionRequired: boolean;
  attachments: EmailAttachment[];
  tags: EmailTag[];
}
