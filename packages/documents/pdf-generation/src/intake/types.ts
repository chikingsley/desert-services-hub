export interface ContractsEmailIntakePayload {
  originalSubject: string;
  originalFrom: string;
  bodyText: string;
  attachmentPaths: string[];
  forwarderEmail: string;
}

export interface ParseIntakeResult {
  documentId: number | null;
  fileName: string;
  documentType: string;
  pageCount: number;
  processingTimeMs: number;
  error?: string;
}

export interface EmailMeta {
  originalFrom: string;
  originalSubject: string;
  forwarderEmail: string;
}

export interface KreuzbergExtraction {
  content: string;
  tables: string[];
  metadata: Record<string, unknown>;
  extractor: string;
  ocrAttempted: boolean;
  ocrError?: string;
}
