-- Desert Services Hub - Takeoffs Tables
-- Phase 1: Store PDF takeoff data with annotations

-- Takeoffs table (the base document for measurements)
CREATE TABLE IF NOT EXISTS takeoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  pdf_url TEXT, -- URL to PDF (could be Supabase storage or public URL)
  pdf_storage_path TEXT, -- Path in Supabase storage bucket (if uploaded)
  annotations JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of TakeoffAnnotation objects
  page_scales JSONB NOT NULL DEFAULT '{}'::jsonb, -- Record<pageNumber, scaleId>
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'complete')),
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL, -- Optional link to quote
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_takeoffs_status ON takeoffs(status);
CREATE INDEX IF NOT EXISTS idx_takeoffs_quote_id ON takeoffs(quote_id);
CREATE INDEX IF NOT EXISTS idx_takeoffs_created_at ON takeoffs(created_at DESC);

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_takeoffs_updated_at ON takeoffs;
CREATE TRIGGER update_takeoffs_updated_at
  BEFORE UPDATE ON takeoffs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS (Row Level Security) - for future auth
ALTER TABLE takeoffs ENABLE ROW LEVEL SECURITY;

-- For now, allow all operations (no auth yet)
-- In production, replace with proper user-based policies
CREATE POLICY "Allow all takeoffs operations" ON takeoffs
  FOR ALL
  USING (true)
  WITH CHECK (true);
