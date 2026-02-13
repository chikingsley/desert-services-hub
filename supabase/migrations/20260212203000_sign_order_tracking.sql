-- Sign order tracking (Sandstorm drafts + lifecycle)

CREATE TABLE IF NOT EXISTS sign_orders (
  id BIGSERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  project_name TEXT NOT NULL,
  sign_type TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  permit_id TEXT REFERENCES dust_permits_filed_by_desert_services(id) ON DELETE SET NULL,
  noi_azc TEXT,
  vendor_email TEXT NOT NULL DEFAULT 'kelli@sandstormsign.com',
  requested_by_email TEXT NOT NULL,
  mailbox_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  sign_details TEXT NOT NULL,
  draft_id TEXT,
  message_id TEXT,
  status TEXT NOT NULL DEFAULT 'drafted' CHECK (
    status IN ('drafted', 'sent', 'fulfilled', 'cancelled')
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sign_orders_project
  ON sign_orders(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sign_orders_status
  ON sign_orders(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sign_orders_permit
  ON sign_orders(permit_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sign_orders_draft_id
  ON sign_orders(draft_id)
  WHERE draft_id IS NOT NULL;
