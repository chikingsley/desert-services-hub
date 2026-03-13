CREATE TABLE IF NOT EXISTS email_relevance_reviews (
  id BIGSERIAL PRIMARY KEY,
  email_id BIGINT NOT NULL UNIQUE REFERENCES emails(id) ON DELETE CASCADE,
  run_status TEXT NOT NULL DEFAULT 'pending',
  review_status TEXT NOT NULL DEFAULT 'unreviewed',
  provider TEXT,
  model TEXT,
  prompt_version TEXT NOT NULL DEFAULT 'email_relevance_v1',
  is_work_related BOOLEAN,
  is_obviously_unrelated BOOLEAN,
  category TEXT,
  confidence DOUBLE PRECISION,
  reason TEXT,
  suggested_action TEXT,
  raw_result JSONB,
  error TEXT,
  review_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_relevance_reviews_review_status
  ON email_relevance_reviews (review_status);

CREATE INDEX IF NOT EXISTS idx_email_relevance_reviews_run_status
  ON email_relevance_reviews (run_status);

CREATE INDEX IF NOT EXISTS idx_email_relevance_reviews_created_at
  ON email_relevance_reviews (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_relevance_reviews_work_related
  ON email_relevance_reviews (is_work_related, is_obviously_unrelated);
