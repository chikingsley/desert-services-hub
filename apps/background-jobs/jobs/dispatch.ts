/**
 * Job dispatch — dequeue jobs and route to the appropriate handler.
 */

import type { ContractDocExtractPayload } from "@email/contracts/types";
import { MAX_CONCURRENT_JOBS, MAX_LLM_CONCURRENT_JOBS } from "./config";
import {
  processContractEmailReceivedJob,
  processDownloadFilesJob,
  processDustPermitIssuedEmailJob,
  processDustPermitPaymentJob,
  processEmailNotificationJob,
  processIntakeJob,
  processSyncFullJob,
  processSyncItemJob,
} from "./handlers";
import { completeJob, dequeue, failJob, parseJobPayload } from "./queue";
import type { WebhookJob } from "./types";

// -- LLM concurrency lane --

const LLM_JOB_TYPES = new Set([
  "contact_enrichment",
  "email_triage_batch",
  "estimate_triage",
]);

// -- State --

let activeJobs = 0;
let activeLlmJobs = 0;

export function getActiveJobCount(): number {
  return activeJobs;
}

// -- Main --

export async function processNextJob(): Promise<void> {
  if (activeJobs >= MAX_CONCURRENT_JOBS) {
    return;
  }

  activeJobs += 1;
  let job: WebhookJob | null = null;
  let isLlm = false;
  try {
    job = await dequeue({
      excludeLlmTypes: activeLlmJobs >= MAX_LLM_CONCURRENT_JOBS,
    });
    if (!job) {
      return;
    }

    isLlm = LLM_JOB_TYPES.has(job.job_type);
    if (isLlm) {
      activeLlmJobs += 1;
    }

    console.log(
      `[worker] Processing job #${job.id}: ${job.job_type} (attempt ${job.attempts})${isLlm ? " [LLM]" : ""}`
    );

    switch (job.job_type) {
      case "sync_item":
        await processSyncItemJob(job);
        break;

      case "download_files":
        await processDownloadFilesJob(job);
        break;

      case "sync_full":
        await processSyncFullJob();
        break;

      case "email_notification":
        await processEmailNotificationJob(job);
        break;

      case "intake":
        await processIntakeJob(job);
        break;

      case "dust_permit_payment":
        await processDustPermitPaymentJob(job);
        break;

      case "dust_permit_issued_email":
        await processDustPermitIssuedEmailJob(job);
        break;

      case "contract_email_received":
        await processContractEmailReceivedJob(job);
        break;

      case "contract_doc_extract": {
        const { processContractDocExtractJob } = await import(
          "@background-jobs/lib/contracts/contract-doc-extract-queue"
        );
        const extractPayload = JSON.parse(
          job.payload
        ) as ContractDocExtractPayload;
        await processContractDocExtractJob(extractPayload);
        break;
      }

      case "contact_enrichment": {
        const { CONTACT_ENRICHMENT_PAYLOAD_SCHEMA } = await import(
          "./job-schemas"
        );
        const payload = parseJobPayload(job, CONTACT_ENRICHMENT_PAYLOAD_SCHEMA);
        const { enrichContacts } = await import("@email/sync/link-contacts");
        const result = await enrichContacts(payload.batchSize);
        if (result.enriched > 0 || result.errors > 0) {
          console.log(
            `[worker] Contact enrichment: ${result.enriched} enriched, ${result.errors} errors`
          );
        }
        break;
      }

      case "email_triage_batch": {
        const { EMAIL_TRIAGE_BATCH_PAYLOAD_SCHEMA } = await import(
          "./job-schemas"
        );
        const payload = parseJobPayload(job, EMAIL_TRIAGE_BATCH_PAYLOAD_SCHEMA);
        const { processTriageBackfillBatch } = await import(
          "@background-jobs/lib/email-triage/triage-backfill"
        );
        const result = await processTriageBackfillBatch(payload);
        if (result.fetched > 0) {
          console.log(
            `[worker] Email triage batch: ${result.processed} ok, ${result.errors} errors, ${result.elapsedMs}ms`
          );
        }
        break;
      }

      case "estimate_triage": {
        const { ESTIMATE_TRIAGE_PAYLOAD_SCHEMA } = await import(
          "./job-schemas"
        );
        const payload = parseJobPayload(job, ESTIMATE_TRIAGE_PAYLOAD_SCHEMA);
        const { runEstimateExtractionTriage } = await import(
          "@background-jobs/lib/estimates/estimate-extraction-triage"
        );
        const result = await runEstimateExtractionTriage({
          maxRows: payload.maxRows,
          log: (line) => console.log(`[worker] ${line}`),
        });
        if (result.candidateRows > 0) {
          console.log(
            `[worker] Estimate triage: candidates=${result.candidateRows}, reset=${result.resetToPending}, non_pdf=${result.markedNonPdf}, no_asset=${result.skippedNoAsset}`
          );
        }
        break;
      }

      default:
        console.log(`[worker] Unknown job type: ${job.job_type}`);
    }

    await completeJob.run(job.id);
    console.log(`[worker] Completed job #${job.id}: ${job.job_type}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (job) {
      console.error(
        `[worker] Job #${job.id} failed (attempt ${job.attempts}/${job.max_attempts}): ${msg}`
      );
      await failJob.run(msg.slice(0, 1000), job.id);
    } else {
      console.error(`[worker] Job processing error: ${msg}`);
    }
  } finally {
    if (isLlm) {
      activeLlmJobs -= 1;
    }
    activeJobs -= 1;
  }
}
