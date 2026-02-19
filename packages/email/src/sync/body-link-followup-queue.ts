import { db } from "@lib/db/client";
import type { BodyLinkSource } from "@lib/downloads/types";

export interface BodyLinkManualFollowupPayload {
  emailId: number;
  mailboxEmail: string;
  reason: string;
  source: BodyLinkSource;
  url: string;
}

const enqueueBodyLinkManualFollowupJob = db.query<{ id: number | null }>(
  `SELECT public.enqueue_background_job(
     'body_link_manual_followup',
     ($1::text)::jsonb,
     NULL,
     3,
     TRUE
   )::bigint AS id`
);

export async function enqueueBodyLinkManualFollowup(
  payload: BodyLinkManualFollowupPayload
): Promise<number | null> {
  const row = await enqueueBodyLinkManualFollowupJob.get(
    JSON.stringify(payload)
  );
  return row?.id ?? null;
}
