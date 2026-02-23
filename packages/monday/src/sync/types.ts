/**
 * Types for Monday → SharePoint estimate folder sync.
 */

export interface Asset {
  id: string;
  name: string;
  public_url: string;
}

export interface EstimateProject {
  accountName: string;
  action: "create" | "move" | "skip";
  existingUrl: string | null;
  folderPath: string;
  isVariant: boolean;
  itemName: string;
  letterFolder: string;
  mondayId: string;
  oldStatusFolder?: string;
  oldVariantFolderPath?: string;
  projectName: string;
  statusFolder: string;
  variantSuffix: string | null;
}

export interface SyncOptions {
  concurrency?: number;
  dryRun?: boolean;
  limit?: number;
  onProgress?: (progress: SyncProgress) => void;
}

export interface SyncProgress {
  action?: string;
  current?: number;
  errorMessage?: string;
  filesUploaded?: number;
  itemName?: string;
  phase: "fetching" | "syncing" | "complete";
  status?: "created" | "moved" | "skipped" | "error";
  total?: number;
}

export interface SyncResult {
  created: number;
  errors: string[];
  filesUploaded: number;
  moved: number;
  skipped: number;
}
