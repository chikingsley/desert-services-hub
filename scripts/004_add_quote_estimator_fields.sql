-- Add estimator and date fields to quotes table
-- Run this migration to add the new fields for the quote editor header

-- Add quote_date field (defaults to current date)
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS quote_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Add estimator fields
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS estimator_name TEXT;

ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS estimator_email TEXT;

-- Add client_address (separate from job_address for billing)
ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS client_address TEXT;

-- Create index for date-based queries
CREATE INDEX IF NOT EXISTS idx_quotes_quote_date ON quotes(quote_date);
