-- Migrate permit_sync and permit_detail_scrape from pg_cron/pgmq → Trigger.dev
-- These jobs now run as Trigger.dev scheduled tasks in src/trigger/
-- Safe to run even if pg_cron is not installed.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('bg_permit_sync');
    PERFORM cron.unschedule('bg_permit_detail_scrape');
  END IF;
END $$;
