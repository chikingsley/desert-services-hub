-- Webhook safety net: periodic bounded mailbox sync to recover missed notifications.
-- Keep this deterministic and light: incremental, small per-mailbox cap.

SELECT public.schedule_background_job(
  'bg_mailbox_fallback_sync',
  '*/15 * * * *',
  'mailbox_fallback_sync',
  '{"enabled":true,"lookbackHours":6,"maxPerMailbox":250,"concurrency":2,"fetchBodies":true,"fetchAttachments":true}'::jsonb,
  TRUE,
  3
);
