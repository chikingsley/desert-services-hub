/**
 * Job dispatch — dequeue jobs and route to the appropriate handler.
 */

import { z } from "zod";
import type { ContractsEmailIntakePayload } from "@/apps/web/lib/files-intake";
import { processFilesIntake } from "@/apps/web/lib/files-intake";
import { processItemFiles } from "@/apps/web/pipeline";
import {
  markStaleProjectSeeds,
  syncProjectSeedsFromEstimates,
} from "@/apps/workers/estimate-poller/lib/project-seed-sync";
import { syncEstimates } from "@/apps/workers/estimate-poller/lib/sync";
import { syncSharePointFolders } from "@/apps/workers/estimates-sync-worker/lib/sharepoint-sync";
import type {
  IssuedJobPayload,
  PaymentJobPayload,
} from "@/apps/workers/notifications/lib/email-triggers";
import {
  handleIssuedEmail,
  handlePaymentEmail,
} from "@/apps/workers/notifications/lib/email-triggers";
import { MAX_CONCURRENT_JOBS, PROJECT_SEED_STALE_DAYS } from "./config";
import { processEmailNotification } from "./email-processing";
import {
  processEmailResolveJob,
  processEmailResolveJobWithOptions,
} from "./email-resolver";
import { startIntakePostProcessing } from "./intake-processing";
import { syncItem } from "./monday-sync";
import {
  ensurePermitSyncForPayment,
  extractPointAndPayInvoiceNumber,
  permitIdByInvoice,
} from "./permit-sync";
import type { WebhookJob } from "./queue";
import {
  completeJob,
  dequeue,
  enqueueEstimateFileSweep,
  enqueueFullSyncIfMissing,
  failJob,
  parseJobPayload,
} from "./queue";

// -- Zod schemas for job payloads --

const NON_EMPTY_STRING_SCHEMA = z.string().trim().min(1);

const EMAIL_NOTIFICATION_PAYLOAD_SCHEMA = z.object({
  changeType: NON_EMPTY_STRING_SCHEMA,
  mailboxEmail: NON_EMPTY_STRING_SCHEMA,
  messageId: NON_EMPTY_STRING_SCHEMA,
});

const EMAIL_RESOLVE_PAYLOAD_SCHEMA = z.object({
  emailId: z.number().int().positive(),
});

const INTAKE_PAYLOAD_SCHEMA: z.ZodType<ContractsEmailIntakePayload> = z.object({
  attachmentPaths: z.array(NON_EMPTY_STRING_SCHEMA),
  bodyText: z.string(),
  forwarderEmail: z.string(),
  originalFrom: z.string(),
  originalSubject: z.string(),
});

const PAYMENT_PAYLOAD_SCHEMA: z.ZodType<PaymentJobPayload> = z.object({
  bodyText: z.string(),
  emailId: z.number().int().positive(),
  mailboxEmail: NON_EMPTY_STRING_SCHEMA,
  messageId: NON_EMPTY_STRING_SCHEMA,
});

const ISSUED_PAYLOAD_SCHEMA: z.ZodType<IssuedJobPayload> = z.object({
  bodyText: z.string(),
  emailId: z.number().int().positive(),
  mailboxEmail: NON_EMPTY_STRING_SCHEMA,
  messageId: NON_EMPTY_STRING_SCHEMA,
  subject: NON_EMPTY_STRING_SCHEMA,
});

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
      case "sync_item": {
        if (job.monday_item_id) {
          await syncItem(job.monday_item_id);
          await enqueueFullSyncIfMissing(
            `post-sync_item ${job.monday_item_id}`
          );
        }
        break;
      }

      case "download_files": {
        if (job.monday_item_id) {
          const count = await processItemFiles(job.monday_item_id);
          if (count > 0) {
            console.log(
              `[worker] Downloaded ${count} file(s) for ${job.monday_item_id}`
            );
          }
        }
        break;
      }

      case "sync_full": {
        let syncResult: Awaited<ReturnType<typeof syncEstimates>> | null = null;

        // Step 1: Monday → Postgres
        try {
          syncResult = await syncEstimates();
          console.log(
            `[worker] Full sync: ${syncResult.fetched} fetched, ${syncResult.upserted} upserted, ${syncResult.changes.length} changes`
          );
          console.log(
            `[worker] Link sync: ${syncResult.linkStats.mondayPairsUnique} pairs (${syncResult.linkStats.mondayPairsDirect} direct, ${syncResult.linkStats.mondayPairsLegacy} legacy), ${syncResult.linkStats.estimateContactsResolved} resolved, ${syncResult.linkStats.missingContact} missing-contact, ${syncResult.linkStats.missingEstimate} missing-estimate, ${syncResult.linkStats.contactsSynced} contacts synced, ${syncResult.linkStats.accountsSynced} accounts synced`
          );
          for (const change of syncResult.changes) {
            console.log(
              `[worker]   ${change.name}: ${change.oldStatus ?? "(none)"} -> ${change.newStatus ?? "(none)"}`
            );
          }
        } catch (error) {
          console.error("[worker] Estimate sync failed:", error);
        }

        // Step 2: estimate-driven project seed lifecycle sync.
        if (syncResult) {
          try {
            const seedStats = await syncProjectSeedsFromEstimates();
            const staleStats = await markStaleProjectSeeds({
              staleDays: PROJECT_SEED_STALE_DAYS,
            });
            console.log(
              `[worker] Project seed sync: ${seedStats.seedGroups} groups from ${seedStats.estimatesScanned} estimates, ${seedStats.projectsCreated} created, ${seedStats.projectsUpdated} updated, ${seedStats.linksInserted} links, ${seedStats.canonicalized} canonical, ${seedStats.promotedToActive} promoted, ${seedStats.movedToLost} moved-to-lost, ${seedStats.linkConflicts} link-conflicts, ${staleStats.movedToLost} stale-to-lost (${PROJECT_SEED_STALE_DAYS}d)`
            );
          } catch (error) {
            console.error("[worker] Project seed sync failed:", error);
          }
        }

        // Step 3: enqueue estimate file coverage sweep (rotating batch)
        if (syncResult) {
          try {
            const sweep = await enqueueEstimateFileSweep(
              syncResult.estimateFileItemIds
            );
            if (sweep.total > 0) {
              console.log(
                `[worker] Estimate extraction sweep: queued ${sweep.queued}/${sweep.batched} items (total with estimate files: ${sweep.total})`
              );
            }
          } catch (error) {
            console.error("[worker] Estimate extraction sweep failed:", error);
          }
        }

        // Step 4: Monday → SharePoint (folders, files)
        try {
          const spResult = await syncSharePointFolders();
          console.log(
            `[worker] SharePoint sync: ${spResult.processed} processed, ${spResult.created} created, ${spResult.moved} moved, ${spResult.filesUploaded} files uploaded, ${spResult.errors.length} errors`
          );
        } catch (error) {
          console.error("[worker] SharePoint sync failed:", error);
        }
        break;
      }

      case "email_notification": {
        const { messageId, mailboxEmail, changeType } = parseJobPayload(
          job,
          EMAIL_NOTIFICATION_PAYLOAD_SCHEMA
        );
        await processEmailNotification(messageId, mailboxEmail, changeType);
        break;
      }

      case "email_resolve": {
        const { emailId } = parseJobPayload(job, EMAIL_RESOLVE_PAYLOAD_SCHEMA);
        await processEmailResolveJob(emailId);
        break;
      }

      case "email_resolve_backfill": {
        const { emailId } = parseJobPayload(job, EMAIL_RESOLVE_PAYLOAD_SCHEMA);
        await processEmailResolveJobWithOptions(emailId, { allowSpark: false });
        break;
      }

      case "files_intake":
      case "contracts_email_intake":
      case "intake": {
        if (job.job_type !== "intake") {
          console.warn(
            `[worker] Deprecated intake alias job_type \`${job.job_type}\` encountered; canonical type is \`intake\`.`
          );
        }

        const filesPayload = parseJobPayload(job, INTAKE_PAYLOAD_SCHEMA);
        const results = await processFilesIntake(filesPayload);
        startIntakePostProcessing(results, filesPayload);
        break;
      }

      case "dust_permit_payment": {
        const paymentPayload = parseJobPayload(job, PAYMENT_PAYLOAD_SCHEMA);

        const invoiceNumber = extractPointAndPayInvoiceNumber(
          paymentPayload.bodyText
        );

        if (invoiceNumber) {
          const preSyncPermit = await permitIdByInvoice.get(invoiceNumber);

          // Best-effort pre-sync (keeps portal-export state fresh for invoice/permit mapping).
          try {
            // If we *don't* have the mapping yet, force a sync even if a cooldown is set.
            await ensurePermitSyncForPayment({ force: !preSyncPermit });
          } catch (error) {
            if (!preSyncPermit) {
              throw error;
            }
            const msg = error instanceof Error ? error.message : String(error);
            console.warn(
              `[worker] Permit company sync failed (non-fatal; mapping already present): ${msg}`
            );
          }

          const postSyncPermit = await permitIdByInvoice.get(invoiceNumber);
          if (!postSyncPermit) {
            throw new Error(
              `No permit found for invoice ${invoiceNumber} after permit sync`
            );
          }
        }

        await handlePaymentEmail(paymentPayload);

        // Best-effort post-sync: capture any portal-side changes (e.g. invoice balance)
        // without risking duplicate notification drafts on retry.
        if (invoiceNumber) {
          try {
            await ensurePermitSyncForPayment();
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.warn(`[worker] Post-payment permit sync failed: ${msg}`);
          }
        }
        break;
      }

      case "dust_permit_issued_email": {
        const issuedPayload = parseJobPayload(job, ISSUED_PAYLOAD_SCHEMA);
        await handleIssuedEmail(issuedPayload);
        break;
      }

      default: {
        console.log(`[worker] Unknown job type: ${job.job_type}`);
      }
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
