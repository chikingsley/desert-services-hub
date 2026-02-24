/** Job payload schemas for the background-jobs worker. */

import { z } from "zod";

const NON_EMPTY_STRING_SCHEMA = z.string().trim().min(1);

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

export const AQDATA_DETAIL_SCRAPE_PAYLOAD_SCHEMA = z.object({
  limit: z.number().int().positive().max(500).optional(),
});

export const PAYMENT_PAYLOAD_SCHEMA = z.object({
  emailId: z.number().int().positive(),
  messageId: NON_EMPTY_STRING_SCHEMA,
  mailboxEmail: NON_EMPTY_STRING_SCHEMA,
  bodyText: z.string(),
});
export type PaymentJobPayload = z.infer<typeof PAYMENT_PAYLOAD_SCHEMA>;

export const ISSUED_PAYLOAD_SCHEMA = z.object({
  emailId: z.number().int().positive(),
  messageId: NON_EMPTY_STRING_SCHEMA,
  mailboxEmail: NON_EMPTY_STRING_SCHEMA,
  bodyText: z.string(),
  subject: NON_EMPTY_STRING_SCHEMA,
});
export type IssuedJobPayload = z.infer<typeof ISSUED_PAYLOAD_SCHEMA>;
