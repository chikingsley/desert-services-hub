/**
 * Job dispatch — dequeue jobs and route to the appropriate handler.
 */

import { MAX_CONCURRENT_JOBS } from "./config";
import {
  processDownloadFilesJob,
  processDustPermitIssuedEmailJob,
  processDustPermitPaymentJob,
  processEmailNotificationJob,
  processEmailResolveJobFromQueue,
  processIntakeJob,
  processSyncFullJob,
  processSyncItemJob,
} from "./dispatch-handlers";
import { completeJob, dequeue, failJob, type WebhookJob } from "./queue";

// -- State --

let activeJobs = 0;

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
  try {
    job = await dequeue();
    if (!job) {
      return;
    }

    console.log(
      `[worker] Processing job #${job.id}: ${job.job_type} (attempt ${job.attempts})`
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

      case "email_resolve":
        await processEmailResolveJobFromQueue(job);
        break;

      case "files_intake":
      case "contracts_email_intake":
      case "intake":
        await processIntakeJob(job);
        break;

      case "dust_permit_payment":
        await processDustPermitPaymentJob(job);
        break;

      case "dust_permit_issued_email":
        await processDustPermitIssuedEmailJob(job);
        break;

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
    activeJobs -= 1;
  }
}
