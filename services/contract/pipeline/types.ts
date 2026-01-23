export type ProcessingStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export interface ProcessedContract {
  id: number;
  filename: string;
  filePath: string;
  processedAt: string;
  status: ProcessingStatus;
}

export type PipelineHandler = (filePath: string) => Promise<void>;
