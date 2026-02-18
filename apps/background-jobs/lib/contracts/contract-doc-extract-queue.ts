import { enqueueJob } from "@background-jobs/jobs/queue";
import {
  enqueueContractDocExtractions as enqueueCore,
  processContractDocExtractJob as processCore,
} from "@email/contracts/contract-doc-extract-queue";
import type { ContractDocExtractPayload } from "@email/contracts/types";

const enqueueFromQueue = async (
  payload: ContractDocExtractPayload
): Promise<void> => {
  await enqueueJob.run("contract_doc_extract", null, JSON.stringify(payload));
};

export function enqueueContractDocExtractions(): Promise<number> {
  return enqueueCore(enqueueFromQueue);
}

export function processContractDocExtractJob(
  payload: ContractDocExtractPayload
): Promise<void> {
  return processCore(payload);
}
