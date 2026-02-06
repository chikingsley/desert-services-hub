/**
 * Types for Monday → SharePoint estimate folder sync.
 */

export interface Asset {
  id: string;
  name: string;
  public_url: string;
}

export interface EstimateProject {
  mondayId: string;
  itemName: string;
  accountName: string;
  projectName: string;
  statusFolder: string;
  letterFolder: string;
  folderPath: string;
  existingUrl: string | null;
  action: "create" | "move" | "skip";
  oldStatusFolder?: string;
  isVariant: boolean;
  variantSuffix: string | null;
  oldVariantFolderPath?: string;
}

export interface SyncOptions {
  limit?: number;
  concurrency?: number;
  dryRun?: boolean;
  onProgress?: (progress: SyncProgress) => void;
}

export interface SyncProgress {
  phase: "fetching" | "syncing" | "complete";
  current?: number;
  total?: number;
  itemName?: string;
  status?: "created" | "moved" | "skipped" | "error";
  action?: string;
  filesUploaded?: number;
  errorMessage?: string;
}

export interface SyncResult {
  created: number;
  moved: number;
  skipped: number;
  filesUploaded: number;
  errors: string[];
}
