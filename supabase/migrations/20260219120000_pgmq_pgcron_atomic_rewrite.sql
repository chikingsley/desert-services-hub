-- Atomic rewrite: move background queue + scheduling to pgmq + pg_cron.
-- No compatibility layer with webhook_jobs.

CREATE EXTENSION IF NOT EXISTS pgmq;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create the canonical queue used by apps/background-jobs.
SELECT pgmq.create('background_jobs');

CREATE TABLE IF NOT EXISTS public.background_job_dead_letters (
  id BIGSERIAL PRIMARY KEY,
  queue_name TEXT NOT NULL DEFAULT 'background_jobs',
  job_id BIGINT NOT NULL,
  job_type TEXT NOT NULL,
  monday_item_id TEXT,
  payload JSONB NOT NULL,
  attempts INTEGER NOT NULL,
  max_attempts INTEGER NOT NULL,
  error TEXT NOT NULL,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_background_job_dead_letters_type
  ON public.background_job_dead_letters(job_type);

CREATE INDEX IF NOT EXISTS idx_background_job_dead_letters_failed_at
  ON public.background_job_dead_letters(failed_at DESC);

CREATE OR REPLACE FUNCTION public.enqueue_background_job(
  p_job_type TEXT,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_monday_item_id TEXT DEFAULT NULL,
  p_max_attempts INTEGER DEFAULT 3,
  p_dedupe BOOLEAN DEFAULT FALSE
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing BIGINT;
  v_msg_id BIGINT;
BEGIN
  IF p_dedupe THEN
    SELECT q.msg_id
    INTO v_existing
    FROM pgmq.q_background_jobs AS q
    WHERE q.message->>'job_type' = p_job_type
      AND COALESCE(q.message->>'monday_item_id', '') = COALESCE(p_monday_item_id, '')
      AND COALESCE(q.message->'payload', '{}'::jsonb) = COALESCE(p_payload, '{}'::jsonb)
    ORDER BY q.msg_id
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT pgmq.send(
    'background_jobs',
    jsonb_build_object(
      'job_type', p_job_type,
      'monday_item_id', p_monday_item_id,
      'payload', COALESCE(p_payload, '{}'::jsonb),
      'max_attempts', GREATEST(1, COALESCE(p_max_attempts, 3))
    )
  )
  INTO v_msg_id;

  RETURN v_msg_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.schedule_background_job(
  p_name TEXT,
  p_cron TEXT,
  p_job_type TEXT,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_dedupe BOOLEAN DEFAULT TRUE,
  p_max_attempts INTEGER DEFAULT 3
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = p_name) THEN
    RETURN;
  END IF;

  PERFORM cron.schedule(
    p_name,
    p_cron,
    format(
      $fmt$SELECT public.enqueue_background_job(%L, %L::jsonb, NULL, %s, %L);$fmt$,
      p_job_type,
      p_payload::text,
      GREATEST(1, COALESCE(p_max_attempts, 3)),
      p_dedupe
    )
  );
END;
$$;

-- Migrate pending legacy jobs into pgmq, then remove legacy table.
DO $$
BEGIN
  IF to_regclass('public.webhook_jobs') IS NOT NULL THEN
    PERFORM pgmq.send(
      'background_jobs',
      jsonb_build_object(
        'job_type', w.job_type,
        'monday_item_id', w.monday_item_id,
        'payload', COALESCE(w.payload::jsonb, '{}'::jsonb),
        'max_attempts', GREATEST(1, COALESCE(w.max_attempts, 3))
      )
    )
    FROM public.webhook_jobs AS w
    WHERE (
      w.status = 'pending'
      OR (w.status = 'failed' AND COALESCE(w.attempts, 0) < COALESCE(w.max_attempts, 3))
      OR w.status = 'processing'
    );

    DROP TABLE public.webhook_jobs;
  END IF;
END $$;

-- Canonical schedules (DB-native scheduler via pg_cron).
-- Note: pg_cron cadence is minute-based. Former 30s jobs now run every minute.
SELECT public.schedule_background_job('bg_sync_full', '*/10 * * * *', 'sync_full', '{}'::jsonb, TRUE, 3);
SELECT public.schedule_background_job('bg_folder_watcher', '* * * * *', 'folder_watcher_poll', '{}'::jsonb, TRUE, 3);
SELECT public.schedule_background_job('bg_estimate_linker', '* * * * *', 'estimate_linker_maintenance', '{}'::jsonb, TRUE, 3);
SELECT public.schedule_background_job('bg_swppp_master_sync', '* * * * *', 'swppp_master_sync', '{}'::jsonb, TRUE, 3);
SELECT public.schedule_background_job('bg_attachment_backfill', '* * * * *', 'attachment_backfill', '{}'::jsonb, TRUE, 3);
SELECT public.schedule_background_job('bg_email_triage_batch', '* * * * *', 'email_triage_batch', '{"batchSize":20,"concurrency":3,"provider":"local"}'::jsonb, TRUE, 3);
SELECT public.schedule_background_job('bg_estimate_triage', '*/5 * * * *', 'estimate_triage', '{"maxRows":4}'::jsonb, TRUE, 3);
SELECT public.schedule_background_job('bg_contract_won_bridge', '*/2 * * * *', 'contract_won_bridge', '{}'::jsonb, TRUE, 3);
SELECT public.schedule_background_job('bg_account_linking', '* * * * *', 'account_linking', '{}'::jsonb, TRUE, 3);
SELECT public.schedule_background_job('bg_contact_linking', '* * * * *', 'contact_linking', '{}'::jsonb, TRUE, 3);
SELECT public.schedule_background_job('bg_subscription_renewal', '0 * * * *', 'subscription_renewal', '{}'::jsonb, TRUE, 3);
SELECT public.schedule_background_job('bg_group_sync', '*/15 * * * *', 'group_sync', '{}'::jsonb, TRUE, 3);
SELECT public.schedule_background_job('bg_monday_status_sync', '0 * * * *', 'monday_status_sync', '{}'::jsonb, TRUE, 3);
SELECT public.schedule_background_job('bg_permit_sync', '*/30 * * * *', 'permit_sync', '{}'::jsonb, TRUE, 3);
SELECT public.schedule_background_job('bg_permit_detail_scrape', '*/10 * * * *', 'permit_detail_scrape', '{}'::jsonb, TRUE, 3);
SELECT public.schedule_background_job('bg_notifications_tick', '*/5 * * * *', 'notifications_tick', '{}'::jsonb, TRUE, 3);
