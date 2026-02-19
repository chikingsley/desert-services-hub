import { runContractWonBridge as runCore } from "@email/contracts/contract-won-bridge";
import type {
  ContractDocExtractPayload,
  ContractWonBridgeResult,
} from "@email/contracts/types";
import { enqueueJob } from "./queue";

export async function runContractWonBridge(): Promise<ContractWonBridgeResult> {
  return await runCore(
    async (payload: ContractDocExtractPayload): Promise<void> => {
      await enqueueJob("contract_doc_extract", { payload });
    }
  );
}
