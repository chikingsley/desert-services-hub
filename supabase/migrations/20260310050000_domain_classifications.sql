-- Domain-level LLM relevance classifications.
-- One verdict per domain. The sender-review UI shows these inline
-- and lets the operator approve (y) or skip (n) with a single key.
CREATE TABLE IF NOT EXISTS domain_classifications (
  domain       TEXT PRIMARY KEY,
  is_work_related   BOOLEAN NOT NULL,
  category     TEXT,        -- work_related, marketing, newsletter, spam, etc.
  confidence   DOUBLE PRECISION,
  reason       TEXT,
  provider     TEXT,
  model        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
