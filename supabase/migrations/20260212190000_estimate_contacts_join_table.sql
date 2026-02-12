-- Canonical estimate ↔ contact links
--
-- Contacts can belong to multiple estimates and estimates can have multiple
-- contacts, so this must be modeled as a many-to-many table.

CREATE TABLE IF NOT EXISTS public.estimate_contacts (
  estimate_id INTEGER NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (estimate_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_estimate_contacts_estimate
  ON public.estimate_contacts(estimate_id);

CREATE INDEX IF NOT EXISTS idx_estimate_contacts_contact
  ON public.estimate_contacts(contact_id);
