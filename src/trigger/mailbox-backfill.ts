/**
 * Mailbox Backfill — Trigger.dev on-demand task
 *
 * One-shot task for filling email gaps (e.g. after a database swap or
 * downtime). Accepts configurable lookback window and per-mailbox limit.
 *
 * Trigger manually via API or dashboard — not scheduled.
 *
 * Uses the same pipeline as mailbox-sync:
 *   fetch → dedup → insert → attachment stubs → enrichment
 */

import { getAllMailboxes } from "@lib/db/repositories/mailbox";
import { logger, schemaTask } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import {
  buildSinceFilter,
  type MailboxSyncResult,
  syncOneMailbox,
} from "./mailbox-sync";

export const mailboxBackfill = schemaTask({
  id: "mailbox-backfill",
  schema: z.object({
    lookbackHours: z.number().min(1).max(720).default(96),
    maxEmailsPerMailbox: z.number().min(1).max(5000).default(1000),
  }),
  maxDuration: 1800, // 30 min — backfill is heavy
  retry: { maxAttempts: 1 },
  run: async ({ lookbackHours, maxEmailsPerMailbox }) => {
    const mailboxes = await getAllMailboxes();
    if (mailboxes.length === 0) {
      logger.warn("No mailboxes found");
      return { mailboxes: 0, totalStored: 0, totalAttachments: 0, errors: 0 };
    }

    const sinceIso = buildSinceFilter(lookbackHours);

    logger.info("Starting mailbox backfill", {
      mailboxes: mailboxes.length,
      lookbackHours,
      maxEmailsPerMailbox,
      since: sinceIso,
    });

    const results: MailboxSyncResult[] = [];

    for (const mailbox of mailboxes) {
      const result = await syncOneMailbox(
        mailbox.email,
        mailbox.id,
        sinceIso,
        maxEmailsPerMailbox
      );
      results.push(result);

      if (result.stored > 0 || result.error) {
        logger.info("Mailbox backfill progress", {
          email: mailbox.email,
          fetched: result.fetched,
          stored: result.stored,
          skipped: result.skipped,
          attachments: result.attachments,
          enriched: result.enriched,
          error: result.error,
        });
      }
    }

    const totalStored = results.reduce((sum, r) => sum + r.stored, 0);
    const totalFetched = results.reduce((sum, r) => sum + r.fetched, 0);
    const totalAttachments = results.reduce((sum, r) => sum + r.attachments, 0);
    const totalEnriched = results.reduce((sum, r) => sum + r.enriched, 0);
    const errors = results.filter((r) => r.error !== null).length;

    logger.info("Mailbox backfill complete", {
      mailboxes: mailboxes.length,
      totalFetched,
      totalStored,
      totalAttachments,
      totalEnriched,
      errors,
    });

    return {
      mailboxes: mailboxes.length,
      totalFetched,
      totalStored,
      totalAttachments,
      totalEnriched,
      errors,
    };
  },
});
