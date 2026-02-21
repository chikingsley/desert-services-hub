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
  upsertedToDb: number;
  withCoordinates: number;
}

export interface SyncResult {
  error?: string;
  stats: SyncStats;
  success: boolean;
}

export interface DetailScrapeStats {
  failed: number;
  queued: number;
  scraped: number;
  skipped: number;
}

export interface DetailScrapeResult {
  error?: string;
  stats: DetailScrapeStats;
  success: boolean;
}

export interface ScrapeLoopStatus {
  intervalMs: number;
  isRunning: boolean;
  lastRunAt?: string;
  lastRunError?: string;
}
