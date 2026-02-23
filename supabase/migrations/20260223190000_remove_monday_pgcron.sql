-- Remove Monday.com sync pg_cron schedules.
-- These jobs have been migrated to Trigger.dev:
--   Job #1: sync_full (*/10 * * * *) → monday-sync
--   Job #13: monday_status_sync (0 * * * *) → monday-sync

SELECT cron.unschedule(1);
SELECT cron.unschedule(13);
