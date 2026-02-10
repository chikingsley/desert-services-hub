-- Folder watcher state tables (used by apps/workers/outlook-folder-watcher)
--
-- Note: These tables were originally created ad-hoc. Keep them in migrations so
-- fresh environments match production.

CREATE TABLE IF NOT EXISTS folder_watcher_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracked_folders (
  id SERIAL PRIMARY KEY,
  folder_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  parent_folder_id TEXT NOT NULL,
  project_id INTEGER REFERENCES projects(id),
  messages_delta_link TEXT,
  message_count INTEGER DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS folder_watcher_events (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  folder_id TEXT,
  folder_name TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracked_folders_project ON tracked_folders(project_id);
CREATE INDEX IF NOT EXISTS idx_tracked_folders_parent ON tracked_folders(parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_folder_watcher_events_type ON folder_watcher_events(event_type);
CREATE INDEX IF NOT EXISTS idx_folder_watcher_events_created ON folder_watcher_events(created_at);

