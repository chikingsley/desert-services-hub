import { INTERNAL_DOMAINS } from "@background-jobs/jobs/config";
import { enqueueJob } from "@background-jobs/jobs/queue";
import { processTriageBackfillBatch as processBatchCore } from "@email/triage/backfill";
import type {
  TriageBackfillOptions,
  TriageBackfillResult,
} from "@email/triage/types";

const enqueueFromQueue = async (
  jobType: Parameters<NonNullable<TriageBackfillOptions["enqueueJob"]>>[0],
  payload: Parameters<NonNullable<TriageBackfillOptions["enqueueJob"]>>[1]
): Promise<void> => {
  await enqueueJob.run(jobType, null, JSON.stringify(payload));
};

export function processTriageBackfillBatch(
  options: TriageBackfillOptions
): Promise<TriageBackfillResult> {
  return processBatchCore({
    ...options,
    internalDomains: options.internalDomains ?? INTERNAL_DOMAINS,
    enqueueJob: options.enqueueJob ?? enqueueFromQueue,
  });
}

export type {
  TriageBackfillOptions,
  TriageBackfillResult,
} from "@email/triage/types";
