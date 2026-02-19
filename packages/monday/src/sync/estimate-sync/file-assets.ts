import { ESTIMATING_COLUMNS } from "@monday/types/schema";

export interface FileColumnAsset {
  assetId: number;
  name: string;
}

export interface FileColumnValue {
  id: string;
  value: string | null;
}

/**
 * Parse Monday file column JSON payload.
 */
export function parseFileColumnValue(
  rawValue: string | null
): FileColumnAsset[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as {
      files?: Array<{ assetId?: number; name?: string }>;
    };
    const files = parsed.files ?? [];

    return files
      .filter((file) => typeof file.assetId === "number")
      .map((file) => ({
        assetId: file.assetId as number,
        name:
          typeof file.name === "string" && file.name.trim().length > 0
            ? file.name
            : String(file.assetId),
      }));
  } catch {
    return [];
  }
}

export function itemHasEstimateFiles(columnValues: FileColumnValue[]): boolean {
  const estimateColumn = columnValues.find(
    (cv) => cv.id === ESTIMATING_COLUMNS.ESTIMATE.id
  );
  if (!estimateColumn?.value) {
    return false;
  }

  return parseFileColumnValue(estimateColumn.value).length > 0;
}
