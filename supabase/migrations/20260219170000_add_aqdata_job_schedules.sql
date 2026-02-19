-- Schedule AQData sync + detail scrape jobs in pg_cron/pgmq pipeline.

SELECT public.schedule_background_job(
  'bg_aqdata_sync',
  '*/15 * * * *',
  'aqdata_sync',
  '{}'::jsonb,
  TRUE,
  3
);

SELECT public.schedule_background_job(
  'bg_aqdata_detail_scrape',
  '*/5 * * * *',
  'aqdata_detail_scrape',
  '{"limit":10}'::jsonb,
  TRUE,
  3
);
