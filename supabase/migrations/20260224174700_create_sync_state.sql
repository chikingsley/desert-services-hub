-- Sync state table for tracking incremental sync cursors (e.g., Monday activity log)
CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with a 24-hour lookback so the first incremental run has a starting point
INSERT INTO sync_state (key, value)
VALUES ('monday_estimating_last_sync', (now() - interval '24 hours')::text)
ON CONFLICT (key) DO NOTHING;
