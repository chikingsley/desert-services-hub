import {
  type BuildingConnectedSyncResult,
  syncBuildingConnectedFiles,
} from "@email/sync/bc-sync/processing";

export interface RunBuildingConnectedSyncOptions {
  enabled: boolean;
  batchSize: number;
}

export interface RunBuildingConnectedSyncResult {
  attempted: boolean;
  outcome: "disabled" | "success" | "error";
  syncResult?: BuildingConnectedSyncResult;
  error?: string;
}

type BuildingConnectedSyncFn = (options: {
  batchSize: number;
}) => Promise<BuildingConnectedSyncResult>;

function normalizeBatchSize(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    return 50;
  }
  return Math.floor(value);
}

export async function runBuildingConnectedSync(
  options: RunBuildingConnectedSyncOptions,
  syncFn: BuildingConnectedSyncFn = syncBuildingConnectedFiles
): Promise<RunBuildingConnectedSyncResult> {
  if (!options.enabled) {
    return { attempted: false, outcome: "disabled" };
  }

  try {
    const syncResult = await syncFn({
      batchSize: normalizeBatchSize(options.batchSize),
    });
    return { attempted: true, outcome: "success", syncResult };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { attempted: true, error: message, outcome: "error" };
  }
}
