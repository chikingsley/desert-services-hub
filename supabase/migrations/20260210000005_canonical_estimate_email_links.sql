-- Canonical estimate ↔ email linking
--
-- We treat `estimate_emails` as the source of truth (many-to-many).
-- Any legacy `emails.estimate_id` links are migrated into `estimate_emails`
-- and the column is dropped.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'emails'
      AND column_name = 'estimate_id'
  ) THEN
    INSERT INTO public.estimate_emails (estimate_id, email_id, match_type, match_detail)
    SELECT
      e.estimate_id,
      e.id,
      'legacy_emails.estimate_id' AS match_type,
      'migrated from emails.estimate_id' AS match_detail
    FROM public.emails e
    WHERE e.estimate_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    ALTER TABLE public.emails
      DROP COLUMN IF EXISTS estimate_id;
  END IF;
END $$;

