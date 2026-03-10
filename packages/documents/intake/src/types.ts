export interface SourcePersistenceRef {
  sharepointPath: string | null;
  sharepointUrl: string | null;
}

export interface ContractsEmailIntakePayload {
  /** Parallel array of file content buffers. When provided, sends content as
   *  base64 to the pdf-analysis service instead of a local file path. Use when
   *  the caller and pdf-analysis don't share a filesystem. */
  attachmentBuffers?: Buffer[];
  attachmentPaths: string[];
  bodyText: string;
  forwarderEmail: string;
  originalFrom: string;
  originalSubject: string;
}

export interface ParseIntakeResult {
  documentId: number | null;
  documentType: string;
  error?: string;
  fileName: string;
  pageCount: number;
  processingTimeMs: number;
  sourcePersistence: SourcePersistenceRef | null;
}

export interface EmailMeta {
  forwarderEmail: string;
  originalFrom: string;
  originalSubject: string;
}
