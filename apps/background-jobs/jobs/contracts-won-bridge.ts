import { runContractWonBridge as runCore } from "@contract/contract-won-bridge";
import type {
  ContractDocExtractPayload,
  ContractWonBridgeResult,
} from "@contract/types";
import { enqueueJob } from "./queue";

export async function runContractWonBridge(): Promise<ContractWonBridgeResult> {
  return await runCore(
    async (payload: ContractDocExtractPayload): Promise<void> => {
      await enqueueJob("contract_doc_extract", { payload });
    }
  );
}
