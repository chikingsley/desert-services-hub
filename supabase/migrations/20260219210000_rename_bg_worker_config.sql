-- Rename legacy estimate-poller checkpoint table to neutral worker naming.
-- Also prune stale keys from retired estimate-poller code paths.

DO $$
BEGIN
  IF to_regclass('public.background_worker_config') IS NULL THEN
    IF to_regclass('public.estimate_poller_config') IS NOT NULL THEN
      ALTER TABLE public.estimate_poller_config
        RENAME TO background_worker_config;
    ELSE
      CREATE TABLE public.background_worker_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    END IF;
  ELSIF to_regclass('public.estimate_poller_config') IS NOT NULL THEN
    INSERT INTO public.background_worker_config (key, value)
    SELECT key, value
    FROM public.estimate_poller_config
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value;

    DROP TABLE public.estimate_poller_config;
  END IF;
END $$;

DELETE FROM public.background_worker_config
WHERE key IN (
  'last_fetched',
  'last_sync_at',
  'last_upserted'
);
