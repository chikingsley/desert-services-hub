-- Persist gated body-link download failures for manual follow-up.

CREATE TABLE IF NOT EXISTS public.body_link_manual_followups (
  id BIGSERIAL PRIMARY KEY,
  email_id INTEGER NOT NULL REFERENCES public.emails(id) ON DELETE CASCADE,
  mailbox_email TEXT NOT NULL,
  source TEXT NOT NULL,
  url TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  occurrences INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email_id, source, url)
);

DO $$
BEGIN
  ALTER TABLE public.body_link_manual_followups
  ADD CONSTRAINT body_link_manual_followups_status_check
  CHECK (status IN ('pending', 'resolved', 'dismissed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_body_link_manual_followups_status_seen
  ON public.body_link_manual_followups(status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_body_link_manual_followups_email
  ON public.body_link_manual_followups(email_id);
