export interface MegaSearchEndpointConfig {
  checkbox: string;
  endpoint: string;
  label: string;
}

export interface MegaSearchQuery {
  address: string;
  city: string;
  facilityName: string;
  uniqueId: string;
  zip: string;
}

export type MegaSearchQueryField = keyof MegaSearchQuery;

export interface MegaSearchClientOptions {
  baseUrl?: string;
  headless?: boolean;
  maxRetries?: number;
  queryCap?: number;
  referer?: string;
  timeoutMs?: number;
  userAgent?: string;
}

export interface MegaSearchQueryResult {
  endpoint: string;
  query: MegaSearchQuery;
  rawEnvelope: Record<string, unknown>;
  responseStatus: number;
  rows: MegaSearchRow[];
}

export interface MegaSearchQueryErrorDetails {
  endpoint: string;
  query: MegaSearchQuery;
  retryAfterMs?: number | null;
  responseStatus: number;
}

export type MegaSearchRow = Record<string, unknown>;

export interface MegaSearchRunOptions {
  dbPath: string;
  delayBetweenQueriesMs?: number;
  endpointNames?: string[];
  headless?: boolean;
  maxQueriesPerEndpoint?: number;
  maxSplitLevels?: number;
  onProgress?: MegaSearchProgress;
}

export interface MegaSearchEndpointSyncSummary {
  cappedQueries: number;
  endpoint: string;
  failedQueries: number;
  fetchedRows: number;
  insertedRecords: number;
  label: string;
  queriedCount: number;
  truncatedByQueryLimit: boolean;
  unchangedRecords: number;
  uniqueRecordIdsSeen: number;
  unresolvedCappedQueries: number;
  updatedRecords: number;
}

export interface MegaSearchRunSummary {
  cappedQueries: number;
  endpointSummaries: MegaSearchEndpointSyncSummary[];
  failedQueries: number;
  fetchedRows: number;
  finishedAt: string;
  insertedRecords: number;
  queriedCount: number;
  runId: string;
  startedAt: string;
  unchangedRecords: number;
  updatedRecords: number;
}

export type MegaSearchProgress = (
  endpoint: string,
  queriedCount: number,
  maxQueriesPerEndpoint: number
) => void;
