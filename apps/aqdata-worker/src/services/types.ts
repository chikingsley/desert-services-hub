import type { DustApplication } from "../aqdata/types";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface AQPermitRecord extends DustApplication {
  coordinates: Coordinates | null;
}

export interface SyncStats {
  matchedCompanyName?: string;
  outputPath: string;
  permitsFilePath: string;
  totalRecords: number;
  withCoordinates: number;
  upsertedToDb: number;
}

export interface SyncResult {
  success: boolean;
  stats: SyncStats;
  error?: string;
}

export interface DetailScrapeStats {
  failed: number;
  queued: number;
  scraped: number;
  skipped: number;
}

export interface DetailScrapeResult {
  success: boolean;
  stats: DetailScrapeStats;
  error?: string;
}

export interface ScrapeLoopStatus {
  isRunning: boolean;
  intervalMs: number;
  lastRunAt?: string;
  lastRunError?: string;
}
