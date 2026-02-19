ALTER TABLE public.emails
ADD COLUMN IF NOT EXISTS body_link_scan_status TEXT DEFAULT 'pending';

ALTER TABLE public.emails
ADD COLUMN IF NOT EXISTS body_link_scanned_at TIMESTAMPTZ;

ALTER TABLE public.emails
ADD COLUMN IF NOT EXISTS body_link_scan_error TEXT;

ALTER TABLE public.emails
ADD COLUMN IF NOT EXISTS body_link_scan_links_found INTEGER DEFAULT 0;

ALTER TABLE public.emails
ADD COLUMN IF NOT EXISTS body_link_scan_attachments_added INTEGER DEFAULT 0;

ALTER TABLE public.emails
ADD COLUMN IF NOT EXISTS body_link_scan_attempts INTEGER DEFAULT 0;

ALTER TABLE public.emails
ADD COLUMN IF NOT EXISTS body_link_scan_version INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_emails_body_link_scan_status
ON public.emails (body_link_scan_status, body_link_scan_version, body_link_scanned_at);
