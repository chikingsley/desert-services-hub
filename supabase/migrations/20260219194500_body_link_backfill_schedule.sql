-- Schedule recurring body-link backfill through the background_jobs queue.

SELECT public.schedule_background_job(
  'bg_body_link_backfill',
  '*/5 * * * *',
  'body_link_backfill',
  '{}'::jsonb,
  TRUE,
  3
);
