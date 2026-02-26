-- Remove legacy background queue runtime artifacts now that orchestration
-- has moved to Trigger.dev.
--
-- Safe/idempotent:
-- - Unschedules all bg_* pg_cron jobs if pg_cron exists.
-- - Drops helper functions/tables created for pgmq pipeline.
-- - Drops the pgmq background_jobs queue if pgmq + drop_queue are available.

DO $$
DECLARE
  job RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR job IN
      SELECT jobname
      FROM cron.job
      WHERE jobname LIKE 'bg_%'
    LOOP
      PERFORM cron.unschedule(job.jobname);
    END LOOP;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.schedule_background_job(
  TEXT,
  TEXT,
  TEXT,
  JSONB,
  BOOLEAN,
  INTEGER
);

DROP FUNCTION IF EXISTS public.enqueue_background_job(
  TEXT,
  JSONB,
  TEXT,
  INTEGER,
  BOOLEAN
);

DROP TABLE IF EXISTS public.background_job_dead_letters;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgmq')
     AND EXISTS (
       SELECT 1
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'pgmq' AND p.proname = 'drop_queue'
     )
     AND to_regclass('pgmq.q_background_jobs') IS NOT NULL
  THEN
    PERFORM pgmq.drop_queue('background_jobs');
  END IF;
END $$;
