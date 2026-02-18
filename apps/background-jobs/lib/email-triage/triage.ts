import { INTERNAL_DOMAINS } from "@background-jobs/jobs/config";
import { enqueueJob } from "@background-jobs/jobs/queue";
import { triageEmail as triageEmailCore } from "@email/triage/triage";
import type {
  TriageEmailMeta,
  TriageOptions,
  TriageOutcome,
} from "@email/triage/types";

const enqueueFromQueue = async (
  jobType: Parameters<NonNullable<TriageOptions["enqueueJob"]>>[0],
  payload: Parameters<NonNullable<TriageOptions["enqueueJob"]>>[1]
): Promise<void> => {
  await enqueueJob.run(jobType, null, JSON.stringify(payload));
};

export function triageEmail(
  emailId: number,
  meta: TriageEmailMeta,
  options?: TriageOptions
): Promise<TriageOutcome> {
  return triageEmailCore(emailId, meta, {
    ...options,
    internalDomains: options?.internalDomains ?? INTERNAL_DOMAINS,
    enqueueJob: options?.enqueueJob ?? enqueueFromQueue,
  });
}

export type {
  TriageEmailMeta,
  TriageOptions,
  TriageOutcome,
} from "@email/triage/types";
