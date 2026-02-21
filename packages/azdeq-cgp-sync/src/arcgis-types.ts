export interface ArcGisLayerConfig {
  key: string;
  layerId: number;
  layerName: string;
  serviceName: string;
}

export interface ArcGisFeature {
  attributes: Record<string, unknown>;
  geometry?: Record<string, unknown> | null;
}

export interface ArcGisLayerMetadata {
  advancedQueryCapabilities?: {
    supportsPagination?: boolean;
  } | null;
  geometryType?: string | null;
  maxRecordCount?: number | null;
  objectIdField?: string | null;
}

export interface ArcGisLayerSyncSummary {
  expectedCount: number;
  fetchedRows: number;
  insertedRecords: number;
  key: string;
  layerId: number;
  layerName: string;
  pagesFetched: number;
  serviceName: string;
  softDeletedRecords: number;
  unchangedRecords: number;
  updatedRecords: number;
}

export interface ArcGisRunOptions {
  dbPath: string;
  delayBetweenPagesMs?: number;
  layerKeys?: string[];
  onProgress?: ArcGisProgress;
  pageSize?: number;
}

export interface ArcGisRunSummary {
  failedLayers: number;
  fetchedRows: number;
  finishedAt: string;
  insertedRecords: number;
  layerSummaries: ArcGisLayerSyncSummary[];
  runId: string;
  startedAt: string;
  unchangedRecords: number;
  updatedRecords: number;
}

export interface ArcGisClientOptions {
  maxRetries?: number;
  timeoutMs?: number;
}

export type ArcGisProgress = (
  layerKey: string,
  fetchedRows: number,
  expectedCount: number
) => void;
