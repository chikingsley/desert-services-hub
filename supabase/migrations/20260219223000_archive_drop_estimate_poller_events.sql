-- Archive legacy estimate poller event rows before removing the obsolete table.
DO $$
BEGIN
  IF to_regclass('public.estimate_poller_events') IS NULL THEN
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.estimate_poller_events_archive (
    id integer PRIMARY KEY,
    event_type text NOT NULL,
    estimate_name text,
    monday_item_id text,
    details jsonb,
    created_at timestamp with time zone,
    archived_at timestamp with time zone NOT NULL DEFAULT now()
  );

  INSERT INTO public.estimate_poller_events_archive (
    id,
    event_type,
    estimate_name,
    monday_item_id,
    details,
    created_at
  )
  SELECT
    id,
    event_type,
    estimate_name,
    monday_item_id,
    details,
    created_at
  FROM public.estimate_poller_events
  ON CONFLICT (id) DO NOTHING;

  DROP TABLE IF EXISTS public.estimate_poller_events;
END $$;
