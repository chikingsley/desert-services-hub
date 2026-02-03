
export type Priority = 'Low' | 'Medium' | 'High';

export interface Attachment {
  id: string;
  name: string;
  size: string;
  type: string;
  url: string;
  category?: 'Permit' | 'Contract' | 'Invoice' | 'Blueprint' | 'Other';
}

export interface Email {
  id: string;
  sender: string;
  senderEmail: string;
  subject: string;
  body: string;
  timestamp: string;
  attachments: Attachment[];
  tags: string[];
  projectId?: string;
  estimateId?: string;
  isRead: boolean;
  aiSummary?: string;
}

export interface Estimate {
  id: string;
  number: string;
  amount: string;
  status: 'Draft' | 'Sent' | 'Won' | 'Lost';
  date: string;
}

export interface Task {
  id: string;
  title: string;
  status: 'Pending' | 'In Progress' | 'Done';
  dueDate: string;
  assignee: string;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  status: 'In Review' | 'Active' | 'Permitting' | 'Completed';
  emails: string[]; 
  files: Attachment[];
  estimates: Estimate[];
  tasks: Task[];
  startDate: string;
  endDate: string;
  lastActivity: string;
  progress: number;
  description: string;
}

export type TriageType = 'new_email' | 'unlinked_doc' | 'project_update';

export interface TriageItem {
  id: string;
  type: TriageType;
  title: string;
  subtitle: string;
  timestamp: string;
  metadata: any; 
  isResolved: boolean;
}

export type ViewMode = 'triage' | 'projects' | 'analytics' | 'archive';
