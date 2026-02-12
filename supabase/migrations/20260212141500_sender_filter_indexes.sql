-- Functional indexes to accelerate sender filters in /api/emails fallback path.

CREATE INDEX IF NOT EXISTS idx_emails_from_email_lower_active
ON public.emails (lower(from_email))
WHERE is_excluded = 0;

CREATE INDEX IF NOT EXISTS idx_emails_real_sender_email_lower_active
ON public.emails (lower(real_sender_email))
WHERE is_excluded = 0;

CREATE INDEX IF NOT EXISTS idx_emails_original_sender_email_lower_active
ON public.emails (lower(original_sender_email))
WHERE is_excluded = 0;
