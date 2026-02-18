import { processFilesIntake as processFilesIntakeCore } from "@documents/intake/files-intake";

export type {
  ContractsEmailIntakePayload,
  ParseIntakeResult,
} from "@documents/intake/types";

export function processFilesIntake(
  payload: import("@documents/intake/types").ContractsEmailIntakePayload
): Promise<import("@documents/intake/types").ParseIntakeResult[]> {
  return processFilesIntakeCore(payload);
}
