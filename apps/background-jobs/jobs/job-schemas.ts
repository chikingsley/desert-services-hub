/**
 * Orchestration-level job payload schemas.
 *
 * Domain-specific schemas live next to their types:
 *   - @lib/notifications/types   → PAYMENT_PAYLOAD_SCHEMA, ISSUED_PAYLOAD_SCHEMA
 *   - @contract/types            → CONTRACT_EMAIL_PAYLOAD_SCHEMA
 *   - @enrichment/types          → CONTACT_ENRICHMENT_PAYLOAD_SCHEMA
 *   - @lib/triage/types          → EMAIL_TRIAGE_BATCH_PAYLOAD_SCHEMA
 *   - @lib/linking/types         → LINK_ESTIMATE_PAYLOAD_SCHEMA
 *   - @email/sync/bc-sync/types → SYNC_BC_FILE_PAYLOAD_SCHEMA
 */

import type { ContractsEmailIntakePayload } from "@documents-intake/types";
import { z } from "zod";

const NON_EMPTY_STRING_SCHEMA = z.string().trim().min(1);

export const EMAIL_NOTIFICATION_PAYLOAD_SCHEMA = z.object({
  messageId: NON_EMPTY_STRING_SCHEMA,
  mailboxEmail: NON_EMPTY_STRING_SCHEMA,
  changeType: NON_EMPTY_STRING_SCHEMA,
});

export const INTAKE_PAYLOAD_SCHEMA: z.ZodType<ContractsEmailIntakePayload> =
  z.object({
    originalSubject: z.string(),
    originalFrom: z.string(),
    bodyText: z.string(),
    attachmentPaths: z.array(NON_EMPTY_STRING_SCHEMA),
    forwarderEmail: z.string(),
  });

export const BODY_LINK_MANUAL_FOLLOWUP_PAYLOAD_SCHEMA = z.object({
  emailId: z.number().int().positive(),
  mailboxEmail: NON_EMPTY_STRING_SCHEMA,
  reason: NON_EMPTY_STRING_SCHEMA,
  source: z.enum(["onedrive", "egnyte", "dropbox", "buildingconnected"]),
  url: NON_EMPTY_STRING_SCHEMA,
});

export const ESTIMATE_TRIAGE_PAYLOAD_SCHEMA = z.object({
  maxRows: z.number().int().positive(),
});

export const MAILBOX_FALLBACK_SYNC_PAYLOAD_SCHEMA = z.object({
  enabled: z.boolean().optional(),
  lookbackHours: z
    .number()
    .int()
    .positive()
    .max(24 * 7)
    .optional(),
  maxPerMailbox: z.number().int().positive().max(5000).optional(),
  concurrency: z.number().int().positive().max(8).optional(),
  fetchBodies: z.boolean().optional(),
  fetchAttachments: z.boolean().optional(),
});

export const BODY_LINK_BACKFILL_PAYLOAD_SCHEMA = z.object({
  enabled: z.boolean().optional(),
  lookbackDays: z.number().int().positive().max(3650).optional(),
  limit: z.number().int().positive().max(10_000).optional(),
  mailbox: NON_EMPTY_STRING_SCHEMA.optional(),
  maxLinks: z.number().int().positive().max(50).optional(),
});

export const AQDATA_DETAIL_SCRAPE_PAYLOAD_SCHEMA = z.object({
  limit: z.number().int().positive().max(500).optional(),
});
