-- Add internal team contact support to canonical contacts table.
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS contact_type TEXT NOT NULL DEFAULT 'external',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS employment_start_date DATE,
  ADD COLUMN IF NOT EXISTS employment_end_date DATE,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_source TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contacts_contact_type_check'
      AND conrelid = 'public.contacts'::regclass
  ) THEN
    ALTER TABLE public.contacts
      ADD CONSTRAINT contacts_contact_type_check
      CHECK (contact_type IN ('external', 'internal_team', 'client', 'vendor', 'agency', 'other'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contacts_contact_type ON public.contacts(contact_type);
CREATE INDEX IF NOT EXISTS idx_contacts_is_active ON public.contacts(is_active);
CREATE INDEX IF NOT EXISTS idx_contacts_contact_type_active ON public.contacts(contact_type, is_active);
